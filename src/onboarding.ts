import type { Workspace } from './domain'
import { seedWorkspace } from './seed'

const LEGACY_WELCOME_HTML =
  '<p>学习不只是收集信息。给知识一点空间，也给自己一次重新理解的机会。</p><h2>01 · 从一页笔记开始</h2><p>写下今天最想弄懂的一个问题。用自己的语言解释它，比完整地抄录更有帮助。</p><blockquote><p>如果不能用简单的话说清楚，试着找到自己还不理解的那一小块。</p></blockquote><h2>02 · 让思考看得见</h2><p>文字适合梳理，手写适合连接。切换到「手写画板」，用箭头、草图和关键词画出你的思路。</p><ul><li><p><strong>主动回忆：</strong>合上笔记，试着回想三个关键点。</p></li><li><p><strong>间隔复习：</strong>在快要忘记的时候，再与知识见一面。</p></li><li><p><strong>费曼练习：</strong>像教朋友一样，把概念解释清楚。</p></li></ul><h2>03 · 给自己一个小测验</h2><p>右侧的 AI 学习伙伴可以根据当前笔记提炼重点、生成问题和复习卡片。在设置中填入自己的 API Key，即可开始。</p><p><mark>今天的小目标：记下一个概念，并用一个自己的例子解释它。</mark></p>'

function untouchedLegacyWelcome(workspace: Workspace) {
  const note = workspace.notes.find((item) => item.id === 'welcome')
  return (
    note &&
    !note.deletedAt &&
    note.title === '把学过的，变成真正掌握的' &&
    note.folder === '学习方法' &&
    note.favorite === true &&
    note.strokes.length === 0 &&
    JSON.stringify(note.tags) === JSON.stringify(['学习方法', '开始使用']) &&
    note.html === LEGACY_WELCOME_HTML
  )
}

export function upgradeOnboardingNotes(workspace: Workspace): Workspace {
  const starter = seedWorkspace()
  const currentChinese = starter.notes.find((note) => note.id === 'welcome')
  const currentEnglish = starter.notes.find((note) => note.id === 'welcome-en')
  if (!currentChinese || !currentEnglish) return workspace

  let changed = false
  let notes = workspace.notes

  const legacy = untouchedLegacyWelcome(workspace)
  if (legacy) {
    notes = notes.map((note) =>
      note.id === 'welcome'
        ? {
            ...currentChinese,
            createdAt: note.createdAt,
            updatedAt: Date.now(),
          }
        : note,
    )
    changed = true
  }

  if (!notes.some((note) => note.id === 'welcome-en')) {
    const now = Date.now()
    notes = [
      ...notes,
      {
        ...currentEnglish,
        createdAt: now,
        updatedAt: now,
      },
    ]
    changed = true
  }

  const folders = workspace.folders.includes('Getting Started')
    ? workspace.folders
    : [...workspace.folders, 'Getting Started']
  if (folders !== workspace.folders) changed = true

  return changed ? { ...workspace, notes, folders } : workspace
}
