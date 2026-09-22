import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  BookOpen,
  Search,
  Plus,
  LayoutGrid,
  Layers,
  Star,
  Folder,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  FileText,
  MoreHorizontal,
  Download,
  Upload,
  Trash2,
  Check,
  Sparkles,
  PanelLeftClose,
  Menu,
  PenTool,
  Type,
  X,
  RotateCcw,
  Cloud,
  CloudOff,
  LoaderCircle,
  Leaf,
  Share2,
  Copy,
} from 'lucide-react'
import { marked } from 'marked'
import {
  newNote,
  uid,
  providers,
  workspaceSchema,
  type Note,
  type Card,
  type Workspace,
  type AISettings,
} from './domain'
import {
  download,
  htmlText,
  loadWorkspace,
  sanitizeHtml,
  sanitizeWorkspace,
  saveWorkspace,
} from './storage'
import NoteEditor from './components/Editor'
import { Modal } from './components/Modal'
import Settings from './components/Settings'
import Account from './components/Account'
import Review from './components/Review'
import { exportMarkdown, exportPlainText, exportPDF } from './export'
import {
  authenticateCloud,
  clearCloudSession,
  cloudApiUrl,
  endCloudSession,
  fetchCloudWorkspace,
  loadCloudSession,
  mergeWorkspaces,
  migrateWorkspaceImages,
  saveCloudWorkspace,
  uploadCloudImage,
  verifyCloudSession,
  publishPublicShare,
  revokePublicShare,
  type CloudSession,
  CloudApiError,
} from './cloud'
import { useI18n } from './i18n'

