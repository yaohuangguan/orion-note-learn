import { z } from 'zod'

export const requestSchema = z.object({
  apiKey: z.string().min(1).max(1000),
  baseUrl: z.string().url().max(1000),
  model: z.string().min(1).max(200),
  task: z.enum(['summary', 'questions', 'cards', 'chat']),
  title: z.string().max(500),
  content: z.string().min(1).max(60000),
  question: z.string().max(4000).optional(),
  language: z.enum(['zh', 'en']).default('zh'),
})
export function completionUrl(baseUrl: string, extraHosts = '') {
  const url = new URL(baseUrl)
  const allowed = new Set([
    'api.openai.com',
    'api.deepseek.com',
    'openrouter.ai',
    ...extraHosts
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ])
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '443') ||
    !allowed.has(url.hostname)
  )
    throw new Error('该接口地址尚未被服务器允许。自定义服务需配置 AI_ALLOWED_HOSTS。')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`
  return url.toString()
}
export function promptFor(
  task: z.infer<typeof requestSchema>['task'],
  question?: string,
  language: 'zh' | 'en' = 'zh',
) {
  const tasks = language === 'en' ? {
    summary:
      'Summarize this note with its core ideas, knowledge structure, common points of confusion, and three review takeaways. Use concise Markdown.',
    questions:
      'Create five active-recall questions that progress from basic to advanced. List the questions first, followed by suggested answers and brief explanations. Use Markdown.',
    cards:
      'Create 5–8 useful Q&A flashcards. Return strict JSON only: {"cards":[{"question":"Question","answer":"Answer"}]}. Do not use code fences. Focus each card on one idea.',
    chat: `Answer this study question using the note, explain concretely, and end with one question that encourages deeper thinking: ${question || 'Help me understand this note.'}`,
  } : {
    summary:
      '总结当前笔记，包含：核心观点、知识结构、易混淆之处、三个复习要点。使用简洁 Markdown。',
    questions:
      '根据笔记设计 5 个由浅入深的主动回忆问题。先列出问题，再在末尾给出参考答案与简要解释。使用 Markdown。',
    cards:
      '生成 5 至 8 张有价值的问答闪卡。只返回严格 JSON：{"cards":[{"question":"问题","answer":"答案"}]}。不要代码围栏。每张卡聚焦一个知识点。',
    chat: `围绕笔记回答这个学习问题，给出具体解释，最后提出一个引导思考的问题：${question || '请帮我理解这篇笔记。'}`,
  }
  return tasks[task]
}
