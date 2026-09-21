interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  ALLOWED_ORIGINS: string
  AUTH_PEPPER: string
}

type UserRow = {
  id: string
  email: string
  password_hash: string
}

type SessionUser = {
  id: string
  email: string
}

type WorkspaceMeta = {
  revision: number
  chunk_count: number
  updated_at: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const AUTH_WINDOW_MS = 10 * 60 * 1000
const AUTH_ATTEMPTS = 10
const CHUNK_BYTES = 1_500_000
const MAX_WORKSPACE_BYTES = 24_000_000
const MAX_IMAGE_BYTES = 12_000_000
const IMAGE_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
])

function securityHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }
}

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders(), ...extra },
  })
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (!origin) return ''
  const allowed = new Set(
    env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
  return allowed.has(origin.replace(/\/$/, '')) ? origin : null
}

function withCors(response: Response, origin: string) {
  const headers = new Headers(response.headers)
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
  return new Response(response.body, { status: response.status, headers })
}

async function readJson(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > maxBytes) throw new ApiError(413, '请求内容过大。')
  const raw = await request.text()
  if (encoder.encode(raw).byteLength > maxBytes) throw new ApiError(413, '请求内容过大。')
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new ApiError(400, '请求不是有效的 JSON。')
  }
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new ApiError(400, '请输入邮箱地址。')
  const email = value.trim().toLocaleLowerCase('en-US')
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new ApiError(400, '邮箱格式不正确。')
  return email
}

function validatePasswordProof(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new ApiError(400, '密码证明格式不正确，请刷新页面后重试。')
  return value
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toBase64Url(new Uint8Array(digest))
}

async function proofHmac(
  proof: string,
  email: string,
  salt: Uint8Array,
  pepper: string,
) {
  if (pepper.length < 32) throw new ApiError(503, '服务认证密钥尚未配置。')
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const emailBytes = encoder.encode(email)
  const proofBytes = fromBase64Url(proof)
  const input = new Uint8Array(salt.length + emailBytes.length + 1 + proofBytes.length)
  input.set(salt)
  input.set(emailBytes, salt.length)
  input[salt.length + emailBytes.length] = 0
  input.set(proofBytes, salt.length + emailBytes.length + 1)
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, input))
}

