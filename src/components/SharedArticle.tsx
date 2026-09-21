import { useEffect, useState, type FormEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Mathematics from '@tiptap/extension-mathematics'
import 'katex/dist/katex.min.css'
import { BookOpen, BookmarkPlus, LogIn, ShieldCheck } from 'lucide-react'
import { Modal } from './Modal'
import { useI18n } from '../i18n'
import { uid, type Note } from '../domain'
import { loadWorkspace, sanitizeHtml, saveWorkspace } from '../storage'
import {
  authenticateCloud,
  clearCloudSession,
  fetchPublicShare,
  loadCloudSession,
  verifyCloudSession,
  type CloudSession,
  type PublicShare,
} from '../cloud'

function ReadonlyArticleBody({ html }: { html: string }) {
  const { pick } = useI18n()
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: true, protocols: ['https', 'http', 'mailto'] },
      }),
      Highlight,
      Image.configure({ allowBase64: false, HTMLAttributes: { crossorigin: 'anonymous' } }),
      Mathematics.configure({ katexOptions: { throwOnError: false, strict: false } }),
    ],
    content: sanitizeHtml(html),
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose note-prose shared-note-prose',
        'aria-label': pick('分享文章正文', 'Shared article content'),
      },
    },
  })

  useEffect(() => {
    if (editor) editor.commands.setContent(sanitizeHtml(html), { emitUpdate: false })
  }, [editor, html])

  if (!editor) return <div className="shared-loading">{pick('正在打开文章…', 'Opening article…')}</div>
  return <EditorContent editor={editor} />
}

