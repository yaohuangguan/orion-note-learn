import { z } from 'zod'

export const pointSchema = z.object({
  x: z.number().min(0).max(1200),
  y: z.number().min(0).max(900),
  pressure: z.number().min(0).max(1),
})
export const strokeSchema = z.object({
  id: z.string(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().min(1).max(32),
  points: z.array(pointSchema).max(20000),
})
export const cardSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  question: z.string().min(1).max(4000),
  answer: z.string().min(1).max(10000),
  due: z.number().finite().min(0),
  interval: z.number().finite().min(0).max(36500),
  reviews: z.number().int().min(0),
})
export const noteSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  html: z.string().max(2000000),
  folder: z.string().max(100),
  tags: z.array(z.string().max(50)).max(20),
  favorite: z.boolean(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  strokes: z.array(strokeSchema).max(10000),
  deletedAt: z.number().finite().optional(),
})
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    notes: z.array(noteSchema).max(5000),
    cards: z.array(cardSchema).max(50000),
    folders: z.array(z.string().min(1).max(100)).max(500),
    reviewLog: z.array(z.number().finite()).max(100000),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.notes.map((n) => n.id)).size !== data.notes.length)
      ctx.addIssue({ code: 'custom', message: '笔记 ID 重复' })
    if (new Set(data.cards.map((c) => c.id)).size !== data.cards.length)
      ctx.addIssue({ code: 'custom', message: '闪卡 ID 重复' })
    const ids = new Set(data.notes.map((n) => n.id))
    if (data.cards.some((c) => !ids.has(c.noteId)))
      ctx.addIssue({ code: 'custom', message: '闪卡缺少对应笔记' })
  })
export type Note = z.infer<typeof noteSchema>
export type Stroke = z.infer<typeof strokeSchema>
export type Card = z.infer<typeof cardSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type AISettings = { provider: string; baseUrl: string; model: string; apiKey: string }
export const providers = [
  {
    id: 'orion-free',
    name: 'Orion Free',
    baseUrl: '',
    model: '@cf/zai-org/glm-4.7-flash',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  { id: 'custom', name: '自定义兼容接口', baseUrl: '', model: '' },
]
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-')
}
export function newNote(folder = '我的笔记'): Note {
  return {
    id: uid(),
    title: '无标题笔记',
    html: '<p></p>',
    folder,
    tags: [],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    strokes: [],
  }
}
export function scheduleCard(
  card: Card,
  rating: 'again' | 'good' | 'easy',
  now = Date.now(),
): Card {
  const interval =
    rating === 'again'
      ? 0
      : rating === 'easy'
        ? Math.max(4, Math.round(card.interval * 2.8))
        : Math.max(1, Math.round(card.interval * 2))
  return {
    ...card,
    interval,
    reviews: card.reviews + 1,
    due: now + (rating === 'again' ? 600000 : interval * 86400000),
  }
}
export const generatedCardsSchema = z.object({
  cards: z
    .array(
      z.object({ question: z.string().min(1).max(4000), answer: z.string().min(1).max(10000) }),
    )
    .min(1)
    .max(20),
})
export function parseCards(raw: string) {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return generatedCardsSchema.parse(JSON.parse(clean)).cards
}
