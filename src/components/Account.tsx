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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const submittedEmail = String(form.get('email') ?? '')
    const submittedPassword = String(form.get('password') ?? '')
    void run(() => onAuthenticate(mode, submittedEmail, submittedPassword))
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
            '标题、正文、标签、手写内容、闪卡、复习进度和私人图片附件都会在浏览器端加密后再上传。D1 与 R2 只保存密文，服务端不会收到私人笔记的解密密钥。只有你主动公开分享的文章会生成可阅读副本；AI Key 不会上传。',
            'Titles, note text, tags, drawings, flashcards, review progress, and private image attachments are encrypted in your browser before upload. D1 and R2 store ciphertext only, and the service never receives the decryption key for private notes. Only articles you explicitly publish create readable copies. Your AI key is never uploaded.',
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
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              {pick('密码', 'Password')}
              <input
                required
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
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
                '密码只在设备端用于推导登录证明和私人空间密钥，密码本身不会上传。私人笔记与图片附件在离开浏览器前使用 AES-256-GCM 加密；服务端存储的是密文。主动创建的公开分享文章除外。',
                'Your password is used on-device to derive the sign-in proof and private vault key; the password itself is never uploaded. Private notes and image attachments are encrypted with AES-256-GCM before leaving your browser, so the service stores ciphertext. Articles you explicitly publish are the exception.',
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
