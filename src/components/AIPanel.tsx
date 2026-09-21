import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Sparkles,
  ArrowUp,
  ListChecks,
  Layers,
  AlignLeft,
  X,
  Plus,
  LoaderCircle,
  KeyRound,
  RotateCcw,
} from 'lucide-react'
import type { AISettings, Card, Note } from '../domain'
import { parseCards, uid } from '../domain'
import { htmlText } from '../storage'
import { useI18n } from '../i18n'

type Result = {
  task: string
  content: string
  cards?: { question: string; answer: string }[]
  added?: boolean
}
export default function AIPanel({
  note,
  settings,
  onSettings,
  onClose,
  onAddCards,
  onAppend,
}: {
  note: Note
  settings: AISettings
  onSettings: () => void
  onClose: () => void
  onAddCards: (cards: Card[]) => void
  onAppend: (text: string) => void
}) {
  const { language, pick } = useI18n()
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function run(task: 'summary' | 'questions' | 'cards' | 'chat') {
    if (!settings.apiKey) {
      onSettings()
      return
    }
    const content = htmlText(note.html)
    if (!content.trim()) {
      setError(pick(
        '先写一点文字，AI 才能根据你的笔记协助学习。手写内容暂不支持识别。',
        'Write some text first so AI can help with this note. Handwriting recognition is not supported yet.',
      ))
      return
    }
    if (content.length > 60000) {
      setError(pick('当前笔记超过 60,000 字符，请拆分笔记后重试。', 'This note exceeds 60,000 characters. Split it before trying again.'))
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    const abort = new AbortController()
    controller.current = abort
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ ...settings, task, title: note.title, content, question, language }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || pick('AI 请求失败，请重试。', 'AI request failed. Please try again.'))
      if (typeof data.content !== 'string') throw new Error(pick('AI 返回格式异常，请重试。', 'AI returned an invalid response. Please try again.'))
      let cards: Result['cards']
      if (task === 'cards') {
        try {
          cards = parseCards(data.content)
        } catch {
          throw new Error(pick(
            '模型返回的闪卡格式不正确，请重新生成，或使用其他模型。',
            'The model returned invalid flashcards. Generate them again or try another model.',
          ))
        }
      }
      setResult({ task, content: data.content, cards })
      if (task === 'chat') setQuestion('')
    } catch (error) {
      if (!abort.signal.aborted)
        setError(error instanceof Error ? error.message : pick('网络异常，请重试。', 'Network error. Please try again.'))
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setLoading(false)
      }
    }
  }
  function addCards() {
    if (!result?.cards || result.added) return
    onAddCards(
      result.cards.map((c) => ({
        ...c,
        id: uid(),
        noteId: note.id,
        due: Date.now(),
        interval: 0,
        reviews: 0,
      })),
    )
    setResult({ ...result, added: true })
  }
  return (
    <aside className="ai-panel" aria-label={pick('AI 学习伙伴', 'AI study partner')}>
      <header className="ai-heading">
        <div>
          <Sparkles size={19} />
          <h2>{pick('学习伙伴', 'Study partner')}</h2>
          <span className="beta-tag">AI</span>
        </div>
        <button className="icon-button" aria-label={pick('关闭学习伙伴', 'Close study partner')} onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="ai-scroll">
        <div className="ai-intro">
          <div className="sparkle-large">
            <Sparkles size={28} strokeWidth={1.4} />
          </div>
          <h3>{pick('从记录，到理解。', 'From notes to understanding.')}</h3>
          <p>
            {pick('围绕这篇笔记，', 'Work with this note,')}
            <br />
            {pick('一起把知识再往前推一步。', 'and take your understanding one step further.')}
          </p>
        </div>
        <div className="ai-actions">
          <button disabled={loading} onClick={() => run('summary')}>
            <span className="ai-action-icon mint">
              <AlignLeft size={20} />
            </span>
            <span>
              <strong>{pick('提炼重点', 'Summarize')}</strong>
              <small>{pick('理清脉络，抓住核心', 'Find the structure and core ideas')}</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
          <button disabled={loading} onClick={() => run('questions')}>
            <span className="ai-action-icon amber">
              <ListChecks size={20} />
            </span>
            <span>
              <strong>{pick('考考自己', 'Quiz yourself')}</strong>
              <small>{pick('用问题发现理解的盲点', 'Use questions to find gaps')}</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
          <button disabled={loading} onClick={() => run('cards')}>
            <span className="ai-action-icon blue">
              <Layers size={20} />
            </span>
            <span>
              <strong>{pick('生成闪卡', 'Generate flashcards')}</strong>
              <small>{pick('把知识放进长期记忆', 'Move ideas into long-term memory')}</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
        </div>
        {!settings.apiKey ? (
          <button className="key-prompt" onClick={onSettings}>
            <KeyRound size={16} />
            <span>{pick('连接你的 AI，开始学习', 'Connect your AI to start learning')}</span>
            <span>→</span>
          </button>
        ) : (
          <p className="provider-status">{settings.model} · {pick('仅使用当前笔记文字', 'Uses only this note')}</p>
        )}
        {loading ? (
          <div className="ai-loading" role="status">
            <LoaderCircle className="spin" size={20} />
            <p>{pick('正在阅读你的笔记…', 'Reading your note…')}</p>
            <button
              className="text-button"
              onClick={() => {
                controller.current?.abort()
                setLoading(false)
              }}
            >
              {pick('取消', 'Cancel')}
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : null}
        {result ? (
          <section className="ai-result">
            <div className="eyebrow">
              <Sparkles size={14} /> {pick('来自当前笔记', 'From this note')}
              <button
                className="icon-button"
                aria-label={pick('清空 AI 结果', 'Clear AI result')}
                onClick={() => setResult(null)}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            {result.cards ? (
              <>
                <div className="generated-cards">
                  {result.cards.map((c, i) => (
                    <details key={i}>
                      <summary>{c.question}</summary>
                      <p>{c.answer}</p>
                    </details>
                  ))}
                </div>
                <button className="button primary full" disabled={result.added} onClick={addCards}>
                  <Plus size={16} />
                  {result.added
                    ? pick('已加入复习', 'Added to review')
                    : pick(`加入 ${result.cards.length} 张闪卡`, `Add ${result.cards.length} flashcards`)}
                </button>
              </>
            ) : (
              <>
                <div className="ai-markdown">
                  <ReactMarkdown>{result.content}</ReactMarkdown>
                </div>
                <button
                  className="button secondary full"
                  disabled={result.added}
                  onClick={() => {
                    onAppend(result.content)
                    setResult({ ...result, added: true })
                  }}
                >
                  <Plus size={16} />
                  {result.added
                    ? pick('已追加到笔记', 'Added to note')
                    : pick('追加到笔记', 'Add to note')}
                </button>
              </>
            )}
            <p className="ai-disclaimer">{pick('AI 可能出错，请结合原始资料核对。', 'AI can make mistakes. Check the original material.')}</p>
          </section>
        ) : null}
        {!result && !loading ? (
          <div className="learning-tip">
            <span>{pick('学习小贴士', 'Study tip')}</span>
            <p>
              {pick('先试着用自己的话解释，', 'Explain it in your own words first,')}
              <br />
              {pick('再让 AI 帮你补上遗漏的部分。', 'then let AI help fill the gaps.')}
            </p>
          </div>
        ) : null}
      </div>
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim()) run('chat')
        }}
      >
        <label className="sr-only" htmlFor="ai-question">
          {pick('向 AI 提问', 'Ask AI')}
        </label>
        <textarea
          id="ai-question"
          rows={2}
          maxLength={4000}
          placeholder={pick('关于这篇笔记，我想问…', 'Ask something about this note…')}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div>
          <span>{pick('基于当前笔记', 'Based on this note')}</span>
          <button
            className="send-button"
            disabled={loading || !question.trim()}
            aria-label={pick('发送问题', 'Send question')}
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </aside>
  )
}
