import { describe, it, expect } from 'vitest'
import { scheduleCard, parseCards, workspaceSchema, type Card } from '../src/domain'
import { seedWorkspace } from '../src/seed'
import { upgradeOnboardingNotes } from '../src/onboarding'
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
describe('starter onboarding', () => {
  it('ships Chinese and English privacy-first welcome notes', () => {
    const workspace = seedWorkspace()
    const chinese = workspace.notes.find((note) => note.id === 'welcome')
    const english = workspace.notes.find((note) => note.id === 'welcome-en')

    expect(chinese?.html).toContain('OCR 原图不会上传')
    expect(chinese?.html).toContain('AES-256-GCM')
    expect(chinese?.html).toContain('主动分享才公开')
    expect(english?.title).toBe('Welcome to Orion — Learn privately, remember deeply')
    expect(english?.html).toContain('OCR source photos are not uploaded')
    expect(english?.html).toContain('private vault key is never sent')
    expect(english?.html).toContain('Public only when you choose')
  })
})

describe('onboarding migration', () => {
  it('adds the English intro once without overwriting an edited welcome note', () => {
    const workspace = seedWorkspace()
    workspace.notes = workspace.notes.filter((note) => note.id !== 'welcome-en')
    workspace.folders = workspace.folders.filter((folder) => folder !== 'Getting Started')
    const welcome = workspace.notes.find((note) => note.id === 'welcome')!
    welcome.html = '<p>我自己修改过的欢迎笔记</p>'

    const upgraded = upgradeOnboardingNotes(workspace)
    expect(upgraded.notes.find((note) => note.id === 'welcome')?.html).toBe(
      '<p>我自己修改过的欢迎笔记</p>',
    )
    expect(upgraded.notes.filter((note) => note.id === 'welcome-en')).toHaveLength(1)
    expect(upgraded.folders).toContain('Getting Started')

    const twice = upgradeOnboardingNotes(upgraded)
    expect(twice.notes.filter((note) => note.id === 'welcome-en')).toHaveLength(1)
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
