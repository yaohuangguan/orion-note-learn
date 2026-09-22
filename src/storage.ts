import { openDB } from 'idb'
import DOMPurify from 'dompurify'
import { workspaceSchema, type Workspace } from './domain'
import { seedWorkspace } from './seed'
import { PRIVATE_IMAGE_ATTR } from './private-images'

const db = openDB('orion-note-learn', 1, {
  upgrade(db) {
    db.createObjectStore('workspace')
  },
})
function safeImageSource(src: string) {
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(src)) return true
  const cloud = import.meta.env.VITE_SYNC_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')
  if (!cloud) return false
  try {
    const source = new URL(src)
    const service = new URL(cloud)
    return (
      source.origin === service.origin &&
      /^\/v1\/images\/[A-Za-z0-9_-]{40,64}$/.test(source.pathname)
    )
  } catch {
    return false
  }
}
export async function loadWorkspace(): Promise<Workspace> {
  const saved = await (await db).get('workspace', 'data')
  return saved ? sanitizeWorkspace(workspaceSchema.parse(saved)) : seedWorkspace()
}
let writes = Promise.resolve()
export function saveWorkspace(data: Workspace) {
  const next = writes
    .catch(() => {})
    .then(async () => {
      await (await db).put('workspace', data, 'data')
    })
  writes = next
  return next
}
export function sanitizeHtml(html: string) {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: [
      'data-type',
      'data-latex',
      PRIVATE_IMAGE_ATTR,
      'src',
      'alt',
      'title',
      'width',
      'height',
      'crossorigin',
    ],
    FORBID_TAGS: ['video', 'audio', 'iframe', 'style', 'form', 'input', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src') || ''
    if (!safeImageSource(src)) image.remove()
  })
  return doc.body.innerHTML
}
export function sanitizeWorkspace(data: Workspace): Workspace {
  return { ...data, notes: data.notes.map((n) => ({ ...n, html: sanitizeHtml(n.html) })) }
}
export function htmlText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll<HTMLElement>('[data-type="inline-math"], [data-type="block-math"]').forEach((el) => {
    const latex = el.dataset.latex?.trim()
    if (latex) el.replaceWith(doc.createTextNode(`$${latex}$`))
  })
  doc.querySelectorAll('img').forEach((image) => {
    image.replaceWith(doc.createTextNode(image.alt ? `[图片：${image.alt}]` : '[图片]'))
  })
  doc.querySelectorAll('p,h1,h2,h3,li,blockquote,pre').forEach((el) => el.append('\n'))
  return doc.body.textContent?.trim() || ''
}
export function download(content: BlobPart, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
export function safeName(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 100)
      .trim() || 'Orion笔记'
  )
}
