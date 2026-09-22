import { describe, expect, it } from 'vitest'
import { articleText, renderSharePage } from '../api/share-page'

describe('public share SEO rendering', () => {
  it('extracts readable article text without executable markup', () => {
    const text = articleText(
      '<h2>无线链路基础</h2><p>SNR 是信号与噪声的比值。</p><script>alert(1)</script><ul><li>第一点</li><li>第二点</li></ul>',
    )

    expect(text).toContain('无线链路基础')
    expect(text).toContain('SNR 是信号与噪声的比值。')
    expect(text).toContain('• 第一点')
    expect(text).not.toContain('alert(1)')
  })

  it('puts the article and SEO metadata in the initial HTML source', async () => {
    const html = await renderSharePage(
      {
        id: 'abcdefghijklmnopqrstuvwx',
        title: '卫星通信学习笔记',
        html: '<h2>链路预算</h2><p>接收功率由发射功率、增益和路径损耗共同决定。</p>',
        tags: ['通信', '学习笔记'],
        createdAt: Date.UTC(2026, 8, 22),
        updatedAt: Date.UTC(2026, 8, 23),
      },
      'https://orion-note-learn.vercel.app',
      'https://orion-note-learn-sync.example.workers.dev',
    )

    expect(html).toContain('<title>卫星通信学习笔记 | Orion Note Learn</title>')
    expect(html).toContain('rel="canonical" href="https://orion-note-learn.vercel.app/share/abcdefghijklmnopqrstuvwx"')
    expect(html).toContain('name="robots" content="index,follow')
    expect(html).toContain('property="og:title" content="卫星通信学习笔记"')
    expect(html).toContain('"@type":"Article"')
    expect(html).toContain('链路预算')
    expect(html).toContain('接收功率由发射功率、增益和路径损耗共同决定。')
    expect(html).toContain('window.__ORION_PUBLIC_SHARE__=')
  })

  it('escapes hostile article text in the server-rendered fallback', async () => {
    const html = await renderSharePage(
      {
        id: 'abcdefghijklmnopqrstuvwx',
        title: '<img src=x onerror=alert(1)>',
        html: '<p>Hello &lt;world&gt;</p><img src=x onerror=alert(1)>',
        tags: [],
        createdAt: 1,
        updatedAt: 2,
      },
      'https://example.com',
      'https://worker.example.com',
    )

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Hello &lt;world&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })
})
