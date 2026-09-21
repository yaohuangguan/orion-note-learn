import { useRef, useState, type PointerEvent } from 'react'
import { PenTool, Eraser, Undo2, Redo2, Download, Hand } from 'lucide-react'
import { uid, type Stroke } from '../domain'
import { download, safeName } from '../storage'

import { strokePath, drawingSvg } from '../drawing-utils'
import { useI18n } from '../i18n'
const colors = ['#263d35', '#477c65', '#cd8854', '#5c7da7', '#ba6874']
export default function Drawing({
  strokes,
  onChange,
  title,
}: {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
  title: string
}) {
  const { pick } = useI18n()
  const [color, setColor] = useState(colors[0])
  const [width, setWidth] = useState(3)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [penOnly, setPenOnly] = useState(false)
  const [draft, setDraft] = useState<Stroke | null>(null)
  const draftRef = useRef<Stroke | null>(null)
  const pointer = useRef<number | null>(null)
  const [redo, setRedo] = useState<Stroke[][]>([])
  const [history, setHistory] = useState<Stroke[][]>([])
  const svg = useRef<SVGSVGElement>(null)
  function commit(next: Stroke[]) {
    setHistory((h) => [...h.slice(-99), strokes])
    setRedo([])
    onChange(next)
  }
  function point(e: PointerEvent<SVGSVGElement>) {
    const matrix = svg.current!.getScreenCTM()!.inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix)
    return {
      x: Math.max(0, Math.min(1200, p.x)),
      y: Math.max(0, Math.min(900, p.y)),
      pressure: e.pressure || 0.5,
    }
  }
  function erase(e: PointerEvent<SVGSVGElement>) {
    const p = point(e)
    const remaining = strokes.filter(
      (s) => !s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 22 + s.width),
    )
    if (remaining.length !== strokes.length) {
      commit(remaining)
    }
  }
  function start(e: PointerEvent<SVGSVGElement>) {
    if ((penOnly && e.pointerType === 'touch') || pointer.current !== null || e.button !== 0) return
    e.preventDefault()
    pointer.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'eraser') {
      erase(e)
      return
    }
    const s: Stroke = { id: uid(), color, width, points: [point(e)] }
    draftRef.current = s
    setDraft(s)
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== e.pointerId) return
    if (tool === 'eraser') {
      erase(e)
      return
    }
    if (!draftRef.current) return
    const p = point(e)
    const last = draftRef.current.points.at(-1)!
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1 || draftRef.current.points.length >= 20000)
      return
    const next = { ...draftRef.current, points: [...draftRef.current.points, p] }
    draftRef.current = next
    setDraft(next)
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== e.pointerId) return
    if (draftRef.current) {
      commit([...strokes, draftRef.current])
    }
    draftRef.current = null
    setDraft(null)
    pointer.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
  }
  return (
    <div className="drawing-wrap">
      <div className="drawing-toolbar" role="toolbar" aria-label={pick('画板工具', 'Drawing tools')}>
        <button
          className={`icon-button ${tool === 'pen' ? 'active' : ''}`}
          aria-label={pick('画笔', 'Pen')}
          aria-pressed={tool === 'pen'}
          onClick={() => setTool('pen')}
        >
          <PenTool size={18} />
        </button>
        <button
          className={`icon-button ${tool === 'eraser' ? 'active' : ''}`}
          aria-label={pick('整笔橡皮擦', 'Stroke eraser')}
          title={pick('整笔橡皮擦', 'Stroke eraser')}
          aria-pressed={tool === 'eraser'}
          onClick={() => setTool('eraser')}
        >
          <Eraser size={18} />
        </button>
        <span className="toolbar-divider" />
        {colors.map((c) => (
          <button
            key={c}
            aria-label={`${pick('墨水', 'Ink')} ${c}`}
            aria-pressed={c === color}
            className={`ink-color ${c === color ? 'selected' : ''}`}
            style={{ background: c }}
            onClick={() => {
              setColor(c)
              setTool('pen')
            }}
          />
        ))}
        <label className="pen-width">
          {pick('粗细', 'Width')}
          <input
            aria-label={pick('画笔粗细', 'Pen width')}
            type="range"
            min="1"
            max="12"
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </label>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          aria-label={pick('撤销笔画', 'Undo stroke')}
          disabled={!history.length}
          onClick={() => {
            setRedo([...redo, strokes])
            onChange(history.at(-1)!)
            setHistory(history.slice(0, -1))
          }}
        >
          <Undo2 size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={pick('重做笔画', 'Redo stroke')}
          disabled={!redo.length}
          onClick={() => {
            setHistory([...history, strokes])
            onChange(redo.at(-1)!)
            setRedo(redo.slice(0, -1))
          }}
        >
          <Redo2 size={18} />
        </button>
        <button
          className={`icon-button ${penOnly ? 'active' : ''}`}
          aria-pressed={penOnly}
          title={pick('仅触笔绘制（忽略手指）', 'Stylus only (ignore touch)')}
          aria-label={pick('仅触笔绘制', 'Stylus only')}
          onClick={() => setPenOnly(!penOnly)}
        >
          <Hand size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={pick('下载手写 SVG', 'Download drawing as SVG')}
          title={pick('下载 SVG', 'Download SVG')}
          onClick={() => download(drawingSvg(strokes), `${safeName(title)}.svg`, 'image/svg+xml')}
        >
          <Download size={18} />
        </button>
      </div>
      <div className="drawing-paper">
        <svg
          ref={svg}
          viewBox="0 0 1200 900"
          role="img"
          aria-label={pick('手写画板', 'Drawing canvas')}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          style={{ touchAction: 'none' }}
        >
          <defs>
            <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#d8dfda" />
            </pattern>
          </defs>
          <rect width="1200" height="900" fill="url(#dots)" />
          {[...strokes, ...(draft ? [draft] : [])].map((s) => (
            <path
              key={s.id}
              d={strokePath(s)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {!strokes.length && !draft ? (
          <div className="drawing-hint">
            <PenTool size={28} />
            <span>{pick('画出你的思路', 'Draw your thinking')}</span>
            <small>{pick('触笔、手指或鼠标，都可以开始', 'Start with a stylus, finger, or mouse')}</small>
          </div>
        ) : null}
      </div>
      <div className="drawing-foot">
        <span>{pick(`${strokes.length} 笔 · 自动保存`, `${strokes.length} strokes · Autosaved`)}</span>
        <span>{penOnly
          ? pick('仅触笔模式 · 手指不会留下笔迹', 'Stylus only · Touch will not draw')
          : pick('iPad 可开启仅触笔模式，减少误触', 'On iPad, enable stylus-only mode to prevent accidental marks')}</span>
      </div>
    </div>
  )
}