export default function SharedArticle({ shareId }: { shareId: string }) {
  const { locale, pick } = useI18n()
  const [share, setShare] = useState<PublicShare | null>(null)
  const [session, setSession] = useState<CloudSession | null>(loadCloudSession)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let live = true
    fetchPublicShare(shareId)
      .then((value) => {
        if (live) setShare(value)
      })
      .catch((reason) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : pick('这篇分享文章暂时无法打开。', 'This shared article could not be opened.'),
          )
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [shareId])

  useEffect(() => {
    if (!session) return
    void verifyCloudSession(session)
      .then(setSession)
      .catch(() => {
        clearCloudSession()
        setSession(null)
      })
  }, [])

  async function saveToNotes(activeSession: CloudSession) {
    if (!share) return
    setSaving(true)
    try {
      const verified = await verifyCloudSession(activeSession)
      setSession(verified)
      const workspace = await loadWorkspace()
      const now = Date.now()
      const folder = pick('收藏文章', 'Saved articles')
      const id = uid()
      const note: Note = {
        id,
        title: share.title,
        html: sanitizeHtml(share.html),
        folder,
        tags: share.tags,
        favorite: true,
        createdAt: now,
        updatedAt: now,
        strokes: [],
      }
      await saveWorkspace({
        ...workspace,
        notes: [note, ...workspace.notes],
        folders: [...new Set([...workspace.folders, folder])],
      })
      window.location.href = `/?note=${encodeURIComponent(id)}`
    } catch (reason) {
      clearCloudSession()
      setSession(null)
      setAuthError(
        reason instanceof Error
          ? reason.message
          : pick('收藏失败，请重新登录后再试。', 'Could not save this article. Sign in and try again.'),
      )
      setAuthOpen(true)
    } finally {
      setSaving(false)
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    setAuthBusy(true)
    setAuthError('')
    try {
      const next = await authenticateCloud(authMode, email, password)
      setSession(next)
      setAuthOpen(false)
      await saveToNotes(next)
    } catch (reason) {
      setAuthError(
        reason instanceof Error
          ? reason.message
          : pick('登录失败，请稍后重试。', 'Sign-in failed. Please try again.'),
      )
    } finally {
      setAuthBusy(false)
    }
  }

  if (loading)
    return (
      <div className="shared-page shared-state-page">
        <BookOpen size={34} />
        <p>{pick('正在打开分享文章…', 'Opening shared article…')}</p>
      </div>
    )

  if (error || !share)
    return (
      <div className="shared-page shared-state-page">
        <BookOpen size={34} />
        <h1>{pick('文章无法打开', 'Article unavailable')}</h1>
        <p>{error || pick('分享链接可能已失效。', 'This share link may no longer be active.')}</p>
        <a className="button primary" href="/">
          {pick('打开 Orion', 'Open Orion')}
        </a>
      </div>
    )

  return (
    <div className="shared-page">
      <header className="shared-topbar">
        <a className="shared-brand" href="/">
          <span className="brand-mark">
            <BookOpen size={21} strokeWidth={1.8} />
          </span>
          <span>
            orion
            <small>NOTE & LEARN</small>
          </span>
        </a>
        <a className="button secondary" href="/">
          {pick('打开我的笔记', 'Open my notes')}
        </a>
      </header>

      <main className="shared-article-shell">
        <article className="shared-article">
          <div className="shared-kicker">{pick('ORION · 分享文章', 'ORION · SHARED ARTICLE')}</div>
          <h1>{share.title || pick('无标题笔记', 'Untitled note')}</h1>
          <div className="shared-meta">
            <span>{pick('更新于', 'Updated')} {new Date(share.updatedAt).toLocaleDateString(locale)}</span>
            {share.tags.length ? (
              <span className="shared-tags">
                {share.tags.map((tag) => (
                  <span key={tag}># {tag}</span>
                ))}
              </span>
            ) : null}
          </div>
          <ReadonlyArticleBody html={share.html} />
        </article>

        <aside className="shared-save-card">
          <div className="shared-save-icon">
            <BookmarkPlus size={22} />
          </div>
          <div>
            <strong>
              {session
                ? pick('收藏到自己的 Orion', 'Save to your Orion')
                : pick('登录后收藏这篇文章', 'Sign in to save this article')}
            </strong>
            <p>
              {pick(
                '收藏后会成为你自己的笔记副本，可以继续编辑、加标签和制作闪卡。',
                'Saving creates your own copy so you can edit it, tag it, and turn it into flashcards.',
              )}
            </p>
          </div>
          {session ? (
            <button className="button primary" disabled={saving} onClick={() => void saveToNotes(session)}>
              <BookmarkPlus size={16} />
              {saving ? pick('正在收藏…', 'Saving…') : pick('收藏到我的笔记', 'Save to my notes')}
            </button>
          ) : (
            <button className="button primary" onClick={() => setAuthOpen(true)}>
              <LogIn size={16} />
              {pick('登录后收藏', 'Sign in to save')}
            </button>
          )}
        </aside>
      </main>

      {authOpen ? (
        <Modal title={pick('登录 Orion 后收藏', 'Sign in to Orion to save')} onClose={() => setAuthOpen(false)}>
          <div className="auth-tabs" role="tablist" aria-label={pick('账户操作', 'Account actions')}>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'login'}
              className={authMode === 'login' ? 'selected' : ''}
              onClick={() => {
                setAuthMode('login')
                setAuthError('')
              }}
            >
              {pick('登录', 'Sign in')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'register'}
              className={authMode === 'register' ? 'selected' : ''}
              onClick={() => {
                setAuthMode('register')
                setAuthError('')
              }}
            >
              {pick('注册', 'Create account')}
            </button>
          </div>
          <form onSubmit={submitAuth}>
            <label className="field">
              {pick('邮箱', 'Email')}
              <input required name="email" type="email" autoComplete="email" maxLength={254} />
            </label>
            <label className="field">
              {pick('密码', 'Password')}
              <input
                required
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                placeholder={pick('至少 10 个字符', 'At least 10 characters')}
              />
            </label>
            {authError ? (
              <p className="error-box" role="alert">
                {authError}
              </p>
            ) : null}
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>
                {pick(
                  '登录只用于把文章收藏到你的私人学习空间；公开文章本身无需登录即可阅读。',
                  'Sign-in is only needed to save the article to your private workspace. Reading the shared article does not require an account.',
                )}
              </p>
            </div>
            <div className="modal-actions">
              <button className="button primary" disabled={authBusy}>
                {authBusy
                  ? pick('请稍候…', 'Please wait…')
                  : authMode === 'register'
                    ? pick('创建账户并收藏', 'Create account & save')
                    : pick('登录并收藏', 'Sign in & save')}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
