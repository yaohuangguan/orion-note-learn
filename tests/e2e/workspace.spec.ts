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
test('local OCR imports recognized text without uploading the source image', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ORION_OCR_TEST__ = async () => [
      { text: '无线通信与 SNR', score: 0.97 },
      { text: 'Signal to Noise Ratio', score: 0.92 },
      { text: '手写中文也可以先识别再修改', score: 0.68 },
    ]
  })

  const uploadedRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploadedRequests.push(request.url())
  })

  await ready(page)
  await page.getByRole('button', { name: '拍照 / 图片 OCR' }).click()
  const dialog = page.getByRole('dialog', { name: '拍照 / 图片 OCR 导入' })
  await expect(dialog.getByText('图片不会上传，也不会存储')).toBeVisible()

  await dialog.getByLabel('上传图片识别文字').setInputFiles({
    name: 'handwritten-notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })

  const result = dialog.getByLabel('OCR 识别文字')
  await expect(result).toHaveValue(/无线通信与 SNR/)
  await dialog.getByText('查看识别置信度').click()
  await expect(dialog.getByText('68%')).toBeVisible()
  await result.fill('无线通信与 SNR\nSignal to Noise Ratio\n我修正后的手写中文')
  await dialog.getByRole('button', { name: '插入当前笔记' }).click()

  const editor = page.getByRole('textbox', { name: '笔记正文' })
  await expect(editor).toContainText('无线通信与 SNR')
  await expect(editor).toContainText('我修正后的手写中文')
  expect(uploadedRequests.some((url) => url.includes('/v1/images'))).toBe(false)
})

test('account sync restores notes and R2 images on another device', async ({ page, browser }) => {
  const email = `cloud-${Date.now()}@example.com`
  const password = 'test-password-123'
  await ready(page)
  await page.getByRole('button', { name: '账户与云同步' }).click()
  const account = page.getByRole('dialog', { name: '登录 Orion Note Learn' })
  await account.getByRole('tab', { name: '注册' }).click()
  await account.getByLabel('邮箱').fill(email)
  await account.getByLabel('密码').fill(password)
  await account.getByRole('button', { name: '创建账户' }).click()
  await expect(page.getByRole('dialog', { name: '账户与云同步' })).toContainText('已连接云端')
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByRole('button', { name: '新建笔记', exact: false }).first().click()
  await page.getByLabel('笔记标题', { exact: true }).fill('跨设备 R2 图片')
  const editor = page.getByRole('textbox', { name: '笔记正文' })
  await editor.fill('这篇笔记来自第一台设备。')
  await editor.click()
  await page.evaluate(() => {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'cloud.png', { type: 'image/png' }))
    document.querySelector<HTMLElement>('[contenteditable="true"]')?.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    )
  })
  await expect(page.getByRole('img', { name: 'cloud.png' })).toHaveAttribute(
    'src',
    /^http:\/\/localhost:8787\/v1\/images\//,
  )
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const session = JSON.parse(localStorage.getItem('orion-cloud-session') || 'null')
          const response = await fetch('http://localhost:8787/v1/workspace', {
            headers: { Authorization: `Bearer ${session.token}` },
          })
          const remote = await response.json()
          const note = remote.workspace?.notes?.find(
            (item: { title?: string }) => item.title === '跨设备 R2 图片',
          )
          return note?.html || ''
        }),
      { timeout: 15000 },
    )
    .toMatch(/http:\/\/localhost:8787\/v1\/images\//)

  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  await ready(second)
  await second.getByRole('button', { name: '账户与云同步' }).click()
  const login = second.getByRole('dialog', { name: '登录 Orion Note Learn' })
  await login.getByLabel('邮箱').fill(email)
  await login.getByLabel('密码').fill(password)
  await login.getByRole('button', { name: '登录并同步' }).click()
  await expect(second.getByRole('button', { name: '跨设备 R2 图片', exact: true })).toBeVisible()
  await second.getByRole('button', { name: '关闭弹窗' }).click()
  await second.getByRole('button', { name: '跨设备 R2 图片', exact: true }).click()
  await expect(second.getByRole('textbox', { name: '笔记正文' })).toContainText(
    '这篇笔记来自第一台设备。',
  )
  await expect(second.getByRole('img', { name: 'cloud.png' })).toHaveAttribute(
    'src',
    /^http:\/\/localhost:8787\/v1\/images\//,
  )
  await secondContext.close()
})
test('encrypted image blobs require authentication and are not public images', async ({ page }) => {
  const email = `encrypted-image-${Date.now()}@example.com`
  const password = 'test-password-123'

  await ready(page)
  await page.getByRole('button', { name: '账户与云同步' }).click()
  const account = page.getByRole('dialog', { name: '登录 Orion Note Learn' })
  await account.getByRole('tab', { name: '注册' }).click()
  await account.getByLabel('邮箱').fill(email)
  await account.getByLabel('密码').fill(password)
  await account.getByRole('button', { name: '创建账户' }).click()
  await expect(page.getByRole('dialog', { name: '账户与云同步' })).toContainText('已连接云端')

  const result = await page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('orion-cloud-session') || 'null')
    const encrypted = new Uint8Array(64)
    crypto.getRandomValues(encrypted)
    const upload = await fetch('http://localhost:8787/v1/private-images', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: encrypted,
    })
    const uploaded = await upload.json()
    const authenticated = await fetch(uploaded.src, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    const restored = new Uint8Array(await authenticated.arrayBuffer())
    const anonymous = await fetch(uploaded.src)
    const publicAttempt = await fetch(
      uploaded.src.replace('/v1/private-images/', '/v1/images/'),
    )
    return {
      uploadStatus: upload.status,
      authenticatedStatus: authenticated.status,
      anonymousStatus: anonymous.status,
      publicStatus: publicAttempt.status,
      sameBytes:
        restored.length === encrypted.length &&
        restored.every((value, index) => value === encrypted[index]),
    }
  })

  expect(result).toEqual({
    uploadStatus: 201,
    authenticatedStatus: 200,
    anonymousStatus: 401,
    publicStatus: 404,
    sameBytes: true,
  })
})

