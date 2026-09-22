import type { Card, Note, Workspace } from './domain'
import { workspaceSchema } from './domain'
import { seedWorkspace } from './seed'
import { currentLanguage } from './i18n'

const SESSION_KEY = 'orion-cloud-session'
const configuredUrl = (import.meta.env.VITE_SYNC_API_URL || '').replace(/\/$/, '')
const PASSWORD_ITERATIONS = 210_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type CloudUser = { id: string; email: string }
export type CloudSession = { token: string; user: CloudUser; vaultKey: string }
export type RemoteWorkspace = {
  workspace: Workspace | null
  revision: number
  updatedAt: number | null
  encrypted: boolean
}

type EncryptedWorkspace = {
  version: 1
  encryption: 'aes-256-gcm-v1'
  iv: string
  ciphertext: string
}

export type PublicShare = {
  id: string
  title: string
  html: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = '',
  ) {
    super(message)
  }
}

export function cloudApiUrl() {
  if (configuredUrl) return configuredUrl
  return import.meta.env.DEV ? 'http://localhost:8787' : ''
}

function message(chinese: string, english: string) {
  return currentLanguage() === 'zh' ? chinese : english
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function passwordMaterial(email: string, password: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const proofBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: encoder.encode(`orion-note-learn:${email}`),
        iterations: PASSWORD_ITERATIONS,
      },
      material,
      256,
    ),
  )
  const hkdf = await crypto.subtle.importKey('raw', proofBits, 'HKDF', false, ['deriveBits'])
  const vaultBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('orion-note-learn:vault:v1'),
        info: encoder.encode(email),
      },
      hkdf,
      256,
    ),
  )
  return {
    passwordProof: toBase64Url(proofBits),
    vaultKey: toBase64Url(vaultBits),
  }
}

function isEncryptedWorkspace(value: unknown): value is EncryptedWorkspace {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  return (
    envelope.version === 1 &&
    envelope.encryption === 'aes-256-gcm-v1' &&
    typeof envelope.iv === 'string' &&
    /^[A-Za-z0-9_-]{16}$/.test(envelope.iv) &&
    typeof envelope.ciphertext === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)
  )
}

async function vaultKey(session: CloudSession, usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    'raw',
    fromBase64Url(session.vaultKey),
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  )
}

async function encryptWorkspace(session: CloudSession, workspace: Workspace): Promise<EncryptedWorkspace> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await vaultKey(session, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`orion-note-learn:workspace:v1:${session.user.id}`),
      },
      key,
      encoder.encode(JSON.stringify(workspace)),
    ),
  )
  return {
    version: 1,
    encryption: 'aes-256-gcm-v1',
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
  }
}

async function decryptWorkspace(session: CloudSession, envelope: EncryptedWorkspace) {
  try {
    const key = await vaultKey(session, ['decrypt'])
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.iv),
        additionalData: encoder.encode(`orion-note-learn:workspace:v1:${session.user.id}`),
      },
      key,
      fromBase64Url(envelope.ciphertext),
    )
    return workspaceSchema.parse(JSON.parse(decoder.decode(plaintext)))
  } catch {
    throw new CloudApiError(
      message(
        '无法解锁端到端加密的笔记。请退出后使用正确密码重新登录。',
        'Your end-to-end encrypted notes could not be unlocked. Sign out and sign in again with the correct password.',
      ),
      423,
      'VAULT_LOCKED',
    )
  }
}

export function loadCloudSession(): CloudSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as CloudSession | null
    if (
      value &&
      typeof value.token === 'string' &&
      typeof value.user?.id === 'string' &&
      typeof value.user?.email === 'string' &&
      typeof value.vaultKey === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(value.vaultKey)
    )
      return value
    if (value) localStorage.removeItem(SESSION_KEY)
  } catch {
    /* A malformed or pre-E2EE local session is treated as signed out. */
  }
  return null
}

export function storeCloudSession(session: CloudSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearCloudSession() {
  localStorage.removeItem(SESSION_KEY)
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  session: CloudSession | null = loadCloudSession(),
) {
  const baseUrl = cloudApiUrl()
  if (!baseUrl)
    throw new CloudApiError(message('尚未配置云同步服务地址。', 'Cloud sync is not configured.'))
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        'Accept-Language': currentLanguage() === 'zh' ? 'zh-CN' : 'en',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new CloudApiError(
      message(
        '暂时无法连接云同步服务，请检查网络后重试。',
        'Cloud sync could not be reached. Check your connection and try again.',
      ),
    )
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
  } & T
  if (!response.ok)
    throw new CloudApiError(
      body.error || message('云同步请求失败。', 'Cloud sync request failed.'),
      response.status,
      body.code,
    )
  return body
}

export async function authenticateCloud(
  mode: 'login' | 'register',
  email: string,
  password: string,
) {
  if (password.length < 10 || password.length > 128)
    throw new CloudApiError(
      message('密码需要 10–128 个字符。', 'Password must be 10–128 characters.'),
      400,
    )
  const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
  const { passwordProof, vaultKey } = await passwordMaterial(normalizedEmail, password)
  const remote = await request<Omit<CloudSession, 'vaultKey'>>(`/v1/auth/${mode}`, {
    method: 'POST',
    body: JSON.stringify({ email: normalizedEmail, passwordProof }),
  }, null)
  const session: CloudSession = { ...remote, vaultKey }
  storeCloudSession(session)
  return session
}

