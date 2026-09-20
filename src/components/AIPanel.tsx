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
      setError('先写一点文字，AI 才能根据你的笔记协助学习。手写内容暂不支持识别。')
      return
    }
    if (content.length > 60000) {
      setError('当前笔记超过 60,000 字符，请拆分笔记后重试。')
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
        body: JSON.stringify({ ...settings, task, title: note.title, content, question }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI 请求失败，请重试。')
      if (typeof data.content !== 'string') throw new Error('AI 返回格式异常，请重试。')
      let cards: Result['cards']
      if (task === 'cards') {
        try {
          cards = parseCards(data.content)
        } catch {
          throw new Error('模型返回的闪卡格式不正确，请重新生成，或使用其他模型。')
        }
      }
      setResult({ task, content: data.content, cards })
      if (task === 'chat') setQuestion('')
    } catch (error) {
      if (!abort.signal.aborted)
        setError(error instanceof Error ? error.message : '网络异常，请重试。')
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
    <aside className="ai-panel" aria-label="AI 学习伙伴">
      <header className="ai-heading">
        <div>
          <Sparkles size={19} />
          <h2>学习伙伴</h2>
          <span className="beta-tag">AI</span>
        </div>
        <button className="icon-button" aria-label="关闭学习伙伴" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="ai-scroll">
        <div className="ai-intro">
          <div className="sparkle-large">
            <Sparkles size={28} strokeWidth={1.4} />
          </div>
          <h3>从记录，到理解。</h3>
          <p>
            围绕这篇笔记，
            <br />
            一起把知识再往前推一步。
          </p>
        </div>
        <div className="ai-actions">
          <button disabled={loading} onClick={() => run('summary')}>
            <span className="ai-action-icon mint">
              <AlignLeft size={20} />
            </span>
            <span>
              <strong>提炼重点</strong>
              <small>理清脉络，抓住核心</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
          <button disabled={loading} onClick={() => run('questions')}>
            <span className="ai-action-icon amber">
              <ListChecks size={20} />
            </span>
            <span>
              <strong>考考自己</strong>
              <small>用问题发现理解的盲点</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
          <button disabled={loading} onClick={() => run('cards')}>
            <span className="ai-action-icon blue">
              <Layers size={20} />
            </span>
            <span>
              <strong>生成闪卡</strong>
              <small>把知识放进长期记忆</small>
            </span>
            <span className="action-arrow">↗</span>
          </button>
        </div>
        {!settings.apiKey ? (
          <button className="key-prompt" onClick={onSettings}>
            <KeyRound size={16} />
            <span>连接你的 AI，开始学习</span>
            <span>→</span>
          </button>
        ) : (
          <p className="provider-status">{settings.model} · 仅使用当前笔记文字</p>
        )}
        {loading ? (
          <div className="ai-loading" role="status">
            <LoaderCircle className="spin" size={20} />
            <p>正在阅读你的笔记…</p>
            <button
              className="text-button"
              onClick={() => {
                controller.current?.abort()
                setLoading(false)
              }}
            >
              取消
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
              <Sparkles size={14} /> 来自当前笔记
              <button
                className="icon-button"
                aria-label="清空 AI 结果"
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
                  {result.added ? '已加入复习' : `加入 ${result.cards.length} 张闪卡`}
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
                  {result.added ? '已追加到笔记' : '追加到笔记'}
                </button>
              </>
            )}
            <p className="ai-disclaimer">AI 可能出错，请结合原始资料核对。</p>
          </section>
        ) : null}
        {!result && !loading ? (
          <div className="learning-tip">
            <span>学习小贴士</span>
            <p>
              先试着用自己的话解释，
              <br />
              再让 AI 帮你补上遗漏的部分。
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
          向 AI 提问
        </label>
        <textarea
          id="ai-question"
          rows={2}
          maxLength={4000}
          placeholder="关于这篇笔记，我想问…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div>
          <span>基于当前笔记</span>
          <button
            className="send-button"
            disabled={loading || !question.trim()}
            aria-label="发送问题"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </aside>
  )
}
