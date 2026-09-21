import { useState, type FormEvent } from 'react'
import { Cloud, CloudOff, LogIn, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import type { CloudSession } from '../cloud'
import { CloudApiError } from '../cloud'
import { Modal } from './Modal'

type SyncState = 'idle' | 'checking' | 'syncing' | 'synced' | 'error' | 'unavailable'

export default function Account({
  session,
  syncState,
  lastSynced,
  onAuthenticate,
  onSync,
  onLogout,
  onClose,
}: {
  session: CloudSession | null
  syncState: SyncState
  lastSynced: number | null
  onAuthenticate: (mode: 'login' | 'register', email: string, password: string) => Promise<void>
  onSync: () => Promise<void>
  onLogout: () => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(
        reason instanceof CloudApiError || reason instanceof Error
          ? reason.message
          : '操作失败，请稍后重试。',
      )
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => onAuthenticate(mode, email, password))
  }

  if (session)
    return (
      <Modal title="账户与云同步" onClose={onClose}>
        <div className="account-hero">
          <span className="feature-icon">
            <Cloud size={24} />
          </span>
          <div>
            <h3>已连接云端</h3>
            <p>{session.user.email}</p>
          </div>
        </div>
        <div className="sync-card">
          <div>
            <strong>
              {syncState === 'syncing' || syncState === 'checking'
                ? '正在同步…'
                : syncState === 'error'
                  ? '等待重新同步'
                  : '本地与云端已连接'}
            </strong>
            <span>
              {lastSynced
                ? `上次同步 ${new Date(lastSynced).toLocaleString('zh-CN')}`
                : '首次同步将在连接后自动完成'}
            </span>
          </div>
          <span className={`connection-dot ${syncState === 'synced' ? 'connected' : ''}`} />
        </div>
        {error ? (
          <p className="error-box" role="alert">
            {error}
          </p>
        ) : null}
        <div className="privacy-note">
          <ShieldCheck size={20} />
          <p>笔记仍会先保存在本机；联网时同步文字、图片、手写内容、闪卡和复习进度。AI Key 不会上传。</p>
        </div>
        <div className="modal-actions account-actions">
          <button
            className="button secondary"
            disabled={busy || syncState === 'syncing'}
            onClick={() => void run(onSync)}
          >
            <RefreshCw size={16} className={syncState === 'syncing' ? 'spin' : ''} />
            立即同步
          </button>
          <button className="button plain" disabled={busy} onClick={() => void run(onLogout)}>
            退出登录
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title="登录 Orion Note Learn" onClose={onClose}>
      <div className="account-hero">
        <span className="feature-icon">{syncState === 'unavailable' ? <CloudOff size={24} /> : <Cloud size={24} />}</span>
        <div>
          <h3>换设备，笔记接着写</h3>
          <p>本地优先保存，登录后自动同步到你的私有空间。</p>
        </div>
      </div>
      {syncState === 'unavailable' ? (
        <p className="error-box" role="alert">
          当前部署尚未配置 VITE_SYNC_API_URL。部署 Worker 后在 Vercel 添加该环境变量即可启用。
        </p>
      ) : (
        <>
          <div className="auth-tabs" role="tablist" aria-label="账户操作">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => {
                setMode('login')
                setError('')
              }}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => {
                setMode('register')
                setError('')
              }}
            >
              注册
            </button>
          </div>
          <form onSubmit={submit}>
            <label className="field">
              邮箱
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              密码
              <input
                required
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 10 个字符"
              />
            </label>
            {error ? (
              <p className="error-box" role="alert">
                {error}
              </p>
            ) : null}
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>密码经过 PBKDF2 加盐哈希后存入 D1；会话有效期 30 天。云同步不包含你的 AI Key。</p>
            </div>
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
                {busy ? '请稍候…' : mode === 'login' ? '登录并同步' : '创建账户'}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}
