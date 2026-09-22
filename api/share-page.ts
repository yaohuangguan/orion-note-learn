type SharePayload = {
  id: string
  title: string
  html: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

type RequestLike = {
  query?: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  status(code: number): ResponseLike
  setHeader(name: string, value: string): void
  send(body: string): void
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeEntity(entity: string) {
  if (entity[1] === '#') {
    const hex = entity[2]?.toLowerCase() === 'x'
    const raw = entity.slice(hex ? 3 : 2, -1)
    const value = Number.parseInt(raw, hex ? 16 : 10)
    if (Number.isFinite(value) && value > 0 && value <= 0x10ffff)
      return String.fromCodePoint(value)
    return ''
  }
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return named[entity.slice(1, -1).toLowerCase()] ?? ' '
}

function decodeEntities(value: string) {
  return value.replace(/&(?:#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi, decodeEntity)
}

export function articleText(html: string) {
  let value = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')

  value = value.replace(
    /<[^>]*\bdata-latex=(["'])(.*?)\1[^>]*>(?:[\s\S]*?<\/[^>]+>)?/gi,
    (_match, _quote, latex: string) => ` $${decodeEntities(latex)}$ `,
  )
  value = value.replace(
    /<img\b[^>]*\balt=(["'])(.*?)\1[^>]*>/gi,
    (_match, _quote, alt: string) => ` [图片：${decodeEntities(alt)}] `,
  )
  value = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|section|article|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')

  return decodeEntities(value)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function excerpt(text: string, max = 180) {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1).trimEnd()}…`
}

function safeJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function firstSafeImage(html: string, workerBase: string) {
  const match = html.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)
  if (!match?.[2]) return ''
  try {
    const image = new URL(decodeEntities(match[2]))
    const worker = new URL(workerBase)
    if (
      image.protocol === 'https:' &&
      image.origin === worker.origin &&
      /^\/v1\/images\/[A-Za-z0-9_-]{40,64}$/.test(image.pathname)
    )
      return image.toString()
  } catch {
    /* Invalid image URLs are ignored for SEO metadata. */
  }
  return ''
}

function languageFor(text: string) {
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length
  const letters = (text.match(/[A-Za-z]/g) || []).length
  return cjk > Math.max(8, letters * 0.18) ? 'zh-CN' : 'en'
}

function paragraphHtml(text: string) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  if (!blocks.length) return '<p></p>'
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function appAssetTags(origin: string) {
  try {
    const response = await fetch(`${origin}/index.html`, {
      headers: { 'User-Agent': 'Orion-Share-Renderer/1.0' },
    })
    if (!response.ok) return ''
    const source = await response.text()
    const tags: string[] = []
    const assetPath = /^\/assets\/[A-Za-z0-9._\/-]+$/

    for (const match of source.matchAll(/<link\b([^>]+)>/gi)) {
      const attrs = match[1]
      const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1]
      const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] || ''
      if (
        href &&
        assetPath.test(href) &&
        (rel === 'stylesheet' || rel === 'modulepreload')
      )
        tags.push(
          `<link rel="${escapeHtml(rel)}" href="${escapeHtml(href)}" crossorigin>`,
        )
    }
    for (const match of source.matchAll(/<script\b([^>]*)><\/script>/gi)) {
      const attrs = match[1]
      const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1]
      if (src && assetPath.test(src))
        tags.push(`<script type="module" src="${escapeHtml(src)}" crossorigin></script>`)
    }
    return [...new Set(tags)].join('\n')
  } catch {
    return ''
  }
}

function baseStyles() {
  return `
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#283b33;background:#fbfcf9}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -20%,#edf3e8 0,transparent 35%),#fbfcf9}
    a{color:inherit;text-decoration:none}.seo-topbar{height:68px;padding:0 28px;border-bottom:1px solid #e6eae2;background:rgba(251,252,249,.94);display:flex;align-items:center;justify-content:space-between}
    .seo-brand{font:600 24px Georgia,"Songti SC",serif;color:#315c4d}.seo-shell{width:min(860px,calc(100% - 36px));margin:0 auto;padding:44px 0 80px}
    .seo-save{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin-bottom:18px;padding:18px 20px;border:1px solid #e1e7dc;border-radius:12px;background:#f4f7ef}
    .seo-save strong{display:block;margin-bottom:5px}.seo-save p{margin:0;color:#7c887a;font-size:13px;line-height:1.55}.seo-button{display:inline-flex;align-items:center;justify-content:center;padding:10px 15px;border-radius:7px;background:#315c4d;color:#fff;font-size:13px;font-weight:600;white-space:nowrap}
    .seo-article{background:#fff;border:1px solid #e8ece5;border-radius:15px;padding:clamp(28px,5vw,64px);box-shadow:0 20px 60px #293c2d0a}.seo-kicker{margin-bottom:18px;color:#829079;font-size:11px;font-weight:600;letter-spacing:1.7px}
    .seo-article h1{margin:0;color:#283d31;font:600 clamp(32px,6vw,52px)/1.13 Georgia,"Songti SC",serif;letter-spacing:-1px}.seo-meta{margin:18px 0 38px;padding-bottom:20px;border-bottom:1px solid #edf0ea;color:#90998d;font-size:12px}
    .seo-body{font-size:15px;line-height:1.95;color:#34453b}.seo-body p{margin:0 0 20px}
    @media(max-width:700px){.seo-topbar{height:60px;padding:0 14px}.seo-shell{width:min(100% - 20px,860px);padding:22px 0 50px}.seo-article{padding:26px 20px 34px;border-radius:11px}.seo-save{grid-template-columns:1fr}.seo-button{width:100%}}
  `
}

function noIndexPage(status: number, message: string, origin: string) {
  return {
    status,
    html: `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>文章无法打开 | Orion Note Learn</title>
<style>${baseStyles()}</style>
</head>
<body>
<header class="seo-topbar"><a class="seo-brand" href="/">orion · NOTE & LEARN</a></header>
<main class="seo-shell"><article class="seo-article"><div class="seo-kicker">ORION · SHARED ARTICLE</div><h1>文章无法打开</h1><div class="seo-body"><p>${escapeHtml(message)}</p><p><a class="seo-button" href="${escapeHtml(origin)}/">打开 Orion</a></p></div></article></main>
</body>
</html>`,
  }
}

export async function renderSharePage(
  share: SharePayload,
  origin: string,
  workerBase: string,
  assets = '',
) {
  const text = articleText(share.html)
  const lang = languageFor(text)
  const title = share.title.trim() || (lang === 'zh-CN' ? '无标题笔记' : 'Untitled note')
  const description =
    excerpt(text) ||
    (lang === 'zh-CN' ? '通过 Orion Note Learn 分享的文章。' : 'An article shared with Orion Note Learn.')
  const canonical = `${origin}/share/${encodeURIComponent(share.id)}`
  const image = firstSafeImage(share.html, workerBase)
  const tags = share.tags.filter((tag) => tag.trim()).slice(0, 20)
  const datePublished = new Date(share.createdAt).toISOString()
  const dateModified = new Date(share.updatedAt).toISOString()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished,
    dateModified,
    mainEntityOfPage: canonical,
    publisher: {
      '@type': 'Organization',
      name: 'Orion Note Learn',
      url: origin,
    },
    ...(image ? { image: [image] } : {}),
    ...(tags.length ? { keywords: tags.join(', ') } : {}),
  }

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#315c4d">
<title>${escapeHtml(title)} | Orion Note Learn</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Orion Note Learn">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="article:published_time" content="${escapeHtml(datePublished)}">
<meta property="article:modified_time" content="${escapeHtml(dateModified)}">
${tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join('\n')}
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
<script type="application/ld+json">${safeJson(jsonLd)}</script>
<style>${baseStyles()}</style>
${assets}
</head>
<body>
<div id="root">
<header class="seo-topbar">
  <a class="seo-brand" href="/">orion · NOTE & LEARN</a>
  <a href="/" aria-label="打开 Orion">打开我的笔记</a>
</header>
<main class="seo-shell">
  <aside class="seo-save">
    <div><strong>${lang === 'zh-CN' ? '登录后收藏这篇文章' : 'Sign in to save this article'}</strong><p>${lang === 'zh-CN' ? '收藏后会成为你自己的笔记副本，可以继续编辑、加标签和制作闪卡。' : 'Saving creates your own copy so you can edit it, tag it, and turn it into flashcards.'}</p></div>
    <a class="seo-button" href="/">${lang === 'zh-CN' ? '登录后收藏' : 'Sign in to save'}</a>
  </aside>
  <article class="seo-article">
    <div class="seo-kicker">ORION · SHARED ARTICLE</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="seo-meta">${lang === 'zh-CN' ? '更新于' : 'Updated'} ${escapeHtml(new Date(share.updatedAt).toLocaleDateString(lang))}</div>
    <div class="seo-body">${paragraphHtml(text)}</div>
  </article>
</main>
</div>
<script>window.__ORION_PUBLIC_SHARE__=${safeJson(share)};</script>
</body>
</html>`
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  const rawShareId = request.query?.shareId
  const shareId = Array.isArray(rawShareId) ? rawShareId[0] : rawShareId
  const protocol = headerValue(request.headers['x-forwarded-proto']) || 'https'
  const host = headerValue(request.headers.host)
  const origin = host ? `${protocol}://${host}` : 'https://orion-note-learn.vercel.app'

  if (!shareId || !/^[A-Za-z0-9_-]{20,64}$/.test(shareId)) {
    const page = noIndexPage(404, '分享链接无效。', origin)
    response.status(page.status)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60')
    response.send(page.html)
    return
  }

  const workerBase = (process.env.VITE_SYNC_API_URL || '').replace(/\/$/, '')
  if (!workerBase) {
    const page = noIndexPage(503, '分享服务暂时不可用。', origin)
    response.status(page.status)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.send(page.html)
    return
  }

  try {
    const shareResponse = await fetch(
      `${workerBase}/v1/shares/${encodeURIComponent(shareId)}`,
      { headers: { 'Accept-Language': 'zh-CN,en;q=0.8' } },
    )
    if (!shareResponse.ok) {
      const body = (await shareResponse.json().catch(() => ({}))) as { error?: string }
      const page = noIndexPage(
        shareResponse.status === 404 ? 404 : 502,
        body.error || '分享文章暂时无法打开。',
        origin,
      )
      response.status(page.status)
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.setHeader(
        'Cache-Control',
        page.status === 404 ? 'public, max-age=0, s-maxage=60' : 'no-store',
      )
      response.send(page.html)
      return
    }

    const share = (await shareResponse.json()) as SharePayload
    if (
      share.id !== shareId ||
      typeof share.title !== 'string' ||
      typeof share.html !== 'string' ||
      !Array.isArray(share.tags) ||
      typeof share.createdAt !== 'number' ||
      typeof share.updatedAt !== 'number'
    )
      throw new Error('Invalid public share payload')

    const assets = await appAssetTags(origin)
    const html = await renderSharePage(share, origin, workerBase, assets)
    response.status(200)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    response.setHeader('X-Robots-Tag', 'index, follow')
    response.send(html)
  } catch {
    const page = noIndexPage(502, '分享文章暂时无法打开，请稍后重试。', origin)
    response.status(page.status)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.send(page.html)
  }
}
