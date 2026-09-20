import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { request } from 'node:http'
import type { Server } from 'node:http'
import app from '../server/app'

let server: Server
let port: number
beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  port = (server.address() as { port: number }).port
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
})
const payload = {
  apiKey: 'fake-integration-key',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'example-model',
  task: 'summary',
  title: '学习笔记',
  content: '主动回忆可以帮助发现知识盲点。',
}
function post(body: unknown, origin?: string) {
  return new Promise<{ status: number; body: Record<string, string>; cache: unknown }>(
    (resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/ai',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin || `http://127.0.0.1:${port}`,
          },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              body: JSON.parse(data),
              cache: res.headers['cache-control'],
            }),
          )
        },
      )
      req.on('error', reject)
      req.end(JSON.stringify(body))
    },
  )
}
describe('actual HTTP API with mocked upstream', () => {
  it('forwards current note and transient key and returns model content', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ choices: [{ message: { content: '总结：主动回忆。' } }] }))
    const res = await post(payload)
    expect(res.status).toBe(200)
    expect(res.body.content).toBe('总结：主动回忆。')
    expect(res.cache).toBe('no-store')
    const [url, options] = upstream.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(options?.redirect).toBe('error')
    expect(JSON.stringify(options?.headers)).toContain('fake-integration-key')
    expect(options?.body).toContain(payload.content)
    expect(JSON.stringify(res)).not.toContain('fake-integration-key')
  })
  it('rejects a different origin before calling an upstream', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch')
    expect((await post(payload, 'https://evil.example')).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('rejects unapproved endpoint and empty note', async () => {
    expect((await post({ ...payload, baseUrl: 'https://127.0.0.1/v1' })).status).toBe(400)
    expect((await post({ ...payload, content: '' })).status).toBe(400)
  })
  it('returns a useful auth error without exposing upstream response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream private details', { status: 401 }),
    )
    const res = await post(payload)
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('API Key 无效')
    expect(JSON.stringify(res)).not.toContain('private details')
  })
  it('handles network and empty-model responses', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(Response.json({ choices: [] }))
    expect((await post(payload)).body.error).toContain('无法连接')
    expect((await post(payload)).body.error).toContain('没有返回有效文本')
  })
})
