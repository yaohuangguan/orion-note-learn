import { describe, it, expect } from 'vitest'
import { scheduleCard, parseCards, workspaceSchema, type Card } from '../src/domain'
import { seedWorkspace } from '../src/seed'
import { completionUrl } from '../server/policy'
const card: Card = {
  id: '1',
  noteId: 'note',
  question: 'Q',
  answer: 'A',
  due: 0,
  interval: 0,
  reviews: 0,
}
describe('spaced review', () => {
  it('resets difficult cards and schedules after ten minutes', () => {
    const next = scheduleCard({ ...card, interval: 20 }, 'again', 1000)
    expect(next.due).toBe(601000)
    expect(next.interval).toBe(0)
    expect(next.reviews).toBe(1)
  })
  it('advances known cards and gives easy cards a longer interval', () => {
    expect(scheduleCard(card, 'good', 0).due).toBe(86400000)
    expect(scheduleCard(card, 'easy', 0).due).toBe(4 * 86400000)
    expect(scheduleCard({ ...card, interval: 4 }, 'good', 0).interval).toBe(8)
  })
})
describe('AI flashcard parsing', () => {
  it('accepts fenced JSON', () =>
    expect(
      parseCards('```json\n{"cards":[{"question":"问题","answer":"答案"}]}\n```'),
    ).toHaveLength(1))
  it('rejects malformed and empty cards', () => {
    expect(() => parseCards('{"cards":[]}')).toThrow()
    expect(() => parseCards('{"cards":[{"question":"Q"}]}')).toThrow()
    expect(() => parseCards('not JSON')).toThrow()
  })
})
describe('backup validation', () => {
  it('accepts versioned notes and schedules', () =>
    expect(workspaceSchema.parse(seedWorkspace()).version).toBe(1))
  it('rejects duplicate IDs, orphan cards and malicious strokes', () => {
    const a = seedWorkspace()
    a.notes.push(a.notes[0])
    expect(() => workspaceSchema.parse(a)).toThrow()
    const b = seedWorkspace()
    b.cards[0].noteId = 'absent'
    expect(() => workspaceSchema.parse(b)).toThrow()
    const c = seedWorkspace()
    c.notes[0].strokes = [{ id: 'bad', color: 'red" onload="evil', width: 3, points: [] }]
    expect(() => workspaceSchema.parse(c)).toThrow()
  })
})
describe('AI destination policy', () => {
  it('accepts providers and explicitly trusted hosts', () => {
    expect(completionUrl('https://api.deepseek.com/v1/')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(completionUrl('https://ai.example.com/v1', 'ai.example.com')).toBe(
      'https://ai.example.com/v1/chat/completions',
    )
  })
  it.each([
    'http://api.openai.com/v1',
    'https://127.0.0.1/v1',
    'https://api.openai.com.evil.test/v1',
    'https://user:password@api.openai.com/v1',
    'https://api.openai.com:8443/v1',
    'https://api.openai.com/v1?x=1',
  ])('rejects unsafe destination %s', (url) => expect(() => completionUrl(url)).toThrow())
})
