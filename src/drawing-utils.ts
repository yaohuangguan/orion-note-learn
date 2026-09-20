import type { Stroke } from './domain'
export function strokePath(stroke: Stroke) {
  return (
    stroke.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    (stroke.points.length === 1 ? ' l0.1,0.1' : '')
  )
}
export function drawingSvg(strokes: Stroke[]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="white"/>${strokes.map((s) => `<path d="${strokePath(s)}" stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`
}
