import { useState, type FormEvent } from 'react'
import { Cloud, CloudOff, LogIn, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import type { CloudSession } from '../cloud'
import { CloudApiError } from '../cloud'
import { Modal } from './Modal'
import { useI18n } from '../i18n'

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
  const { locale, pick } = useI18n()
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
          : pick('操作失败，请稍后重试。', 'Something went wrong. Please try again.'),
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
      <Modal title={pick('账户与云同步', 'Account & cloud sync')} onClose={onClose}>
        <div className="account-hero">
          <span className="feature-icon">
            <Cloud size={24} />
          </span>
          <div>
            <h3>{pick('已连接云端', 'Connected to cloud')}</h3>
            <p>{session.user.email}</p>
          </div>
        </div>
        <div className="sync-card">
          <div>
            <strong>
              {syncState === 'syncing' || syncState === 'checking'
                ? pick('正在同步…', 'Syncing…')
                : syncState === 'error'
                  ? pick('等待重新同步', 'Waiting to retry')
                  : pick('本地与云端已连接', 'Local and cloud are connected')}
            </strong>
            <span>
              {lastSynced
                ? pick(`上次同步 ${new Date(lastSynced).toLocaleString(locale)}`, `Last synced ${new Date(lastSynced).toLocaleString(locale)}`)
                : pick('首次同步将在连接后自动完成', 'The first sync starts automatically after connecting')}
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
          <p>{pick(
            '笔记仍会先保存在本机；联网时同步文字、图片、手写内容、闪卡和复习进度。AI Key 不会上传。',
            'Notes are saved locally first. Text, images, drawings, flashcards, and review progress sync when online. Your AI key is never uploaded.',
          )}</p>
        </div>
        <div className="modal-actions account-actions">
          <button
            className="button secondary"
            disabled={busy || syncState === 'syncing'}
            onClick={() => void run(onSync)}
          >
            <RefreshCw size={16} className={syncState === 'syncing' ? 'spin' : ''} />
            {pick('立即同步', 'Sync now')}
          </button>
          <button className="button plain" disabled={busy} onClick={() => void run(onLogout)}>
            {pick('退出登录', 'Sign out')}
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title={pick('登录 Orion Note Learn', 'Sign in to Orion Note Learn')} onClose={onClose}>
      <div className="account-hero">
        <span className="feature-icon">{syncState === 'unavailable' ? <CloudOff size={24} /> : <Cloud size={24} />}</span>
        <div>
          <h3>{pick('换设备，笔记接着写', 'Keep writing on every device')}</h3>
          <p>{pick('本地优先保存，登录后自动同步到你的私有空间。', 'Save locally first, then sync automatically to your private space.')}</p>
        </div>
      </div>
      {syncState === 'unavailable' ? (
        <p className="error-box" role="alert">
          {pick(
            '当前部署尚未配置 VITE_SYNC_API_URL。部署 Worker 后在 Vercel 添加该环境变量即可启用。',
            'VITE_SYNC_API_URL is not configured for this deployment. Add it in Vercel after deploying the Worker.',
          )}
        </p>
      ) : (
        <>
          <div className="auth-tabs" role="tablist" aria-label={pick('账户操作', 'Account actions')}>
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
              {pick('登录', 'Sign in')}
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
              {pick('注册', 'Create account')}
            </button>
          </div>
          <form onSubmit={submit}>
            <label className="field">
              {pick('邮箱', 'Email')}
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
              {pick('密码', 'Password')}
              <input
                required
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={pick('至少 10 个字符', 'At least 10 characters')}
              />
            </label>
            {error ? (
              <p className="error-box" role="alert">
                {error}
              </p>
            ) : null}
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>{pick(
                '密码会在设备端经过高强度推导，D1 只保存加盐后的证明哈希；会话有效期 30 天。云同步不包含你的 AI Key。',
                'Your password is strengthened on-device, and D1 stores only a salted proof hash. Sessions last 30 days. Cloud sync never includes your AI key.',
              )}</p>
            </div>
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
                {busy
                  ? pick('请稍候…', 'Please wait…')
                  : mode === 'login'
                    ? pick('登录并同步', 'Sign in & sync')
                    : pick('创建账户', 'Create account')}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}