export async function verifyCloudSession(session: CloudSession) {
  const result = await request<{ user: CloudUser }>('/v1/me', {}, session)
  const next = { ...session, user: result.user }
  storeCloudSession(next)
  return next
}

export async function fetchCloudWorkspace(session: CloudSession): Promise<RemoteWorkspace> {
  const result = await request<{
    workspace: unknown
    revision: number
    updatedAt: number | null
  }>('/v1/workspace', {}, session)
  if (!result.workspace)
    return { ...result, workspace: null, encrypted: false }

  if (isEncryptedWorkspace(result.workspace))
    return {
      ...result,
      workspace: await decryptWorkspace(session, result.workspace),
      encrypted: true,
    }

  return {
    ...result,
    workspace: workspaceSchema.parse(result.workspace),
    encrypted: false,
  }
}

export async function saveCloudWorkspace(
  session: CloudSession,
  workspace: Workspace,
  baseRevision: number | null,
) {
  const encrypted = await encryptWorkspace(session, workspace)
  return request<{ revision: number; updatedAt: number }>(
    '/v1/workspace',
    {
      method: 'PUT',
      body: JSON.stringify({ workspace: encrypted, baseRevision }),
    },
    session,
  )
}

export async function publishPublicShare(session: CloudSession, note: Note) {
  return request<{ id: string; updatedAt: number }>(
    '/v1/shares',
    {
      method: 'POST',
      body: JSON.stringify({
        noteId: note.id,
        title: note.title,
        html: note.html,
        tags: note.tags,
      }),
    },
    session,
  )
}

export async function fetchPublicShare(id: string) {
  return request<PublicShare>(`/v1/shares/${encodeURIComponent(id)}`, {}, null)
}

export async function revokePublicShare(session: CloudSession, id: string) {
  return request<{ ok: true }>(
    `/v1/shares/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    session,
  )
}

export async function uploadCloudImage(session: CloudSession, image: Blob) {
  return request<{ src: string; id: string }>(
    '/v1/images',
    {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    },
    session,
  )
}

export async function migrateWorkspaceImages(workspace: Workspace, session: CloudSession) {
  const next = structuredClone(workspace)
  const uploaded = new Map<string, string>()
  let changed = false
  for (const note of next.notes) {
    if (!note.html.includes('data:image/')) continue
    const doc = new DOMParser().parseFromString(note.html, 'text/html')
    const images = [...doc.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]')]
    for (const image of images) {
      const source = image.src
      let remote = uploaded.get(source)
      if (!remote) {
        const blob = await fetch(source).then((response) => response.blob())
        remote = (await uploadCloudImage(session, blob)).src
        uploaded.set(source, remote)
      }
      image.src = remote
      changed = true
    }
    if (images.length) {
      note.html = doc.body.innerHTML
      note.updatedAt = Date.now()
    }
  }
  return { workspace: next, changed }
}

export async function endCloudSession(session: CloudSession) {
  try {
    await request('/v1/auth/session', { method: 'DELETE' }, session)
  } finally {
    clearCloudSession()
  }
}

function sameStarterNote(note: Note, starter: Note) {
  return (
    note.id === starter.id &&
    note.title === starter.title &&
    note.html === starter.html &&
    note.folder === starter.folder &&
    note.favorite === starter.favorite &&
    JSON.stringify(note.tags) === JSON.stringify(starter.tags) &&
    note.strokes.length === 0 &&
    !note.deletedAt
  )
}

export function isStarterWorkspace(workspace: Workspace) {
  const starter = seedWorkspace()
  return (
    workspace.notes.length === starter.notes.length &&
    workspace.cards.length === starter.cards.length &&
    workspace.reviewLog.length === 0 &&
    starter.notes.every((note) => {
      const current = workspace.notes.find((item) => item.id === note.id)
      return current ? sameStarterNote(current, note) : false
    }) &&
    starter.cards.every((card) => {
      const current = workspace.cards.find((item) => item.id === card.id)
      return (
        current?.question === card.question &&
        current.answer === card.answer &&
        current.reviews === 0 &&
        current.interval === 0
      )
    })
  )
}

function mergeNotes(local: Note[], remote: Note[]) {
  const notes = new Map(remote.map((note) => [note.id, note]))
  for (const note of local) {
    const cloud = notes.get(note.id)
    if (!cloud || note.updatedAt > cloud.updatedAt) notes.set(note.id, note)
  }
  return [...notes.values()]
}

function preferredCard(local: Card, remote: Card) {
  if (local.reviews !== remote.reviews) return local.reviews > remote.reviews ? local : remote
  if (local.due !== remote.due) return local.due > remote.due ? local : remote
  return local
}

function mergeCards(local: Card[], remote: Card[]) {
  const cards = new Map(remote.map((card) => [card.id, card]))
  for (const card of local) {
    const cloud = cards.get(card.id)
    cards.set(card.id, cloud ? preferredCard(card, cloud) : card)
  }
  return [...cards.values()]
}

export function mergeWorkspaces(local: Workspace, remote: Workspace) {
  if (isStarterWorkspace(local)) return remote
  return workspaceSchema.parse({
    version: 1,
    notes: mergeNotes(local.notes, remote.notes),
    cards: mergeCards(local.cards, remote.cards),
    folders: [...new Set([...remote.folders, ...local.folders])],
    reviewLog: [...new Set([...remote.reviewLog, ...local.reviewLog])]
      .sort((left, right) => left - right)
      .slice(-100_000),
  })
}
