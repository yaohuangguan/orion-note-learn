import { useState } from 'react'
import { KeyRound, ShieldCheck, ExternalLink } from 'lucide-react'
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
                {p.id === 'custom' ? pick('自定义兼容接口', 'Custom compatible API') : p.name}
              </option>
            ))}
          </select>
        </label>
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
              '兼容 Chat Completions 的 HTTPS 接口；服务器管理员需要在 AI_ALLOWED_HOSTS 中允许该域名。',
              'Use a Chat Completions-compatible HTTPS endpoint. Its host must be allowed in AI_ALLOWED_HOSTS.',
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
        <div className="privacy-note">
          <ShieldCheck size={20} />
          <p>{pick(
            '密钥仅保留在当前页面内存，刷新后需重新输入。仅当你点击 AI 功能时，当前笔记的文字才会经本服务转发到所选服务商；手写画板不会发送。密钥不进入备份文件。',
            'Your key stays in memory for this page and must be entered again after a refresh. Note text is sent through this service only when you use an AI action. Drawings and API keys are never included in backups.',
          )}</p>
        </div>
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