const Drawing = lazy(() => import('./components/Drawing'))
const AIPanel = lazy(() => import('./components/AIPanel'))
type View = 'editor' | 'library' | 'review' | 'trash'
type Dialog = 'settings' | 'account' | 'folder' | 'card' | 'import' | 'properties' | 'share' | null
type CloudState = 'idle' | 'checking' | 'syncing' | 'synced' | 'error' | 'unavailable'
function initialSettings(): AISettings {
  const p = providers[0]
  try {
    const stored = JSON.parse(localStorage.getItem('orion-ai-preferences') || 'null')
    if (
      stored &&
      typeof stored.baseUrl === 'string' &&
      typeof stored.model === 'string' &&
      providers.some((p) => p.id === stored.provider)
    )
      return { provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, apiKey: '' }
  } catch {
    /* Browser preferences are optional. */
  }
  return { provider: p.id, baseUrl: p.baseUrl, model: p.model, apiKey: '' }
}
function date(value: number, locale: 'zh-CN' | 'en-US') {
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export default function App() {
  const { locale, pick } = useI18n()
  const [data, setData] = useState<Workspace | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving')
  const revision = useRef(0)
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(loadCloudSession)
  const [cloudState, setCloudState] = useState<CloudState>(
    cloudApiUrl() ? 'idle' : 'unavailable',
  )
  const [cloudLastSynced, setCloudLastSynced] = useState<number | null>(null)
  const cloudRevision = useRef<number | null>(null)
  const cloudReadyFor = useRef('')
  const cloudConnectingFor = useRef('')
  const cloudUploadInFlight = useRef(false)
  const cloudPendingWorkspace = useRef<Workspace | null>(null)
  const cloudLastPushed = useRef<Workspace | null>(null)
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(window.location.search).get('note') || 'welcome',
  )
  const [view, setView] = useState<View>('editor')
  const [folder, setFolder] = useState('')
  const [favorites, setFavorites] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(() => window.innerWidth >= 1180)
  const [tab, setTab] = useState<'text' | 'drawing'>('text')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [settings, setSettings] = useState(initialSettings)
  const [toast, setToast] = useState('')
  const [folderDraft, setFolderDraft] = useState('')
  const [cardDraft, setCardDraft] = useState({ question: '', answer: '', noteId: '' })
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [folderChoice, setFolderChoice] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareId, setShareId] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [shareError, setShareError] = useState('')
  const active = data?.notes.filter((n) => !n.deletedAt) || []
  const note = active.find((n) => n.id === selectedId) || active[0]
  const dueCount =
    data?.cards.filter((c) => c.due <= Date.now() && active.some((n) => n.id === c.noteId))
      .length || 0
  const words = note ? htmlText(note.html).replace(/\s/g, '').length : 0
  const visibleNotes = (data?.notes || [])
    .filter((n) => (view === 'trash' ? !!n.deletedAt : !n.deletedAt))
    .filter(
      (n) =>
        (!folder || n.folder === folder) &&
        (!favorites || n.favorite) &&
        (!search ||
          `${n.title} ${n.tags.join(' ')} ${htmlText(n.html)}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const allFolders = [...new Set([...(data?.folders || []), ...active.map((n) => n.folder)])]
  const notify = useCallback((message: string) => setToast(message), [])

  async function syncCloudSnapshot(workspace: Workspace, session: CloudSession) {
    if (cloudUploadInFlight.current) {
      cloudPendingWorkspace.current = workspace
      return
    }
    cloudUploadInFlight.current = true
    cloudPendingWorkspace.current = null
    setCloudState('syncing')
    try {
      const prepared = await migrateWorkspaceImages(workspace, session)
      const snapshot = prepared.workspace
      const result = await saveCloudWorkspace(session, snapshot, cloudRevision.current)
      cloudRevision.current = result.revision
      cloudLastPushed.current = snapshot
      if (prepared.changed) setData(snapshot)
      setCloudLastSynced(result.updatedAt)
      setCloudState('synced')
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409) {
        const remote = await fetchCloudWorkspace(session)
        if (remote.workspace) {
          cloudRevision.current = remote.revision
          const merged = sanitizeWorkspace(mergeWorkspaces(workspace, remote.workspace))
          setData(merged)
          setCloudState('syncing')
          notify(pick('检测到另一台设备的修改，已安全合并并继续同步', 'Changes from another device were merged safely. Syncing the latest version.'))
          return
        }
      }
      if (error instanceof CloudApiError && error.status === 401) {
        clearCloudSession()
        cloudReadyFor.current = ''
        setCloudSession(null)
        setCloudState('idle')
        notify(pick('云端登录已过期，请重新登录', 'Your cloud session expired. Sign in again.'))
        return
      }
      setCloudState('error')
      notify(error instanceof Error ? error.message : pick('云同步失败，本地笔记仍已保存', 'Cloud sync failed. Your notes are still saved locally.'))
      throw error
    } finally {
      cloudUploadInFlight.current = false
      const pending = cloudPendingWorkspace.current
      cloudPendingWorkspace.current = null
      if (pending && pending !== workspace)
        void syncCloudSnapshot(pending, session).catch(() => {})
    }
  }

  async function connectCloud(session: CloudSession, workspace: Workspace) {
    if (
      cloudReadyFor.current === session.token ||
      cloudConnectingFor.current === session.token
    )
      return
    cloudConnectingFor.current = session.token
    setCloudState('checking')
    try {
      const verified = await verifyCloudSession(session)
      setCloudSession(verified)
      const remote = await fetchCloudWorkspace(verified)
      cloudRevision.current = remote.revision
      cloudReadyFor.current = verified.token
      if (!remote.workspace) {
        await syncCloudSnapshot(workspace, verified)
        notify(pick('云同步已开启，这台设备的笔记已上传', 'Cloud sync is on. Notes from this device were uploaded.'))
        return
      }
      const merged = sanitizeWorkspace(mergeWorkspaces(workspace, remote.workspace))
      cloudLastPushed.current = remote.workspace
      setCloudLastSynced(remote.updatedAt)
      setCloudState('synced')
      if (JSON.stringify(merged) !== JSON.stringify(workspace)) setData(merged)
      if (!remote.encrypted) {
        await syncCloudSnapshot(merged, verified)
        notify(pick(
          '旧版云端笔记已升级为端到端加密存储',
          'Your legacy cloud notes were upgraded to end-to-end encrypted storage.',
        ))
        return
      }
      if (JSON.stringify(merged) !== JSON.stringify(remote.workspace))
        notify(pick('本机与云端笔记已合并，正在上传最新版本', 'Local and cloud notes were merged. Uploading the latest version.'))
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 401) {
        clearCloudSession()
        setCloudSession(null)
        setCloudState('idle')
      } else {
        setCloudState('error')
      }
    } finally {
      cloudConnectingFor.current = ''
    }
  }

  useEffect(() => {
    let live = true
    loadWorkspace()
      .then((d) => {
        if (live) setData(d)
      })
      .catch(() => {
        if (live)
          setLoadError(pick(
            '无法读取本地笔记。请确认浏览器允许使用存储，然后重新加载。原数据未被覆盖。',
            'Local notes could not be read. Allow browser storage and reload. Your existing data was not overwritten.',
          ))
      })
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (!data) return
    const current = ++revision.current
    setSaveState('saving')
    saveWorkspace(data)
      .then(() => {
        if (revision.current === current) setSaveState('saved')
      })
      .catch(() => {
        if (revision.current === current) setSaveState('error')
      })
  }, [data])
  useEffect(() => {
    if (!data || !cloudSession || !cloudApiUrl()) return
    void connectCloud(cloudSession, data)
  }, [data, cloudSession?.token])
  useEffect(() => {
    if (!data || !cloudSession || cloudReadyFor.current !== cloudSession.token) return
    if (data === cloudLastPushed.current) return
    const timer = window.setTimeout(() => {
      void syncCloudSnapshot(data, cloudSession).catch(() => {})
    }, 900)
    return () => window.clearTimeout(timer)
  }, [data, cloudSession?.token])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(id)
  }, [toast])
  useEffect(() => {
    function guard(e: BeforeUnloadEvent) {
      if (saveState !== 'saved' && data) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [saveState, data])
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSidebarOpen(true)
        setTimeout(() => searchRef.current?.focus(), 0)
      }
      if (e.key === 'Escape') {
        setSidebarOpen(false)
        if (window.innerWidth < 1180) setAiOpen(false)
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [])
  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) =>
      setData((d) =>
        d
          ? {
              ...d,
              notes: d.notes.map((n) =>
                n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
              ),
            }
          : d,
      ),
    [],
  )
  function openNote(n: Note) {
    setSelectedId(n.id)
    setView('editor')
    setTab('text')
    setSidebarOpen(false)
  }
  function createNote() {
    const n = newNote(folder || pick('我的笔记', 'My Notes'))
    n.title = pick('无标题笔记', 'Untitled note')
    setData((d) => (d ? { ...d, notes: [n, ...d.notes] } : d))
    setSelectedId(n.id)
    setView('editor')
    setTab('text')
    setSearch('')
    setSidebarOpen(false)
    notify(pick('新笔记已创建，开始写下你的想法吧', 'New note created. Start writing your ideas.'))
  }
  function navigate(next: View, nextFolder = '', nextFavorites = false) {
    setView(next)
    setFolder(nextFolder)
    setFavorites(nextFavorites)
    setSearch('')
    setSidebarOpen(false)
  }
  function backup() {
    if (data) {
      download(
        JSON.stringify(data, null, 2),
        `orion-backup-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      )
      notify(pick('备份已导出，包含笔记、手写内容和复习进度', 'Backup exported with notes, drawings, and review progress.'))
    }
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImporting(true)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(pick('文件超过 50 MB，请分批导入。', 'The file is over 50 MB. Import it in smaller parts.'))
      const raw = await file.text()
      if (file.name.toLowerCase().endsWith('.json')) {
        const imported = sanitizeWorkspace(workspaceSchema.parse(JSON.parse(raw)))
        const ids = new Map(imported.notes.map((n) => [n.id, uid()]))
        const notes = imported.notes.map((n) => ({ ...n, id: ids.get(n.id)! }))
        const cards = imported.cards.map((c) => ({ ...c, id: uid(), noteId: ids.get(c.noteId)! }))
        setData((d) =>
          d
            ? {
                ...d,
                notes: [...notes, ...d.notes],
                cards: [...d.cards, ...cards],
                folders: [...new Set([...d.folders, ...imported.folders])],
                reviewLog: [...d.reviewLog, ...imported.reviewLog].slice(-100000),
              }
            : d,
        )
        notify(pick(`已导入 ${notes.length} 篇笔记，原有笔记已保留`, `Imported ${notes.length} notes. Existing notes were kept.`))
      } else {
        if (raw.length > 500000) throw new Error(pick('单篇文本过长，请拆分后导入。', 'This document is too long. Split it before importing.'))
        const n = newNote(folder || pick('我的笔记', 'My Notes'))
        n.title = pick('无标题笔记', 'Untitled note')
        n.title = file.name.replace(/\.(md|markdown|txt)$/i, '').slice(0, 500)
        if (file.name.toLowerCase().endsWith('.txt')) {
          const div = document.createElement('div')
          div.textContent = raw
          n.html = `<p>${div.innerHTML.replace(/\n/g, '<br>')}</p>`
        } else n.html = sanitizeHtml(await marked(raw))
        setData((d) => (d ? { ...d, notes: [n, ...d.notes] } : d))
        openNote(n)
        notify(pick('笔记已导入', 'Note imported.'))
      }
      setDialog(null)
    } catch (error) {
      setImportError(
        error instanceof SyntaxError
          ? pick('文件不是有效的 JSON 备份。', 'This is not a valid JSON backup.')
          : error instanceof Error && error.name !== 'ZodError'
            ? error.message
            : pick('备份格式不符合 Orion 规范，未导入任何数据。', 'The backup does not match the Orion format. Nothing was imported.'),
      )
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }
  async function pdf() {
    if (!note) return
    setExporting(true)
    try {
      await exportPDF(note)
      notify(pick('PDF 已生成', 'PDF created.'))
    } catch {
      notify(pick('PDF 生成失败，请重试，或使用浏览器打印保存为 PDF', 'PDF creation failed. Try again or use the browser print dialog to save a PDF.'))
    } finally {
      setExporting(false)
    }
  }
  function addCards(cards: Card[]) {
    setData((d) => (d ? { ...d, cards: [...d.cards, ...cards] } : d))
    notify(pick(`已加入 ${cards.length} 张复习闪卡`, `Added ${cards.length} flashcards to review.`))
  }
  async function appendAI(text: string, id: string) {
    const html = sanitizeHtml(await marked(text))
    setData((d) =>
      d
        ? {
            ...d,
            notes: d.notes.map((n) =>
              n.id === id
                ? { ...n, html: `${n.html}<h2>${pick('AI 学习整理', 'AI study notes')}</h2>${html}`, updatedAt: Date.now() }
                : n,
            ),
          }
        : d,
    )
    notify(pick('AI 结果已追加到笔记末尾', 'AI result added to the end of the note.'))
  }
  async function authenticateAccount(
    mode: 'login' | 'register',
    email: string,
    password: string,
  ) {
    const session = await authenticateCloud(mode, email, password)
    cloudReadyFor.current = ''
    cloudLastPushed.current = null
    setCloudSession(session)
    await connectCloud(session, data!)
    notify(mode === 'register'
      ? pick('账户已创建，笔记正在上传云端', 'Account created. Your notes are uploading.')
      : pick('登录成功，笔记已连接云端', 'Signed in. Your notes are connected to the cloud.'))
  }
  async function shareCurrentNote() {
    if (!note || !data) return
    if (!cloudSession) {
      notify(pick('登录后才能创建公开分享链接', 'Sign in before creating a public share link.'))
      setDialog('account')
      return
    }
    setSharing(true)
    setShareError('')
    try {
      let publicNote = note
      if (/data:image\//i.test(note.html)) {
        const prepared = await migrateWorkspaceImages(
          {
            version: 1,
            notes: [note],
            cards: [],
            folders: [note.folder],
            reviewLog: [],
          },
          cloudSession,
        )
        publicNote = prepared.workspace.notes[0]
        if (prepared.changed) updateNote(note.id, { html: publicNote.html })
      }
      const result = await publishPublicShare(cloudSession, publicNote)
      const url = `${window.location.origin}/share/${result.id}`
      setShareId(result.id)
      setShareUrl(url)
      setDialog('share')
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : pick('创建分享链接失败，请稍后重试。', 'Could not create the share link. Try again.')
      setShareError(message)
      setDialog('share')
    } finally {
      setSharing(false)
    }
  }

  async function stopSharing() {
    if (!cloudSession || !shareId) return
    setSharing(true)
    setShareError('')
    try {
      await revokePublicShare(cloudSession, shareId)
      setShareId('')
      setShareUrl('')
      setDialog(null)
      notify(pick('已停止分享，这个公开链接不再可访问', 'Sharing stopped. The public link is no longer available.'))
    } catch (reason) {
      setShareError(
        reason instanceof Error
          ? reason.message
          : pick('停止分享失败，请稍后重试。', 'Could not stop sharing. Try again.'),
      )
    } finally {
      setSharing(false)
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify(pick('分享链接已复制', 'Share link copied.'))
    } catch {
      notify(pick('请手动复制分享链接', 'Copy the share link manually.'))
    }
  }

  async function syncNow() {
    if (!cloudSession || !data) return
    if (cloudReadyFor.current !== cloudSession.token) {
      await connectCloud(cloudSession, data)
      return
    }
    await syncCloudSnapshot(data, cloudSession)
    notify(pick('云端同步已完成', 'Cloud sync complete.'))
  }
  async function logoutAccount() {
    if (!cloudSession) return
    try {
      await endCloudSession(cloudSession)
    } catch {
      /* Local logout still completes if the network is unavailable. */
    }
    cloudReadyFor.current = ''
    cloudRevision.current = null
    cloudLastPushed.current = null
    setCloudSession(null)
    setCloudState(cloudApiUrl() ? 'idle' : 'unavailable')
    notify(pick('已退出云端账户，本机笔记仍然保留', 'Signed out. Notes remain on this device.'))
  }
  if (loadError)
    return (
      <div className="app-loading">
        <BookOpen size={36} />
        <h1>{pick('暂时无法打开笔记', 'Notes could not be opened')}</h1>
        <p role="alert">{loadError}</p>
        <button className="button primary" onClick={() => location.reload()}>
          {pick('重新加载', 'Reload')}
        </button>
      </div>
    )
  if (!data)
    return (
      <div className="app-loading">
        <BookOpen size={36} />
        <h1>Orion</h1>
        <p>{pick('正在打开你的学习空间…', 'Opening your learning space…')}</p>
      </div>
    )
  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <button
          className="sidebar-scrim"
          aria-label={pick('收起侧栏', 'Close sidebar')}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label={pick('主导航', 'Main navigation')}>
        <div
          className="brand"
          role="presentation"
          onClick={(e) => {
            e.preventDefault()
            navigate('library')
          }}
        >
          <span className="brand-mark">
            <BookOpen size={23} strokeWidth={1.8} />
          </span>
          <span>
            orion<span className="brand-sub">NOTE & LEARN</span>
          </span>
          <button
            type="button"
            className="icon-button mobile-close"
            aria-label={pick('关闭侧栏', 'Close sidebar')}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setSidebarOpen(false)
            }}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <button
          type="button"
          className="workspace-label"
          aria-label={pick('账户与云同步', 'Account & cloud sync')}
          onClick={() => setDialog('account')}
        >
          <span className="workspace-avatar">O</span>
          <span>
            {pick('我的学习空间', 'My learning space')}
            <small>
              {cloudSession
                ? cloudState === 'checking' || cloudState === 'syncing'
                  ? pick('正在同步…', 'Syncing…')
                  : cloudState === 'error'
                    ? pick('本地已保存 · 等待同步', 'Saved locally · Waiting to sync')
                    : cloudSession.user.email
                : pick('登录后跨设备同步', 'Sign in to sync across devices')}
            </small>
          </span>
          {cloudSession && cloudState !== 'error' ? <Cloud size={15} /> : <CloudOff size={15} />}
        </button>
        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            aria-label={pick('搜索笔记', 'Search notes')}
            placeholder={pick('搜索笔记…', 'Search notes…')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (view !== 'trash') setView('library')
            }}
          />
          <kbd>⌘ K</kbd>
        </label>
        <button className="button primary new-note" onClick={createNote}>
          <Plus size={18} />
          {pick('新建笔记', 'New note')}<span>＋</span>
        </button>
        <nav className="main-nav">
          <button
            className={view === 'library' && !folder && !favorites ? 'selected' : ''}
            onClick={() => navigate('library')}
          >
            <LayoutGrid size={18} />
            {pick('全部笔记', 'All notes')}<span>{active.length}</span>
          </button>
          <button
            className={view === 'review' ? 'selected' : ''}
            onClick={() => navigate('review')}
          >
            <Layers size={18} />
            {pick('学习与复习', 'Learn & review')}{dueCount ? <span className="count-pill">{dueCount}</span> : null}
          </button>
          <button
            className={favorites ? 'selected' : ''}
            onClick={() => navigate('library', '', true)}
          >
            <Star size={18} />
            {pick('收藏笔记', 'Favorites')}
          </button>
        </nav>
        <div className="sidebar-section-label">
          {pick('笔记本', 'Notebooks')}
          <button
            className="icon-button"
            aria-label={pick('新建笔记本', 'New notebook')}
            onClick={() => {
              setFolderDraft('')
              setDialog('folder')
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="notebook-nav">
          {allFolders.map((f) => (
            <button
              key={f}
              className={folder === f ? 'selected' : ''}
              onClick={() => navigate('library', f)}
            >
              <Folder size={17} />
              <span>{f}</span>
              <small>{active.filter((n) => n.folder === f).length}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label recent-label">{pick('最近编辑', 'Recently edited')}</div>
        <nav className="recent-nav">
          {[...active]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5)
            .map((n) => (
              <button
                key={n.id}
                className={view === 'editor' && note?.id === n.id ? 'selected' : ''}
                onClick={() => openNote(n)}
              >
                <FileText size={15} />
                <span>{n.title || pick('无标题笔记', 'Untitled note')}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <Leaf size={18} />
            <strong>{pick('给知识一点生长的时间', 'Give knowledge time to grow')}</strong>
            <span>{pick('写下来，再想一遍。', 'Write it down. Think it through.')}</span>
          </div>
          <button
            className="sidebar-utility"
            onClick={() => {
              setImportError('')
              setDialog('import')
            }}
          >
            <Upload size={17} />
            {pick('导入与备份', 'Import & backup')}
          </button>
          <button className="sidebar-utility" onClick={() => navigate('trash')}>
            <Trash2 size={17} />
            {pick('回收站', 'Trash')}
          </button>
          <button className="sidebar-utility" onClick={() => setDialog('settings')}>
            <SettingsIcon size={17} />
            {pick('设置', 'Settings')}
            <span className={`connection-dot ${settings.apiKey ? 'connected' : ''}`} />
          </button>
          <div className="local-footer">
            <span className={cloudSession && cloudState === 'synced' ? 'connected' : ''} />
            {cloudSession
              ? pick('本地优先 · 端到端加密同步', 'Local-first · End-to-end encrypted sync')
              : pick('数据保存在此设备', 'Data saved on this device')}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button sidebar-toggle"
              aria-label={pick('打开侧栏', 'Open sidebar')}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>{pick('我的空间', 'My space')}</span>
            <ChevronRight size={14} />
            <span>
              {view === 'editor'
                ? note?.folder || pick('笔记', 'Note')
                : view === 'review'
                  ? pick('学习与复习', 'Learn & review')
                  : view === 'trash'
                    ? pick('回收站', 'Trash')
                    : favorites
                      ? pick('收藏笔记', 'Favorites')
                      : folder || pick('全部笔记', 'All notes')}
            </span>
          </div>
          <div className="topbar-actions">
            <span className={`save-status ${saveState}`} role="status">
              {saveState === 'saved' ? (
                <Check size={14} />
              ) : saveState === 'saving' ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <CloudOff size={14} />
              )}
              {saveState === 'saved'
                ? pick('已保存', 'Saved')
                : saveState === 'saving'
                  ? pick('保存中…', 'Saving…')
                  : pick('保存失败', 'Save failed')}
            </span>
            {view === 'editor' && note ? (
              <>
                <button
                  className={`icon-button favorite-button ${note.favorite ? 'is-favorite' : ''}`}
                  title={pick('收藏', 'Favorite')}
                  aria-label={note.favorite ? pick('取消收藏', 'Remove from favorites') : pick('收藏笔记', 'Favorite note')}
                  onClick={() => updateNote(note.id, { favorite: !note.favorite })}
                >
                  <Star size={18} fill={note.favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-button"
                  title={pick('分享文章', 'Share article')}
                  aria-label={pick('分享文章', 'Share article')}
                  disabled={sharing}
                  onClick={() => void shareCurrentNote()}
                >
                  <Share2 size={18} />
                </button>
                <details className="export-menu">
                  <summary className="button plain">
                    <Download size={16} />
                    <span>{pick('导出', 'Export')}</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div className="dropdown-menu">
                    <button
                      disabled={exporting}
                      onClick={() => {
                        void pdf()
                      }}
                    >
                      {exporting ? pick('正在生成 PDF…', 'Creating PDF…') : pick('下载 PDF（含手写）', 'Download PDF with drawings')}
                    </button>
                    <button onClick={() => exportMarkdown(note)}>{pick('Markdown 文件', 'Markdown file')}</button>
                    <button onClick={() => exportPlainText(note)}>{pick('纯文本文件', 'Plain text file')}</button>
                    <button onClick={() => window.print()}>{pick('打印 / 保存为 PDF', 'Print / Save as PDF')}</button>
                    <button onClick={backup}>{pick('完整数据备份', 'Full data backup')}</button>
                  </div>
                </details>
                <button
                  aria-label={pick('学习伙伴', 'Study partner')}
                  className={`button ai-toggle ${aiOpen ? 'on' : ''}`}
                  aria-pressed={aiOpen}
                  onClick={() => setAiOpen(!aiOpen)}
                >
                  <Sparkles size={16} />
                  <span>{pick('学习伙伴', 'Study partner')}</span>
                </button>
              </>
            ) : null}
          </div>
        </header>
        {saveState === 'error' ? (
          <div className="save-error" role="alert">
            {pick(
              '本地保存失败，可能是存储空间不足。请立即导出备份，避免丢失修改。',
              'Local save failed, possibly because storage is full. Export a backup now to protect your changes.',
            )}
            <button onClick={backup}>{pick('导出备份', 'Export backup')}</button>
            <button onClick={() => setData({ ...data })}>{pick('重试保存', 'Retry')}</button>
          </div>
        ) : null}
        <main className={`main-content ${view === 'editor' && aiOpen && note ? 'with-ai' : ''}`}>
          {view === 'editor' && note ? (
            <>
              <section className="editor-pane">
                <div className="note-header">
                  <div className="note-kicker">
                    <span className="note-icon">
                      <BookOpen size={23} strokeWidth={1.5} />
                    </span>
                    <span>{pick('一页笔记，一步理解', 'One note, one step closer')}</span>
                    <button
                      className="icon-button"
                      aria-label={pick('笔记属性', 'Note properties')}
                      title={pick('笔记属性', 'Note properties')}
                      onClick={() => {
                        setTagDraft(note.tags.join(', '))
                        setFolderChoice(note.folder)
                        setDialog('properties')
                      }}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </div>
                  <input
                    className="note-title"
                    aria-label={pick('笔记标题', 'Note title')}
                    value={note.title}
                    maxLength={500}
                    placeholder={pick('无标题笔记', 'Untitled note')}
                    onChange={(e) => updateNote(note.id, { title: e.target.value })}
                  />
                  <div className="note-metadata">
                    <span>{pick('编辑于', 'Edited')} {date(note.updatedAt, locale)}</span>
                    <span className="metadata-dot">·</span>
                    <span>{pick(`${words} 字`, `${words} characters`)}</span>
                    <div className="note-tags">
                      {note.tags.map((t) => (
                        <span key={t}># {t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="note-tabs" role="tablist" aria-label={pick('笔记形式', 'Note mode')}>
                    <button
                      role="tab"
                      aria-selected={tab === 'text'}
                      className={tab === 'text' ? 'selected' : ''}
                      onClick={() => setTab('text')}
                    >
                      <Type size={16} />
                      {pick('文字笔记', 'Text note')}
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'drawing'}
                      className={tab === 'drawing' ? 'selected' : ''}
                      onClick={() => setTab('drawing')}
                    >
                      <PenTool size={16} />
                      {pick('手写画板', 'Drawing')}
                      {note.strokes.length ? (
                        <span className="tiny-count">{note.strokes.length}</span>
                      ) : null}
                    </button>
                    <button
                      className="text-button make-card-button"
                      onClick={() => {
                        setCardDraft({ question: '', answer: '', noteId: note.id })
                        setDialog('card')
                      }}
                    >
                      <Layers size={15} />
                      {pick('制作闪卡', 'Create flashcard')}
                    </button>
                  </div>
                </div>
                <div
                  className="note-body"
                  role="tabpanel"
                  aria-label={tab === 'text' ? pick('文字笔记', 'Text note') : pick('手写画板', 'Drawing')}
                >
                  <Suspense fallback={<div className="loading-inline">{pick('正在准备…', 'Preparing…')}</div>}>
                    {tab === 'text' ? (
                      <NoteEditor
                        key={note.id}
                        html={note.html}
                        onChange={(html) => updateNote(note.id, { html })}
                        onImageUpload={
                          cloudSession
                            ? async (image) => (await uploadCloudImage(cloudSession, image)).src
                            : undefined
                        }
                      />
                    ) : (
                      <Drawing
                        key={note.id}
                        title={note.title}
                        strokes={note.strokes}
                        onChange={(strokes) => updateNote(note.id, { strokes })}
                      />
                    )}
                  </Suspense>
                </div>
                <footer className="editor-footer">
                  <span>
                    <Check size={13} /> {pick('你的思考，值得被记录', 'Your thinking is worth capturing')}
                  </span>
                  <span>{pick(
                    `${Math.max(1, Math.ceil(words / 400))} 分钟阅读`,
                    `${Math.max(1, Math.ceil(words / 400))} min read`,
                  )}</span>
                </footer>
              </section>
              {aiOpen ? (
                <>
                  <button
                    className="ai-scrim"
                    aria-label={pick('收起学习伙伴', 'Close study partner')}
                    onClick={() => setAiOpen(false)}
                  />
                  <Suspense
                    fallback={<aside className="ai-panel loading-inline">{pick('正在准备学习伙伴…', 'Preparing study partner…')}</aside>}
                  >
                    <AIPanel
                      key={note.id}
                      note={note}
                      settings={settings}
                      onSettings={() => setDialog('settings')}
                      onClose={() => setAiOpen(false)}
                      onAddCards={addCards}
                      onAppend={(text) => void appendAI(text, note.id)}
                    />
                  </Suspense>
                </>
              ) : null}
            </>
          ) : view === 'review' ? (
            <Review
              key={view}
              cards={data.cards}
              notes={data.notes}
              onRate={(card) =>
                setData((d) =>
                  d
                    ? {
                        ...d,
                        cards: d.cards.map((c) => (c.id === card.id ? card : c)),
                        reviewLog: [...d.reviewLog, Date.now()].slice(-100000),
                      }
                    : d,
                )
              }
              onCreate={() => {
                setCardDraft({ question: '', answer: '', noteId: note?.id || '' })
                setDialog('card')
              }}
            />
          ) : (
            <section className="library-page">
              <div className="page-kicker">
                <BookOpen size={17} /> YOUR KNOWLEDGE, GROWING.
              </div>
              <div className="view-heading">
                <div>
                  <h1>
                    {view === 'trash'
                      ? pick('回收站', 'Trash')
                      : favorites
                        ? pick('值得再读一遍', 'Worth another read')
                        : folder || pick('我的笔记', 'My Notes')}
                  </h1>
                  <p>
                    {view === 'trash'
                      ? pick('笔记保留在这里，直到你恢复或永久删除。', 'Notes stay here until you restore or permanently delete them.')
                      : search
                        ? pick(`搜索「${search}」· ${visibleNotes.length} 篇结果`, `Search “${search}” · ${visibleNotes.length} results`)
                        : pick('收集想法，连接知识，慢慢形成自己的理解。', 'Collect ideas, connect knowledge, and build your own understanding.')}
                  </p>
                </div>
                {view !== 'trash' ? (
                  <button className="button primary" onClick={createNote}>
                    <Plus size={17} />
                    {pick('新建笔记', 'New note')}
                  </button>
                ) : null}
              </div>
              {view !== 'trash' && !search && !folder && !favorites ? (
                <button className="review-banner" onClick={() => navigate('review')}>
                  <span className="banner-icon">
                    <Layers size={24} />
                  </span>
                  <span>
                    <strong>
                      {dueCount
                        ? pick(`今天有 ${dueCount} 张闪卡等你回想`, `${dueCount} flashcards are ready today`)
                        : pick('给学过的知识，一次回响', 'Bring what you learned back to mind')}
                    </strong>
                    <small>{pick('花几分钟，让记忆更牢固一点。', 'Spend a few minutes making the memory stronger.')}</small>
                  </span>
                  <span className="banner-cta">
                    {pick('开始复习', 'Start review')} <ArrowUpRight size={18} />
                  </span>
                </button>
              ) : null}
              <div className="library-list-head">
                <span>{pick(`${visibleNotes.length} 篇笔记`, `${visibleNotes.length} notes`)}</span>
                <span>{pick('按最近编辑排序', 'Recently edited first')}</span>
              </div>
              <div className="notes-grid">
                {visibleNotes.map((n) => (
                  <article className="note-card" key={n.id}>
                    {view === 'trash' ? (
                      <div className="card-main">
                        <Folder size={21} />
                        <h2>{n.title || pick('无标题笔记', 'Untitled note')}</h2>
                        <p>{htmlText(n.html).slice(0, 110) || pick('还没有文字内容', 'No text yet')}</p>
                      </div>
                    ) : (
                      <button className="card-main" onClick={() => openNote(n)}>
                        <span className="card-folder">
                          <Folder size={19} />
                          {n.folder}
                          {n.favorite ? <Star size={14} fill="currentColor" /> : null}
                        </span>
                        <h2>{n.title || pick('无标题笔记', 'Untitled note')}</h2>
                        <p>{htmlText(n.html).slice(0, 110) || pick('还没有文字内容，点击开始记录…', 'No text yet. Click to start writing…')}</p>
                        {n.strokes.length ? (
                          <span className="handwriting-badge">
                            <PenTool size={13} />
                            {pick('包含手写内容', 'Includes drawing')}
                          </span>
                        ) : null}
                      </button>
                    )}
                    <div className="card-footer">
                      <span>{date(n.updatedAt, locale)}</span>
                      {view === 'trash' ? (
                        <>
                          <button
                            className="text-button"
                            onClick={() => {
                              updateNote(n.id, { deletedAt: undefined })
                              notify(pick('笔记已恢复', 'Note restored.'))
                            }}
                          >
                            <RotateCcw size={14} />
                            {pick('恢复', 'Restore')}
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={pick(`永久删除 ${n.title}`, `Permanently delete ${n.title}`)}
                            onClick={() => setPendingDelete(n)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label={pick(`删除 ${n.title}`, `Delete ${n.title}`)}
                          onClick={() => {
                            updateNote(n.id, { deletedAt: Date.now() })
                            notify(pick('已移到回收站，可随时恢复', 'Moved to trash. You can restore it anytime.'))
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!visibleNotes.length ? (
                <div className="empty-state">
                  <FileText size={32} />
                  <h2>
                    {search
                      ? pick('没有找到相关笔记', 'No matching notes')
                      : view === 'trash'
                        ? pick('回收站是空的', 'Trash is empty')
                        : pick('给新的想法，留一页空白', 'Give a new idea a blank page')}
                  </h2>
                  <p>
                    {search
                      ? pick('试试标题、标签或正文中的其他关键词。', 'Try another keyword from the title, tags, or note text.')
                      : pick('每一份理解，都可以从一个简单的记录开始。', 'Every understanding can begin with a simple note.')}
                  </p>
                  {view !== 'trash' ? (
                    <button
                      className="button secondary"
                      onClick={search ? () => setSearch('') : createNote}
                    >
                      {search ? pick('清除搜索', 'Clear search') : pick('写第一篇笔记', 'Write your first note')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </main>
      </div>
      {dialog === 'settings' ? (
        <Settings
          settings={settings}
          onSave={(s) => {
            setSettings(s)
            try {
              localStorage.setItem(
                'orion-ai-preferences',
                JSON.stringify({ provider: s.provider, baseUrl: s.baseUrl, model: s.model }),
              )
            } catch {
              /* Preferences can remain in memory. */
            }
            notify(pick('设置已更新，密钥仅保留在本次打开的页面中', 'Settings updated. Your key stays only in this open page.'))
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'account' ? (
        <Account
          session={cloudSession}
          syncState={cloudState}
          lastSynced={cloudLastSynced}
          onAuthenticate={authenticateAccount}
          onSync={syncNow}
          onLogout={logoutAccount}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'share' ? (
        <Modal title={pick('分享这篇笔记', 'Share this note')} onClose={() => setDialog(null)}>
          {shareError ? (
            <p className="error-box" role="alert">
              {shareError}
            </p>
          ) : shareUrl ? (
            <>
              <div className="share-dialog-intro">
                <Share2 size={22} />
                <div>
                  <strong>{pick('公开链接已生成', 'Public link created')}</strong>
                  <p>
                    {pick(
                      '任何拿到链接的人都可以直接阅读文章，不需要登录。再次点击分享会更新这个链接里的内容。',
                      'Anyone with this link can read the article without signing in. Sharing again updates the content at the same link.',
                    )}
                  </p>
                </div>
              </div>
              <label className="field">
                {pick('公开文章链接', 'Public article link')}
                <div className="share-link-row">
                  <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
                  <button type="button" className="button secondary" onClick={() => void copyShareLink()}>
                    <Copy size={15} />
                    {pick('复制', 'Copy')}
                  </button>
                </div>
              </label>
              <div className="privacy-note">
                <BookOpen size={20} />
                <p>
                  {pick(
                    '公开页面只展示这篇文章的标题、标签和正文，不会公开你的邮箱、其他笔记或 AI Key。',
                    'The public page shows only this article title, tags, and content. Your email, other notes, and AI key stay private.',
                  )}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="button danger" disabled={sharing} onClick={() => void stopSharing()}>
                  {sharing ? pick('正在停止…', 'Stopping…') : pick('停止分享', 'Stop sharing')}
                </button>
                <a className="button primary" href={shareUrl} target="_blank" rel="noreferrer">
                  {pick('打开公开文章', 'Open public article')}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </>
          ) : (
            <div className="loading-inline">{pick('正在创建分享链接…', 'Creating share link…')}</div>
          )}
        </Modal>
      ) : null}
      {dialog === 'folder' ? (
        <Modal title={pick('新建笔记本', 'New notebook')} onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const f = folderDraft.trim()
              if (!f) return
              setData({ ...data, folders: [...new Set([...data.folders, f])] })
              setDialog(null)
              navigate('library', f)
            }}
          >
            <label className="field">
              {pick('笔记本名称', 'Notebook name')}
              <input
                autoFocus
                required
                maxLength={100}
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder={pick('例如：阅读、产品设计、英语', 'For example: Reading, Product Design, English')}
              />
            </label>
            <div className="modal-actions">
              <button className="button primary">{pick('创建笔记本', 'Create notebook')}</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog === 'properties' && note ? (
        <Modal title={pick('整理这篇笔记', 'Organize this note')} onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateNote(note.id, {
                folder: folderChoice,
                tags: [
                  ...new Set(
                    tagDraft
                      .split(/[,，]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ]
                  .slice(0, 20)
                  .map((s) => s.slice(0, 50)),
              })
              setDialog(null)
            }}
          >
            <label className="field">
              {pick('所属笔记本', 'Notebook')}
              <select value={folderChoice} onChange={(e) => setFolderChoice(e.target.value)}>
                {allFolders.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {pick('标签', 'Tags')}
              <input
                value={tagDraft}
                maxLength={1000}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder={pick('用逗号分隔，例如：学习方法, 读书', 'Separate with commas, for example: study, reading')}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  updateNote(note.id, { deletedAt: Date.now() })
                  setDialog(null)
                  navigate('library')
                  notify(pick('笔记已移入回收站', 'Note moved to trash.'))
                }}
              >
                {pick('移入回收站', 'Move to trash')}
              </button>
              <button className="button primary">{pick('保存修改', 'Save changes')}</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog === 'card' ? (
        <Modal title={pick('制作一张复习闪卡', 'Create a review flashcard')} onClose={() => setDialog(null)}>
          {active.length ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!cardDraft.question.trim() || !cardDraft.answer.trim()) return
                addCards([
                  {
                    ...cardDraft,
                    question: cardDraft.question.trim(),
                    answer: cardDraft.answer.trim(),
                    id: uid(),
                    due: Date.now(),
                    interval: 0,
                    reviews: 0,
                  },
                ])
                setDialog(null)
              }}
            >
              <label className="field">
                {pick('关联笔记', 'Related note')}
                <select
                  required
                  value={cardDraft.noteId}
                  onChange={(e) => setCardDraft({ ...cardDraft, noteId: e.target.value })}
                >
                  <option value="" disabled>
                    {pick('选择笔记', 'Choose a note')}
                  </option>
                  {active.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title || pick('无标题笔记', 'Untitled note')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {pick('问题', 'Question')}
                <textarea
                  required
                  rows={3}
                  maxLength={4000}
                  value={cardDraft.question}
                  onChange={(e) => setCardDraft({ ...cardDraft, question: e.target.value })}
                  placeholder={pick('一个值得主动回想的问题…', 'A question worth recalling actively…')}
                />
              </label>
              <label className="field">
                {pick('参考答案', 'Suggested answer')}
                <textarea
                  required
                  rows={4}
                  maxLength={10000}
                  value={cardDraft.answer}
                  onChange={(e) => setCardDraft({ ...cardDraft, answer: e.target.value })}
                  placeholder={pick('用自己的话解释这个知识点…', 'Explain this idea in your own words…')}
                />
              </label>
              <div className="modal-actions">
                <button className="button primary">{pick('加入复习', 'Add to review')}</button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <p>{pick('先创建一篇笔记，再为它制作闪卡。', 'Create a note before making a flashcard for it.')}</p>
              <button
                className="button primary"
                onClick={() => {
                  setDialog(null)
                  createNote()
                }}
              >
                {pick('创建笔记', 'Create note')}
              </button>
            </div>
          )}
        </Modal>
      ) : null}
      {dialog === 'import' ? (
        <Modal
          title={pick('导入与备份', 'Import & backup')}
          onClose={() => {
            if (!importing) setDialog(null)
          }}
        >
          <p className="dialog-description">{pick('把已有的知识带进来，也为重要的记录留一份备份。', 'Bring existing knowledge in and keep a backup of what matters.')}</p>
          <label className={`import-zone ${importing ? 'disabled' : ''}`}>
            <Upload size={26} />
            <strong>{importing ? pick('正在读取文件…', 'Reading file…') : pick('选择要导入的文件', 'Choose a file to import')}</strong>
            <span>{pick('Markdown、TXT 或 Orion JSON 备份 · 最大 50 MB', 'Markdown, TXT, or Orion JSON backup · 50 MB max')}</span>
            <input
              type="file"
              aria-label={pick('选择导入文件', 'Choose import file')}
              accept=".md,.markdown,.txt,.json"
              disabled={importing}
              onChange={(e) => void importFile(e)}
            />
          </label>
          <p className="field-help">
            {pick(
              '备份导入为新副本，保留当前所有笔记。JSON 包含手写笔迹、闪卡和复习进度，可用于迁移到其他设备。',
              'Backups import as new copies and keep all current notes. JSON includes drawings, flashcards, and review progress for moving to another device.',
            )}
          </p>
          {importError ? (
            <p className="error-box" role="alert">
              {importError}
            </p>
          ) : null}
          <button className="button secondary full" onClick={backup}>
            <Download size={17} />
            {pick('导出完整备份', 'Export full backup')}
          </button>
        </Modal>
      ) : null}
      {pendingDelete ? (
        <Modal title={pick('永久删除这篇笔记？', 'Permanently delete this note?')} onClose={() => setPendingDelete(null)}>
          <p className="dialog-description">
            {pick(
              `「${pendingDelete.title}」的文字、手写内容和相关闪卡将一起删除，无法撤销。`,
              `Text, drawings, and related flashcards in “${pendingDelete.title}” will be deleted. This cannot be undone.`,
            )}
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setPendingDelete(null)}>
              {pick('取消', 'Cancel')}
            </button>
            <button
              className="button danger-fill"
              onClick={() => {
                setData({
                  ...data,
                  notes: data.notes.filter((n) => n.id !== pendingDelete.id),
                  cards: data.cards.filter((c) => c.noteId !== pendingDelete.id),
                })
                setPendingDelete(null)
                notify(pick('已永久删除', 'Permanently deleted.'))
              }}
            >
              {pick('确认永久删除', 'Delete permanently')}
            </button>
          </div>
        </Modal>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button className="icon-button" aria-label={pick('关闭提示', 'Dismiss notification')} onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
