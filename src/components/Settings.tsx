import { useState } from 'react'
import { KeyRound, ShieldCheck, ExternalLink } from 'lucide-react'
import { providers, type AISettings } from '../domain'
import { Modal } from './Modal'

export default function Settings({
  settings,
  onSave,
  onClose,
}: {
  settings: AISettings
  onSave: (s: AISettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)
  return (
    <Modal title="AI 与偏好设置" onClose={onClose}>
      <div className="settings-intro">
        <div className="feature-icon">
          <KeyRound size={23} />
        </div>
        <div>
          <h3>你自己的 AI，你自己的密钥</h3>
          <p>选择服务商，让 AI 帮你理解当前笔记。</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft)
          onClose()
        }}
      >
        <label className="field">
          AI 服务商
          <select
            value={draft.provider}
            onChange={(e) => {
              const p = providers.find((p) => p.id === e.target.value)!
              setDraft({ provider: p.id, baseUrl: p.baseUrl, model: p.model, apiKey: '' })
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          API 地址
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
            兼容 Chat Completions 的 HTTPS 接口；服务器管理员需要在 AI_ALLOWED_HOSTS 中允许该域名。
          </p>
        ) : null}
        <label className="field">
          模型名称
          <input
            required
            value={draft.model}
            placeholder="填写服务商支持的模型 ID"
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </label>
        <label className="field">
          API Key
          <input
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            placeholder="输入你的 API Key"
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value.trim() })}
          />
        </label>
        <div className="privacy-note">
          <ShieldCheck size={20} />
          <p>
            密钥仅保留在当前页面内存，刷新后需重新输入。仅当你点击 AI
            功能时，当前笔记的文字才会经本服务转发到所选服务商；手写画板不会发送。密钥不进入备份文件。
          </p>
        </div>
        <p className="field-help">
          笔记保存在当前浏览器。清理浏览器数据会删除笔记，请定期导出备份。不同设备可通过备份文件迁移，当前版本不提供云同步。
        </p>
        <div className="modal-actions">
          <a
            className="text-link"
            href="https://github.com/yaohuangguan/orion-note-learn"
            target="_blank"
            rel="noreferrer"
          >
            开源项目 <ExternalLink size={14} />
          </a>
          <button className="button primary" type="submit">
            保存设置
          </button>
        </div>
      </form>
    </Modal>
  )
}
