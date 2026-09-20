import type { Workspace } from './domain'

export function seedWorkspace(): Workspace {
  const now = Date.now()
  return {
    version: 1,
    folders: ['学习方法', '我的笔记', '灵感收集'],
    reviewLog: [],
    notes: [
      {
        id: 'welcome',
        title: '把学过的，变成真正掌握的',
        folder: '学习方法',
        tags: ['学习方法', '开始使用'],
        favorite: true,
        createdAt: now,
        updatedAt: now,
        strokes: [],
        html: `<p>学习不只是收集信息。给知识一点空间，也给自己一次重新理解的机会。</p><h2>01 · 从一页笔记开始</h2><p>写下今天最想弄懂的一个问题。用自己的语言解释它，比完整地抄录更有帮助。</p><blockquote><p>如果不能用简单的话说清楚，试着找到自己还不理解的那一小块。</p></blockquote><h2>02 · 让思考看得见</h2><p>文字适合梳理，手写适合连接。切换到「手写画板」，用箭头、草图和关键词画出你的思路。</p><ul><li><p><strong>主动回忆：</strong>合上笔记，试着回想三个关键点。</p></li><li><p><strong>间隔复习：</strong>在快要忘记的时候，再与知识见一面。</p></li><li><p><strong>费曼练习：</strong>像教朋友一样，把概念解释清楚。</p></li></ul><h2>03 · 给自己一个小测验</h2><p>右侧的 AI 学习伙伴可以根据当前笔记提炼重点、生成问题和复习卡片。在设置中填入自己的 API Key，即可开始。</p><p><mark>今天的小目标：记下一个概念，并用一个自己的例子解释它。</mark></p>`,
      },
      {
        id: 'recall',
        title: '主动回忆与间隔复习',
        folder: '学习方法',
        tags: ['记忆', '复习'],
        favorite: false,
        createdAt: now,
        updatedAt: now - 60000,
        strokes: [],
        html: '<h2>为什么重读不等于记住？</h2><p>重读让内容变得熟悉，而主动回忆要求我们在没有提示时提取知识。</p><h2>我的练习方式</h2><ol><li><p>阅读后合上资料，用三句话概括。</p></li><li><p>为不熟悉的知识点建立闪卡。</p></li><li><p>隔一段时间重新回答，根据掌握情况调整复习间隔。</p></li></ol><blockquote><p>复习的目标是发现盲点，而不是证明自己已经会了。</p></blockquote>',
      },
      {
        id: 'ideas',
        title: '留给灵感的一页',
        folder: '灵感收集',
        tags: ['灵感'],
        favorite: false,
        createdAt: now,
        updatedAt: now - 120000,
        strokes: [],
        html: '<p>一个问题、一个突然想到的比喻，或者一段值得继续探索的想法。</p><p>从这里开始写吧。</p>',
      },
    ],
    cards: [
      {
        id: 'seed-1',
        noteId: 'recall',
        question: '主动回忆与重读笔记有什么不同？',
        answer:
          '主动回忆是在没有提示时提取知识；重读更多是在增加熟悉感。主动回忆能帮助发现尚未掌握的内容。',
        due: now,
        interval: 0,
        reviews: 0,
      },
      {
        id: 'seed-2',
        noteId: 'recall',
        question: '如何把一页笔记变成一次有效的复习？',
        answer: '合上笔记，用自己的话概括；把薄弱知识点制成闪卡；按掌握程度安排后续复习。',
        due: now,
        interval: 0,
        reviews: 0,
      },
    ],
  }
}