test('account registration submits browser-autofilled DOM values', async ({ page }) => {
  const email = `autofill-${Date.now()}@example.com`
  const password = 'autofill-password-123'
  const captured = {
    registerBody: null as { email?: string; passwordProof?: string } | null,
  }

  await ready(page)
  await page.route('**/v1/auth/register', async (route) => {
    captured.registerBody = route.request().postDataJSON()
    await route.fulfill({
      status: 409,
      json: { error: 'This email is already registered. Sign in instead.' },
    })
  })

  await page.getByRole('button', { name: '账户与云同步' }).click()
  const account = page.getByRole('dialog', { name: '登录 Orion Note Learn' })
  await account.getByRole('tab', { name: '注册' }).click()
  const emailInput = account.getByLabel('邮箱')
  const passwordInput = account.getByLabel('密码')

  await emailInput.evaluate((input, value) => {
    ;(input as HTMLInputElement).value = value
  }, email)
  await passwordInput.evaluate((input, value) => {
    ;(input as HTMLInputElement).value = value
  }, password)

  // Autofilled values must survive React re-renders when switching auth modes.
  await account.getByRole('tab', { name: '登录' }).click()
  await account.getByRole('tab', { name: '注册' }).click()

  await account.getByRole('button', { name: '创建账户' }).click()

  await expect.poll(() => captured.registerBody?.email).toBe(email)
  expect(captured.registerBody?.passwordProof).toMatch(/^[A-Za-z0-9_-]{43}$/)
})

test('public share opens without login and can be saved after signing in', async ({ page, browser }) => {
  const ownerEmail = `share-owner-${Date.now()}@example.com`
  const readerEmail = `share-reader-${Date.now()}@example.com`
  const password = 'test-password-123'

  await ready(page)
  await page.getByRole('button', { name: '账户与云同步' }).click()
  const ownerAccount = page.getByRole('dialog', { name: '登录 Orion Note Learn' })
  await ownerAccount.getByRole('tab', { name: '注册' }).click()
  await ownerAccount.getByLabel('邮箱').fill(ownerEmail)
  await ownerAccount.getByLabel('密码').fill(password)
  await ownerAccount.getByRole('button', { name: '创建账户' }).click()
  await expect(page.getByRole('dialog', { name: '账户与云同步' })).toContainText('已连接云端')
  await page.getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByRole('button', { name: '新建笔记', exact: false }).first().click()
  await page.getByLabel('笔记标题', { exact: true }).fill('可以公开阅读的 Orion 文章')
  await page.getByRole('textbox', { name: '笔记正文' }).fill('这篇文章不登录也可以阅读，登录以后可以收藏。')
  await page.getByRole('button', { name: '分享文章' }).click()

  const shareDialog = page.getByRole('dialog', { name: '分享这篇笔记' })
  const shareInput = shareDialog.getByLabel('公开文章链接')
  await expect(shareInput).toHaveValue(/\/share\/[A-Za-z0-9_-]{20,64}$/)
  const shareUrl = await shareInput.inputValue()

  const readerContext = await browser.newContext()
  const reader = await readerContext.newPage()
  await reader.goto(shareUrl)
  await expect(reader.getByRole('heading', { name: '可以公开阅读的 Orion 文章' })).toBeVisible()
  await expect(reader.getByText('这篇文章不登录也可以阅读，登录以后可以收藏。')).toBeVisible()
  await expect(reader.getByRole('button', { name: '登录后收藏' })).toBeVisible()

  await reader.getByRole('button', { name: '登录后收藏' }).click()
  const readerAccount = reader.getByRole('dialog', { name: '登录 Orion 后收藏' })
  await readerAccount.getByRole('tab', { name: '注册' }).click()
  await readerAccount.getByLabel('邮箱').fill(readerEmail)
  await readerAccount.getByLabel('密码').fill(password)
  await readerAccount.getByRole('button', { name: '创建账户并收藏' }).click()

  await expect(reader).toHaveURL(/\/?\?note=/)
  await expect(reader.getByLabel('笔记标题', { exact: true })).toHaveValue('可以公开阅读的 Orion 文章')
  await expect(reader.getByRole('textbox', { name: '笔记正文' })).toContainText(
    '这篇文章不登录也可以阅读，登录以后可以收藏。',
  )
  await readerContext.close()
})

test('English UI can be selected and persists after reload', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('界面语言').selectOption('en')
  const settings = page.getByRole('dialog', { name: 'AI & preferences' })
  await expect(settings.getByText('Your AI, your key')).toBeVisible()
  await settings.getByRole('button', { name: 'Save settings' }).click()

  await expect(page.getByRole('button', { name: 'New note', exact: false }).first()).toBeVisible()
  await expect(page.getByLabel('Search notes')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'All notes', exact: false })).toBeVisible()
  await expect(page.getByLabel('Note title')).toBeVisible()
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
