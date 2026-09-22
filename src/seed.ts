import type { Workspace } from './domain'

export function seedWorkspace(): Workspace {
  const now = Date.now()
  return {
    version: 1,
    folders: ['学习方法', '我的笔记', '灵感收集', 'Getting Started'],
    reviewLog: [],
    notes: [
      {
        id: 'welcome',
        title: '欢迎来到 Orion：把学过的，变成真正掌握的',
        folder: '学习方法',
        tags: ['开始使用', '隐私', '学习方法'],
        favorite: true,
        createdAt: now,
        updatedAt: now,
        strokes: [],
        html: `<p>Orion 是一个本地优先、隐私优先的学习笔记空间。你可以写文字、画图、拍照识别、制作闪卡，也可以在需要时连接自己的 AI。</p><blockquote><p><strong>Private by design.</strong> 默认私密。只有你主动分享的内容才会公开。</p></blockquote><h2>01 · 写下、拍下，再变成自己的理解</h2><p>从一个问题开始，用自己的话解释它。需要整理纸面笔记时，可以直接使用「拍照 / 图片 OCR」。</p><ul><li><p><strong>本地 OCR：</strong>识别完全在浏览器中运行，OCR 原图不会上传，也不会存储到 Orion。</p></li><li><p><strong>文字与手写：</strong>文字适合梳理逻辑，手写画板适合画箭头、结构和关系。</p></li><li><p><strong>闪卡复习：</strong>把薄弱知识点做成卡片，在快忘记的时候重新回答。</p></li></ul><h2>02 · 你的私人空间，先加密再同步</h2><p>登录云同步后，私人笔记、标签、手写、闪卡、复习记录和私人图片附件都会在浏览器端使用 AES-256-GCM 加密后再离开设备。</p><ul><li><p><strong>云端只保存密文：</strong>私人空间密钥不会发送给 Orion 服务端。</p></li><li><p><strong>主动分享才公开：</strong>普通笔记不会发布；只有你明确创建分享链接时，才会生成一份可阅读的公开副本。</p></li><li><p><strong>AI 由你决定：</strong>AI Key 不进入云同步。只有你主动运行 AI 功能时，当前笔记文字才会发送给你选择的 AI 服务商。</p></li></ul><h2>03 · 学习，而不只是收藏信息</h2><p>试试主动回忆、间隔复习和费曼练习：合上资料，先回答；发现盲点，再回来看。</p><p><mark>今天的小目标：记下一个概念，用自己的例子解释它，然后做一张复习卡。</mark></p>`,
      },
      {
        id: 'welcome-en',
        title: 'Welcome to Orion — Learn privately, remember deeply',
        folder: 'Getting Started',
        tags: ['Getting started', 'Privacy', 'Learning'],
        favorite: true,
        createdAt: now,
        updatedAt: now - 1000,
        strokes: [],
        html: `<p>Orion is a local-first, privacy-first workspace for notes and learning. Write, draw, scan handwritten pages, build flashcards, and connect your own AI only when you want it.</p><blockquote><p><strong>Private by design.</strong> Your workspace is private by default. Public only when you choose.</p></blockquote><h2>01 · Capture ideas without giving up privacy</h2><p>Start with one question and explain it in your own words. If your notes begin on paper, use Photo / image OCR to bring them into Orion.</p><ul><li><p><strong>OCR stays on your device:</strong> recognition runs locally in your browser. OCR source photos are not uploaded to or stored by Orion.</p></li><li><p><strong>Write and draw:</strong> use text for structure and the drawing board for arrows, diagrams, and visual thinking.</p></li><li><p><strong>Turn notes into review:</strong> create flashcards for the ideas you want to remember, then revisit them with spaced review.</p></li></ul><h2>02 · Your private space is encrypted before cloud sync</h2><p>When cloud sync is enabled, private notes, tags, drawings, flashcards, review history, and private image attachments are encrypted in your browser with AES-256-GCM before they leave your device.</p><ul><li><p><strong>The cloud stores ciphertext:</strong> your private vault key is never sent to Orion servers.</p></li><li><p><strong>Public only when you choose:</strong> regular notes are never published. A readable public copy is created only when you explicitly create a share link.</p></li><li><p><strong>Your AI, your choice:</strong> your AI key is not included in cloud sync. Note text is sent to your selected AI provider only when you explicitly run an AI action.</p></li></ul><h2>03 · Learn, do not just collect</h2><p>Use active recall, spaced repetition, and the Feynman technique: close the source, answer first, find the gap, then return to the material.</p><p><mark>Try this now: write one concept, explain it with your own example, and turn the weakest part into a flashcard.</mark></p>`,
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
