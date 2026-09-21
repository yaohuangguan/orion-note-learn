import { useEffect, useState } from 'react'
import { Layers, ArrowRight, Check, RotateCcw, Sparkles, Plus } from 'lucide-react'
import { scheduleCard, type Card, type Note } from '../domain'
import { useI18n } from '../i18n'

export default function Review({
  cards,
  notes,
  onRate,
  onCreate,
}: {
  cards: Card[]
  notes: Note[]
  onRate: (card: Card) => void
  onCreate: () => void
}) {
  const { pick } = useI18n()
  const activeIds = new Set(notes.filter((n) => !n.deletedAt).map((n) => n.id))
  const eligible = cards.filter((c) => activeIds.has(c.noteId))
  const [queue, setQueue] = useState(() =>
    eligible
      .filter((c) => c.due <= Date.now())
      .sort((a, b) => a.due - b.due)
      .map((c) => c.id),
  )
  useEffect(() => {
    const ids = new Set(notes.filter((n) => !n.deletedAt).map((n) => n.id))
    const due = cards.filter((c) => ids.has(c.noteId) && c.due <= Date.now()).map((c) => c.id)
    setQueue((q) => [...q.filter((id) => due.includes(id)), ...due.filter((id) => !q.includes(id))])
  }, [cards, notes])
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const card = cards.find((c) => c.id === queue[0])
  const source = notes.find((n) => n.id === card?.noteId)
  function rate(rating: 'again' | 'good' | 'easy') {
    if (!card) return
    onRate(scheduleCard(card, rating))
    setQueue(queue.slice(1))
    setRevealed(false)
    setDone(done + 1)
  }
  return (
    <div className="review-page">
      <div className="page-kicker">
        <Layers size={17} /> REVIEW STUDIO
      </div>
      <div className="view-heading">
        <div>
          <h1>{pick('让知识，留下来。', 'Make knowledge stick.')}</h1>
          <p>{pick('每天一点主动回忆，把熟悉变成掌握。', 'A little active recall each day turns familiarity into mastery.')}</p>
        </div>
        <button className="button secondary" onClick={onCreate}>
          <Plus size={16} />
          {pick('制作闪卡', 'Create flashcard')}
        </button>
      </div>
      <div className="review-stats">
        <div>
          <strong>{queue.length}</strong>
          <span>{pick('本轮待复习', 'Due this round')}</span>
        </div>
        <div>
          <strong>{done}</strong>
          <span>{pick('本轮已完成', 'Completed')}</span>
        </div>
        <div>
          <strong>{eligible.length}</strong>
          <span>{pick('全部闪卡', 'All flashcards')}</span>
        </div>
      </div>
      {card ? (
        <>
          <div className="review-progress">
            <div style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
          </div>
          <article className="flashcard">
            <div className="eyebrow">
              <Layers size={15} /> {source?.title || pick('笔记', 'Note')}
              <span>{pick('主动回忆', 'Active recall')}</span>
            </div>
            <h2>{card.question}</h2>
            {revealed ? (
              <div className="flashcard-answer">
                <span>{pick('参考答案', 'Suggested answer')}</span>
                <p>{card.answer}</p>
              </div>
            ) : (
              <div className="recall-hint">{pick('先在心里回答，也可以拿起笔写一写。', 'Answer from memory first, or write it out.')}</div>
            )}
          </article>
          {!revealed ? (
            <button className="button primary reveal-button" onClick={() => setRevealed(true)}>
              {pick('查看答案', 'Reveal answer')} <ArrowRight size={17} />
            </button>
          ) : (
            <div className="rating-buttons">
              <button onClick={() => rate('again')}>
                <RotateCcw size={18} />
                <strong>{pick('再想一想', 'Again')}</strong>
                <span>{pick('10 分钟后', 'In 10 minutes')}</span>
              </button>
              <button onClick={() => rate('good')}>
                <Check size={18} />
                <strong>{pick('基本掌握', 'Good')}</strong>
                <span>{pick(`${Math.max(1, Math.round(card.interval * 2))} 天后`, `In ${Math.max(1, Math.round(card.interval * 2))} days`)}</span>
              </button>
              <button onClick={() => rate('easy')}>
                <Sparkles size={18} />
                <strong>{pick('很有把握', 'Easy')}</strong>
                <span>{pick(`${Math.max(4, Math.round(card.interval * 2.8))} 天后`, `In ${Math.max(4, Math.round(card.interval * 2.8))} days`)}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="review-complete">
          <div className="complete-icon">
            <Check size={30} />
          </div>
          <h2>{done
            ? pick('这一轮，你又前进了一点。', 'You made progress this round.')
            : pick('暂时没有待复习的闪卡', 'No flashcards are due')}</h2>
          <p>
            {eligible.length
              ? pick('下一次复习时间已根据掌握程度安排。', 'Your next reviews have been scheduled based on your answers.')
              : pick('从一篇笔记开始，让 AI 或你自己制作第一张闪卡。', 'Start with a note, then create your first flashcard yourself or with AI.')}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setQueue(eligible.filter((c) => c.due <= Date.now()).map((c) => c.id))
              setDone(0)
            }}
          >
            {pick('检查待复习', 'Check for reviews')}
          </button>
        </div>
      )}
      <p className="review-note">
        {pick(
          '复习间隔会随你的自评调整。「再想一想」的内容将在 10 分钟后重新出现。',
          'Review intervals adapt to your rating. Cards marked “Again” return in 10 minutes.',
        )}
      </p>
    </div>
  )
}
