import type { Note } from './domain'
import { drawingSvg } from './drawing-utils'
import { download, safeName, sanitizeHtml, htmlText } from './storage'

export function exportMarkdown(note: Note) {
  const doc = new DOMParser().parseFromString(note.html, 'text/html')
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (!(node instanceof Element)) return ''
    const inner = Array.from(node.childNodes).map(walk).join('')
    switch (node.tagName.toLowerCase()) {
      case 'h1':
        return `# ${inner}\n\n`
      case 'h2':
        return `## ${inner}\n\n`
      case 'h3':
        return `### ${inner}\n\n`
      case 'p':
        return `${inner}\n\n`
      case 'strong':
        return `**${inner}**`
      case 'em':
        return `*${inner}*`
      case 's':
        return `~~${inner}~~`
      case 'blockquote':
        return `${inner
          .trim()
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n')}\n\n`
      case 'li':
        return `${node.parentElement?.tagName === 'OL' ? `${Array.from(node.parentElement.children).indexOf(node) + 1}.` : '-'} ${inner.trim()}\n`
      case 'ul':
      case 'ol':
        return `${inner}\n`
      case 'pre':
        return `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`
      case 'code':
        return `\`${inner}\``
      case 'br':
        return '\n'
      case 'a':
        return `[${inner}](${node.getAttribute('href') || ''})`
      default:
        return inner
    }
  }
  const body = Array.from(doc.body.childNodes).map(walk).join('')
  download(
    `# ${note.title}\n\n${body}${note.strokes.length ? '\n> 本笔记包含手写内容，请另行导出 SVG 或 PDF。\n' : ''}`,
    `${safeName(note.title)}.md`,
    'text/markdown;charset=utf-8',
  )
}
export function exportPlainText(note: Note) {
  download(`${note.title}\n\n${htmlText(note.html)}`, `${safeName(note.title)}.txt`)
}

export async function exportPDF(note: Note) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  const root = document.createElement('div')
  root.className = 'pdf-document'
  Object.assign(root.style, {
    position: 'absolute',
    left: '-10000px',
    top: '0',
    width: '760px',
    background: '#ffffff',
    color: '#23342c',
    padding: '0',
    fontSize: '17px',
    lineHeight: '1.8',
  })
  const title = document.createElement('h1')
  title.textContent = note.title || '无标题笔记'
  root.append(title)
  const metadata = document.createElement('p')
  metadata.textContent = `ORION NOTE LEARN  /  ${note.folder}`
  metadata.style.color = '#718078'
  root.append(metadata)
  const content = document.createElement('div')
  content.innerHTML = sanitizeHtml(note.html)
  root.append(...Array.from(content.children))
  if (note.strokes.length) {
    const heading = document.createElement('h2')
    heading.textContent = '手写笔记'
    root.append(heading)
    const image = new Image()
    image.width = 760
    image.height = 570
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawingSvg(note.strokes))}`
    await image.decode()
    const block = document.createElement('div')
    block.append(image)
    root.append(block)
  }
  document.body.append(root)
  try {
    await document.fonts.ready
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const width = 178,
      height = 257,
      left = 16,
      top = 18
    let cursor = 0
    for (const block of Array.from(root.children)) {
      const el = block as HTMLElement
      // Render in bounded tiles so very long notes do not exceed browser canvas limits.
      const total = Math.ceil(el.getBoundingClientRect().height)
      if (!total) continue
      const maxTile = 1000
      for (let offset = 0; offset < total; offset += maxTile) {
        const canvas = await html2canvas(el, {
          scale: 1.8,
          backgroundColor: '#ffffff',
          logging: false,
          width: 760,
          height: Math.min(maxTile, total - offset),
          y: offset,
          windowWidth: 1000,
        })
        const imageHeight = (canvas.height / canvas.width) * width
        if (cursor && cursor + imageHeight > height) {
          pdf.addPage()
          cursor = 0
        }
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.94),
          'JPEG',
          left,
          top + cursor,
          width,
          imageHeight,
        )
        cursor += imageHeight + 3
      }
    }
    const pages = pdf.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i)
      pdf.setFontSize(9)
      pdf.setTextColor('#8a958d')
      pdf.text(`ORION  /  ${i} - ${pages}`, 16, 288)
    }
    pdf.save(`${safeName(note.title)}.pdf`)
  } finally {
    root.remove()
  }
}
