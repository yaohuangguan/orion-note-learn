import { test, expect, type Page } from '@playwright/test'
async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByLabel('笔记标题', { exact: true })).toHaveValue('把学过的，变成真正掌握的')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
}
async function configureAI(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('API Key', { exact: true }).fill('test-key-not-a-real-secret')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
}
test('create, edit, persist, search and restore a note', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '新建笔记', exact: false }).first().click()
  await page.getByLabel('笔记标题', { exact: true }).fill('测试 · 间隔复习计划')
  await page
    .getByRole('textbox', { name: '笔记正文' })
    .fill('用自己的话解释概念，比反复重读更能检验理解。')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '测试 · 间隔复习计划', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '笔记正文' })).toContainText('检验理解')
  await page.getByLabel('搜索笔记').fill('检验理解')
  await expect(page.locator('.note-card')).toHaveCount(1)
  await page.getByRole('button', { name: '删除 测试 · 间隔复习计划', exact: true }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await expect(page.locator('.note-card')).toHaveCount(1)
  await page.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.locator('.note-card')).toHaveCount(0)
})
test('pasted images and LaTeX formulas render and persist', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '新建笔记', exact: false }).first().click()
  await page.getByLabel('笔记标题', { exact: true }).fill('公式与图片')
  const editor = page.getByRole('textbox', { name: '笔记正文' })
  await editor.fill('')
  await editor.click()

  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      String.raw`毫瓦换算：\(P(\text{mW}) = 10^{\frac{\text{dBm}}{10}}\)`,
    )
    document.querySelector<HTMLElement>('[contenteditable="true"]')?.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    )
  })

  const formula = page.locator('[data-type="inline-math"]')
  await expect(formula).toHaveAttribute(
    'data-latex',
    String.raw`P(\text{mW}) = 10^{\frac{\text{dBm}}{10}}`,
  )
  await expect(formula.locator('.katex .mfrac')).toBeVisible()
  await expect(formula.locator('.katex .msupsub')).toBeVisible()

  await page.evaluate(() => {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }))
    document.querySelector<HTMLElement>('[contenteditable="true"]')?.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    )
  })

  const image = editor.locator('img[alt="clipboard.png"]')
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('orion-note-learn')
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const db = request.result
              const read = db.transaction('workspace').objectStore('workspace').get('data')
              read.onerror = () => reject(read.error)
              read.onsuccess = () => {
                const note = read.result?.notes?.find(
                  (item: { title?: string }) => item.title === '公式与图片',
                )
                resolve(
                  Boolean(
                    note?.html?.includes('data-type="inline-math"') &&
                      note.html.includes('data:image/png;base64,'),
                  ),
                )
                db.close()
              }
            }
          }),
      ),
    )
    .toBe(true)
  await page.reload()
  await page.getByRole('button', { name: '公式与图片', exact: true }).click()
  await expect(page.getByLabel('笔记标题', { exact: true })).toHaveValue('公式与图片')
  await expect(page.locator('[data-type="inline-math"] .katex .mfrac')).toBeVisible()
  await expect(page.getByRole('img', { name: 'clipboard.png' })).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  )
})
test('handwriting supports strokes, undo, redo and reload', async ({ page }) => {
  await ready(page)
  await page.getByRole('tab', { name: '手写画板' }).click()
  const board = page.getByRole('img', { name: '手写画板' })
  const box = (await board.boundingBox())!
  await page.mouse.move(box.x + 70, box.y + 90)
  await page.mouse.down()
  await page.mouse.move(box.x + 170, box.y + 140, { steps: 12 })
  await page.mouse.up()
  await expect(board.locator('path')).toHaveCount(1)
  await page.getByRole('button', { name: '撤销笔画' }).click()
  await expect(board.locator('path')).toHaveCount(0)
  await page.getByRole('button', { name: '重做笔画' }).click()
  await expect(board.locator('path')).toHaveCount(1)
  await page.getByRole('button', { name: '整笔橡皮擦', exact: true }).click()
  await page.mouse.click(box.x + 70, box.y + 90)
  await expect(board.locator('path')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销笔画' }).click()
  await expect(board.locator('path')).toHaveCount(1)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: '手写画板' }).click()
  await expect(board.locator('path')).toHaveCount(1)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载手写 SVG' }).click()
  expect((await event).suggestedFilename()).toMatch(/\.svg$/)
})
test('review ratings persist the next review date', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: /学习与复习/ }).click()
  await page.getByRole('button', { name: /查看答案/ }).click()
  await expect(page.locator('.flashcard-answer')).toContainText('主动回忆')
  await page.getByRole('button', { name: /很有把握/ }).click()
  await page.getByRole('button', { name: /查看答案/ }).click()
  await page.getByRole('button', { name: /基本掌握/ }).click()
  await expect(page.getByText('这一轮，你又前进了一点。')).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /学习与复习/ }).click()
  await expect(page.getByText('暂时没有待复习的闪卡')).toBeVisible()
})
test('AI results integrate into notes and cards without storing the key', async ({ page }) => {
  await ready(page)
  await configureAI(page)
  await page.route('**/api/ai', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.content).toContain('学习不只是收集信息')
    expect(body.apiKey).toBe('test-key-not-a-real-secret')
    const content =
      body.task === 'cards'
        ? JSON.stringify({
            cards: [{ question: '如何检验理解？', answer: '用自己的语言解释，并进行主动回忆。' }],
          })
        : '## 学习要点\n\n主动回忆、间隔复习与费曼练习。'
    await route.fulfill({ json: { content } })
  })
  await page.getByRole('button', { name: /提炼重点/ }).click()
  await expect(page.locator('.ai-result')).toContainText('学习要点')
  await page.getByRole('button', { name: '追加到笔记' }).click()
  await expect(page.getByRole('textbox', { name: '笔记正文' })).toContainText('AI 学习整理')
  await page.getByRole('button', { name: /生成闪卡/ }).click()
  await page.getByRole('button', { name: '加入 1 张闪卡' }).click()
  await expect(page.getByRole('button', { name: '已加入复习' })).toBeDisabled()
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain('test-key-not-a-real-secret')
  await page.getByRole('button', { name: '导入与备份', exact: true }).click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出完整备份' }).click()
  const stream = await (await event).createReadStream()
  const chunks = []
  for await (const chunk of stream!) chunks.push(chunk)
  const backup = Buffer.concat(chunks).toString('utf8')
  expect(backup).not.toContain('test-key-not-a-real-secret')
  expect(JSON.parse(backup).cards).toHaveLength(3)
})
test('AI errors and invalid generated cards are visible', async ({ page }) => {
  await ready(page)
  await configureAI(page)
  await page.route('**/api/ai', (route) =>
    route.fulfill({ status: 502, json: { error: 'API Key 无效或没有访问该模型的权限。' } }),
  )
  await page.getByRole('button', { name: /提炼重点/ }).click()
  await expect(page.getByRole('alert')).toContainText('API Key 无效')
  await page.unroute('**/api/ai')
  await page.route('**/api/ai', (route) => route.fulfill({ json: { content: '{"cards":[]}' } }))
  await page.getByRole('button', { name: /生成闪卡/ }).click()
  await expect(page.getByRole('alert')).toContainText('闪卡格式不正确')
})
test('import rejects invalid backups and sanitizes Markdown', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '导入与备份', exact: true }).click()
  await page
    .getByLabel('选择导入文件')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":9}'),
    })
  await expect(page.getByRole('alert')).toContainText('未导入任何数据')
  await page
    .getByLabel('选择导入文件')
    .setInputFiles({
      name: '导入笔记.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# 学习\n\n<script>window.injected=true</script>\n\n<img src=x onerror="window.injected=true">\n\n我的知识。',
      ),
    })
  await expect(page.getByLabel('笔记标题', { exact: true })).toHaveValue('导入笔记')
  await expect(page.getByRole('textbox', { name: '笔记正文' })).toContainText('我的知识')
  expect(
    await page.evaluate(() => (window as unknown as { injected?: boolean }).injected),
  ).toBeUndefined()
})
test('downloads a real PDF with Chinese note content', async ({ page }) => {
  await ready(page)
  await page.locator('.export-menu summary').click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PDF（含手写）' }).click()
  const download = await event
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream!) chunks.push(chunk)
  const content = Buffer.concat(chunks)
  expect(content.subarray(0, 4).toString()).toBe('%PDF')
  expect(content.length).toBeGreaterThan(10000)
})
for (const size of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 1000 },
]) {
  test(`responsive workspace ${size.width}px has no horizontal overflow`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize(size)
    await ready(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    if (size.width < 860) {
      await page.getByRole('button', { name: '打开侧栏' }).click()
      await expect(page.getByLabel('搜索笔记')).toBeVisible()
      await page.getByRole('button', { name: '关闭侧栏' }).click()
    }
    await page.locator('.ai-toggle').click()
    if (size.width < 1180) await expect(page.getByLabel('AI 学习伙伴')).toBeVisible()
    expect(errors).toEqual([])
  })
}