async function hashPasswordProof(proof: string, email: string, pepper: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await proofHmac(proof, email, salt, pepper)
  return `proof-hmac-sha256$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

async function verifyPasswordProof(
  proof: string,
  email: string,
  pepper: string,
  record: string,
) {
  const [algorithm, saltText, expectedText] = record.split('$')
  if (algorithm !== 'proof-hmac-sha256' || !saltText || !expectedText) return false
  const actual = await proofHmac(proof, email, fromBase64Url(saltText), pepper)
  const expected = fromBase64Url(expectedText)
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index]
  return difference === 0
}

async function rateLimit(request: Request, env: Env, route: string) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const key = await sha256(`${route}:${ip}`)
  const now = Date.now()
  const row = await env.DB.prepare(
    'SELECT window_started, attempt_count FROM auth_limits WHERE key = ?',
  )
    .bind(key)
    .first<{ window_started: number; attempt_count: number }>()
  if (row && now - row.window_started < AUTH_WINDOW_MS) {
    if (row.attempt_count >= AUTH_ATTEMPTS)
      throw new ApiError(429, '尝试次数过多，请稍后再试。', {
        retryAfter: Math.ceil((AUTH_WINDOW_MS - (now - row.window_started)) / 1000),
      })
    await env.DB.prepare('UPDATE auth_limits SET attempt_count = attempt_count + 1 WHERE key = ?')
      .bind(key)
      .run()
  } else {
    await env.DB.prepare(
      'INSERT INTO auth_limits (key, window_started, attempt_count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_started = excluded.window_started, attempt_count = 1',
    )
      .bind(key, now)
      .run()
  }
  return key
}

async function createSession(env: Env, user: SessionUser) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256(token)
  const now = Date.now()
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(tokenHash, user.id, now + SESSION_MS, now, now)
    .run()
  return { token, user }
}

async function authenticate(request: Request, env: Env, ctx: ExecutionContext) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new ApiError(401, '请先登录。')
  const tokenHash = await sha256(match[1])
  const now = Date.now()
  const user = await env.DB.prepare(
    'SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  )
    .bind(tokenHash, now)
    .first<SessionUser>()
  if (!user) throw new ApiError(401, '登录已过期，请重新登录。')
  ctx.waitUntil(
    env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?')
      .bind(now, tokenHash)
      .run(),
  )
  return { user, tokenHash }
}

function validWorkspace(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const workspace = value as Record<string, unknown>
  return (
    workspace.version === 1 &&
    Array.isArray(workspace.notes) &&
    Array.isArray(workspace.cards) &&
    Array.isArray(workspace.folders) &&
    Array.isArray(workspace.reviewLog)
  )
}

function chunkUtf8(value: string) {
  const bytes = encoder.encode(value)
  if (bytes.byteLength > MAX_WORKSPACE_BYTES)
    throw new ApiError(413, '云端工作区超过 24 MB，请删除或压缩较大的图片后重试。')
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; ) {
    let end = Math.min(offset + CHUNK_BYTES, bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    chunks.push(decoder.decode(bytes.subarray(offset, end)))
    offset = end
  }
  return chunks
}

async function register(request: Request, env: Env) {
  const limitKey = await rateLimit(request, env, 'register')
  const body = (await readJson(request, 16_384)) as Record<string, unknown>
  const email = normalizeEmail(body.email)
  const passwordProof = validatePasswordProof(body.passwordProof)
  const id = crypto.randomUUID()
  const passwordHash = await hashPasswordProof(passwordProof, email, env.AUTH_PEPPER)
  const now = Date.now()
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(id, email, passwordHash, now)
      .run()
  } catch (error) {
    if (String(error).toLocaleLowerCase().includes('unique'))
      throw new ApiError(409, '这个邮箱已经注册，请直接登录。')
    throw error
  }
  await env.DB.prepare('DELETE FROM auth_limits WHERE key = ?').bind(limitKey).run()
  return json(await createSession(env, { id, email }), 201)
}

async function login(request: Request, env: Env) {
  const limitKey = await rateLimit(request, env, 'login')
  const body = (await readJson(request, 16_384)) as Record<string, unknown>
  const email = normalizeEmail(body.email)
  const passwordProof = validatePasswordProof(body.passwordProof)
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ?',
  )
    .bind(email)
    .first<UserRow>()
  if (
    !user ||
    !(await verifyPasswordProof(passwordProof, user.email, env.AUTH_PEPPER, user.password_hash))
  )
    throw new ApiError(401, '邮箱或密码不正确。')
  await env.DB.prepare('DELETE FROM auth_limits WHERE key = ?').bind(limitKey).run()
  return json(await createSession(env, { id: user.id, email: user.email }))
}

async function getWorkspace(user: SessionUser, env: Env) {
  const meta = await env.DB.prepare(
    'SELECT revision, chunk_count, updated_at FROM workspaces WHERE user_id = ?',
  )
    .bind(user.id)
    .first<WorkspaceMeta>()
  if (!meta) return json({ workspace: null, revision: 0, updatedAt: null })
  const result = await env.DB.prepare(
    'SELECT content FROM workspace_chunks WHERE user_id = ? ORDER BY chunk_index ASC',
  )
    .bind(user.id)
    .all<{ content: string }>()
  if (result.results.length !== meta.chunk_count)
    throw new ApiError(500, '云端数据不完整，请稍后重试。')
  const raw = result.results.map((row) => row.content).join('')
  return json({ workspace: JSON.parse(raw), revision: meta.revision, updatedAt: meta.updated_at })
}

async function getImage(id: string, env: Env) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(id)) throw new ApiError(404, '图片不存在。')
  const record = await env.DB.prepare(
    'SELECT object_key, content_type FROM images WHERE public_id = ?',
  )
    .bind(id)
    .first<{ object_key: string; content_type: string }>()
  if (!record) throw new ApiError(404, '图片不存在。')
  const object = await env.IMAGES.get(record.object_key)
  if (!object || !('body' in object)) throw new ApiError(404, '图片不存在。')
  const headers = new Headers({
    'Content-Type': record.content_type,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: object.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  })
  return new Response(object.body, { headers })
}

async function uploadImage(request: Request, user: SessionUser, env: Env) {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || ''
  const extension = IMAGE_TYPES.get(contentType)
  if (!extension) throw new ApiError(415, '请上传 PNG、JPEG、GIF、WebP 或 AVIF 图片。')
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_IMAGE_BYTES) throw new ApiError(413, '图片不能超过 12 MB。')
  const content = await request.arrayBuffer()
  if (!content.byteLength || content.byteLength > MAX_IMAGE_BYTES)
    throw new ApiError(413, '图片为空或超过 12 MB。')

  const publicId = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const objectKey = `${user.id}/${publicId}.${extension}`
  await env.IMAGES.put(objectKey, content, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: { owner: user.id },
  })
  try {
    await env.DB.prepare(
      'INSERT INTO images (public_id, user_id, object_key, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(publicId, user.id, objectKey, contentType, content.byteLength, Date.now())
      .run()
  } catch (error) {
    await env.IMAGES.delete(objectKey)
    throw error
  }
  const url = new URL(request.url)
  return json({ src: `${url.origin}/v1/images/${publicId}`, id: publicId }, 201)
}

function referencedImages(workspace: Record<string, unknown>) {
  const ids = new Set<string>()
  const notes = Array.isArray(workspace.notes) ? workspace.notes : []
  for (const note of notes) {
    const html =
      note && typeof note === 'object' && typeof (note as { html?: unknown }).html === 'string'
        ? (note as { html: string }).html
        : ''
    for (const match of html.matchAll(/\/v1\/images\/([A-Za-z0-9_-]{40,64})/g)) ids.add(match[1])
  }
  return ids
}

async function cleanupUnusedImages(userId: string, referenced: Set<string>, env: Env) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const result = await env.DB.prepare(
    'SELECT public_id, object_key FROM images WHERE user_id = ? AND created_at < ? LIMIT 500',
  )
    .bind(userId, cutoff)
    .all<{ public_id: string; object_key: string }>()
  const stale = result.results.filter((image) => !referenced.has(image.public_id))
  if (!stale.length) return
  await env.IMAGES.delete(stale.map((image) => image.object_key))
  for (let offset = 0; offset < stale.length; offset += 50) {
    const group = stale.slice(offset, offset + 50)
    await env.DB.batch(
      group.map((image) =>
        env.DB.prepare('DELETE FROM images WHERE public_id = ? AND user_id = ?').bind(
          image.public_id,
          userId,
        ),
      ),
    )
  }
}

async function putWorkspace(
  request: Request,
  user: SessionUser,
  env: Env,
  ctx: ExecutionContext,
) {
  const body = (await readJson(request, MAX_WORKSPACE_BYTES + 1_000_000)) as Record<
    string,
    unknown
  >
  if (!validWorkspace(body.workspace)) throw new ApiError(400, '工作区数据格式不正确。')
  const baseRevision = body.baseRevision
  if (baseRevision !== null && (!Number.isInteger(baseRevision) || Number(baseRevision) < 0))
    throw new ApiError(400, '同步版本不正确。')

  const current = await env.DB.prepare('SELECT revision FROM workspaces WHERE user_id = ?')
    .bind(user.id)
    .first<{ revision: number }>()
  const currentRevision = current?.revision ?? 0
  if (current && baseRevision !== currentRevision)
    throw new ApiError(409, '云端已有更新，请先合并后重试。', {
      revision: currentRevision,
      code: 'revision_conflict',
    })
  if (!current && baseRevision !== null && baseRevision !== 0)
    throw new ApiError(409, '云端版本已变化，请重新同步。', {
      revision: 0,
      code: 'revision_conflict',
    })

  const serialized = JSON.stringify(body.workspace)
  if (/data:image\//i.test(serialized))
    throw new ApiError(422, '请先将笔记中的本地图片上传到 R2。')
  const chunks = chunkUtf8(serialized)
  const revision = currentRevision + 1
  const updatedAt = Date.now()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM workspace_chunks WHERE user_id = ?').bind(user.id),
    ...chunks.map((content, index) =>
      env.DB.prepare(
        'INSERT INTO workspace_chunks (user_id, chunk_index, content) VALUES (?, ?, ?)',
      ).bind(user.id, index, content),
    ),
    env.DB.prepare(
      'INSERT INTO workspaces (user_id, revision, chunk_count, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, chunk_count = excluded.chunk_count, updated_at = excluded.updated_at',
    ).bind(user.id, revision, chunks.length, updatedAt),
  ]
  await env.DB.batch(statements)
  ctx.waitUntil(cleanupUnusedImages(user.id, referencedImages(body.workspace), env))
  return json({ revision, updatedAt })
}

async function route(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '') || '/'
  if (request.method === 'GET' && path === '/health')
    return json({ ok: true, service: 'orion-note-learn-sync' })
  const imageMatch = path.match(/^\/v1\/images\/([A-Za-z0-9_-]+)$/)
  if (request.method === 'GET' && imageMatch) return getImage(imageMatch[1], env)
  if (request.method === 'POST' && path === '/v1/auth/register') return register(request, env)
  if (request.method === 'POST' && path === '/v1/auth/login') return login(request, env)

  const session = await authenticate(request, env, ctx)
  if (request.method === 'GET' && path === '/v1/me') return json({ user: session.user })
  if (request.method === 'DELETE' && path === '/v1/auth/session') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run()
    return json({ ok: true })
  }
  if (request.method === 'POST' && path === '/v1/images')
    return uploadImage(request, session.user, env)
  if (request.method === 'GET' && path === '/v1/workspace')
    return getWorkspace(session.user, env)
  if (request.method === 'PUT' && path === '/v1/workspace')
    return putWorkspace(request, session.user, env, ctx)
  throw new ApiError(404, '接口不存在。')
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const english = request.headers.get('Accept-Language')?.toLowerCase().startsWith('en') ?? false
    const origin = allowedOrigin(request, env)
    if (origin === null) return json({ error: '不允许的请求来源。' }, 403)
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin)
    try {
      return withCors(await route(request, env, ctx), origin)
    } catch (error) {
      if (error instanceof ApiError) {
        const headers: Record<string, string> =
          error.status === 429 && typeof error.details?.retryAfter === 'number'
            ? { 'Retry-After': String(error.details.retryAfter) }
            : {}
        return withCors(
          json(
            {
              error: english ? englishErrors[error.message] || error.message : error.message,
              ...(error.details || {}),
            },
            error.status,
            headers,
          ),
          origin,
        )
      }
      console.error(error)
      return withCors(
        json(
          {
            error: english
              ? 'The service is temporarily unavailable. Please try again.'
              : '服务暂时不可用，请稍后重试。',
          },
          500,
        ),
        origin,
      )
    }
  },
} satisfies ExportedHandler<Env>

const englishErrors: Record<string, string> = {
  '请求内容过大。': 'The request is too large.',
  '请求不是有效的 JSON。': 'The request is not valid JSON.',
  '请输入邮箱地址。': 'Enter your email address.',
  '邮箱格式不正确。': 'Enter a valid email address.',
  '密码证明格式不正确，请刷新页面后重试。':
    'The password proof is invalid. Refresh the page and try again.',
  '服务认证密钥尚未配置。': 'The authentication secret is not configured.',
  '尝试次数过多，请稍后再试。': 'Too many attempts. Please try again later.',
  '这个邮箱已经注册，请直接登录。': 'This email is already registered. Sign in instead.',
  '邮箱或密码不正确。': 'The email or password is incorrect.',
  '请先登录。': 'Sign in first.',
  '登录已过期，请重新登录。': 'Your session has expired. Sign in again.',
  '云端数据不完整，请稍后重试。': 'Cloud data is incomplete. Please try again.',
  '图片不存在。': 'Image not found.',
  '请上传 PNG、JPEG、GIF、WebP 或 AVIF 图片。':
    'Upload a PNG, JPEG, GIF, WebP, or AVIF image.',
  '图片不能超过 12 MB。': 'Images must be 12 MB or smaller.',
  '图片为空或超过 12 MB。': 'The image is empty or larger than 12 MB.',
  '工作区数据格式不正确。': 'The workspace data is invalid.',
  '同步版本不正确。': 'The sync revision is invalid.',
  '云端已有更新，请先合并后重试。':
    'A newer cloud version exists. Merge it before trying again.',
  '云端版本已变化，请重新同步。': 'The cloud version changed. Sync again.',
  '请先将笔记中的本地图片上传到 R2。':
    'Upload local note images to R2 before syncing.',
  '云端工作区超过 24 MB，请删除或压缩较大的图片后重试。':
    'The cloud workspace exceeds 24 MB. Remove or compress large images and try again.',
  '接口不存在。': 'Endpoint not found.',
  '不允许的请求来源。': 'This request origin is not allowed.',
}
