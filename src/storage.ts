import { openDB } from 'idb'
import DOMPurify from 'dompurify'
import { workspaceSchema, type Workspace } from './domain'
import { seedWorkspace } from './seed'

const db = openDB('orion-note-learn', 1, {
  upgrade(db) {
    db.createObjectStore('workspace')
  },
})
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
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'style', 'form', 'input'],
    FORBID_ATTR: ['style'],
  })
}
export function sanitizeWorkspace(data: Workspace): Workspace {
  return { ...data, notes: data.notes.map((n) => ({ ...n, html: sanitizeHtml(n.html) })) }
}
export function htmlText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
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
