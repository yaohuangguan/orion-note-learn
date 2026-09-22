import { useState } from 'react'
import { KeyRound, ShieldCheck, ExternalLink, Sparkles } from 'lucide-react'
import { providers, type AISettings } from '../domain'
import { Modal } from './Modal'
import PrivacyPromise from './PrivacyPromise'
import { useI18n } from '../i18n'

export default function Settings({
  settings,
  onSave,
  onClose,
}: {
  settings: AISettings
  onSave: (s: AISettings) => void
  onClose: () => void
}) {
  const { language, setLanguage, pick } = useI18n()
  const [draft, setDraft] = useState(settings)
  return (
    <Modal title={pick('AI 与偏好设置', 'AI & preferences')} onClose={onClose}>
      <div className="settings-intro">
        <div className="feature-icon">
          <KeyRound size={23} />
        </div>
        <div>
          <h3>{pick('你自己的 AI，你自己的密钥', 'Your AI, your key')}</h3>
          <p>{pick('选择服务商，让 AI 帮你理解当前笔记。', 'Choose a provider and let AI help you understand this note.')}</p>
        </div>
      </div>
      <PrivacyPromise className="settings-privacy-promise" />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
          onClose()
        }}
      >
        <label className="field">
          {pick('界面语言', 'Interface language')}
          <select value={language} onChange={(event) => setLanguage(event.target.value as 'zh' | 'en')}>
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          {pick('AI 服务商', 'AI provider')}
          <select
            value={draft.provider}
            onChange={(e) => {
              const p = providers.find((p) => p.id === e.target.value)!
              setDraft({ provider: p.id, baseUrl: p.baseUrl, model: p.model, apiKey: '' })
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === 'orion-free'
                  ? pick('Orion 免费试用（无需 Key）', 'Orion Free Trial (no key)')
                  : p.id === 'custom'
                    ? pick('自定义兼容接口', 'Custom compatible API')
                    : p.name}
              </option>
            ))}
          </select>
        </label>

        {draft.provider === 'orion-free' ? (
          <div className="ai-free-callout">
            <Sparkles size={20} />
            <div>
              <strong>{pick('直接试用学习伙伴', 'Try the study partner immediately')}</strong>
              <p>
                {pick(
                  '无需 API Key。当前笔记文字只会在你主动使用 AI 功能时发送到 Cloudflare Workers AI；未登录用户每天 3 次，登录用户每天 10 次。',
                  'No API key required. The current note text is sent to Cloudflare Workers AI only when you explicitly use an AI action. Guests get 3 free requests per day; signed-in users get 10.',
                )}
              </p>
              <span>{draft.model}</span>
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              {pick('API 地址', 'API endpoint')}
              <input
                required
                type="url"
                value={draft.baseUrl}
                readOnly={draft.provider !== 'custom'}
                placeholder="https://example.com/v1"
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              />
            </label>
            {draft.provider === 'custom' ? (
              <p className="field-help">
                {pick(
                  '兼容 Chat Completions 的 HTTPS 接口；域名必须由 Orion 服务端允许。',
                  'Use a Chat Completions-compatible HTTPS endpoint. Its host must be allowed by the Orion service.',
                )}
              </p>
            ) : null}
            <label className="field">
              {pick('模型名称', 'Model')}
              <input
                required
                value={draft.model}
                placeholder={pick('填写服务商支持的模型 ID', 'Enter a model ID supported by the provider')}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </label>
            <label className="field">
              API Key
              <input
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                placeholder={pick('输入你的 API Key', 'Enter your API key')}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value.trim() })}
              />
            </label>
            {draft.provider === 'openai' ? (
              <p className="field-help">
                {pick(
                  'ChatGPT Plus 不包含 API 额度。OpenAI API 需要在开发者平台单独创建 Key 并开通 API 计费。',
                  'ChatGPT Plus does not include API usage. Create a separate API key and enable API billing on the OpenAI developer platform.',
                )}{' '}
                <a
                  className="text-link"
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                >
                  {pick('创建 OpenAI API Key', 'Create OpenAI API key')} <ExternalLink size={13} />
                </a>
              </p>
            ) : null}
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>{pick(
                'API Key 只保存在当前页面内存中：不会写入 localStorage、云同步、备份或 Orion 应用日志，刷新页面后会消失。只有你主动使用 AI 时，Key 才通过 HTTPS 临时转发给你选择的服务商。',
                'Your API key is session-only: it is never written to localStorage, cloud sync, backups, or Orion application logs, and disappears on refresh. It is forwarded over HTTPS only when you explicitly use an AI action.',
              )}</p>
            </div>
          </>
        )}
        <p className="field-help">
          {pick(
            'AI 功能与私人云同步是两条独立路径：只有你主动运行 AI 功能时，当前笔记文字才会发送到你选择的 AI 服务商。',
            'AI actions and private cloud sync are separate paths. Note text is sent to your chosen AI provider only when you explicitly run an AI action.',
          )}
        </p>
        <div className="modal-actions">
          <a
            className="text-link"
            href="https://github.com/yaohuangguan/orion-note-learn"
            target="_blank"
            rel="noreferrer"
          >
            {pick('开源项目', 'Open-source project')} <ExternalLink size={14} />
          </a>
          <button className="button primary" type="submit">
            {pick('保存设置', 'Save settings')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
