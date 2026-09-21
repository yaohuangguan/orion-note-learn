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
  type CloudSession,
  CloudApiError,
} from './cloud'

const Drawing = lazy(() => import('./components/Drawing'))
const AIPanel = lazy(() => import('./components/AIPanel'))
type View = 'editor' | 'library' | 'review' | 'trash'
type Dialog = 'settings' | 'account' | 'folder' | 'card' | 'import' | 'properties' | null
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
function date(value: number) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export default function App() {
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
  const [selectedId, setSelectedId] = useState('welcome')
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
          notify('检测到另一台设备的修改，已安全合并并继续同步')
          return
        }
      }
      if (error instanceof CloudApiError && error.status === 401) {
        clearCloudSession()
        cloudReadyFor.current = ''
        setCloudSession(null)
        setCloudState('idle')
        notify('云端登录已过期，请重新登录')
        return
      }
      setCloudState('error')
      notify(error instanceof Error ? error.message : '云同步失败，本地笔记仍已保存')
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
        notify('云同步已开启，这台设备的笔记已上传')
        return
      }
      const merged = sanitizeWorkspace(mergeWorkspaces(workspace, remote.workspace))
      cloudLastPushed.current = remote.workspace
      setCloudLastSynced(remote.updatedAt)
      setCloudState('synced')
      if (JSON.stringify(merged) !== JSON.stringify(workspace)) setData(merged)
      if (JSON.stringify(merged) !== JSON.stringify(remote.workspace))
        notify('本机与云端笔记已合并，正在上传最新版本')
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
          setLoadError('无法读取本地笔记。请确认浏览器允许使用存储，然后重新加载。原数据未被覆盖。')
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
    const n = newNote(folder || '我的笔记')
    setData((d) => (d ? { ...d, notes: [n, ...d.notes] } : d))
    setSelectedId(n.id)
    setView('editor')
    setTab('text')
    setSearch('')
    setSidebarOpen(false)
    notify('新笔记已创建，开始写下你的想法吧')
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
      notify('备份已导出，包含笔记、手写内容和复习进度')
    }
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImporting(true)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('文件超过 50 MB，请分批导入。')
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
        notify(`已导入 ${notes.length} 篇笔记，原有笔记已保留`)
      } else {
        if (raw.length > 500000) throw new Error('单篇文本过长，请拆分后导入。')
        const n = newNote(folder || '我的笔记')
        n.title = file.name.replace(/\.(md|markdown|txt)$/i, '').slice(0, 500)
        if (file.name.toLowerCase().endsWith('.txt')) {
          const div = document.createElement('div')
          div.textContent = raw
          n.html = `<p>${div.innerHTML.replace(/\n/g, '<br>')}</p>`
        } else n.html = sanitizeHtml(await marked(raw))
        setData((d) => (d ? { ...d, notes: [n, ...d.notes] } : d))
        openNote(n)
        notify('笔记已导入')
      }
      setDialog(null)
    } catch (error) {
      setImportError(
        error instanceof SyntaxError
          ? '文件不是有效的 JSON 备份。'
          : error instanceof Error && error.name !== 'ZodError'
            ? error.message
            : '备份格式不符合 Orion 规范，未导入任何数据。',
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
      notify('PDF 已生成')
    } catch {
      notify('PDF 生成失败，请重试，或使用浏览器打印保存为 PDF')
    } finally {
      setExporting(false)
    }
  }
  function addCards(cards: Card[]) {
    setData((d) => (d ? { ...d, cards: [...d.cards, ...cards] } : d))
    notify(`已加入 ${cards.length} 张复习闪卡`)
  }
  async function appendAI(text: string, id: string) {
    const html = sanitizeHtml(await marked(text))
    setData((d) =>
      d
        ? {
            ...d,
            notes: d.notes.map((n) =>
              n.id === id
                ? { ...n, html: `${n.html}<h2>AI 学习整理</h2>${html}`, updatedAt: Date.now() }
                : n,
            ),
          }
        : d,
    )
    notify('AI 结果已追加到笔记末尾')
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
    notify(mode === 'register' ? '账户已创建，笔记正在上传云端' : '登录成功，笔记已连接云端')
  }
  async function syncNow() {
    if (!cloudSession || !data) return
    if (cloudReadyFor.current !== cloudSession.token) {
      await connectCloud(cloudSession, data)
      return
    }
    await syncCloudSnapshot(data, cloudSession)
    notify('云端同步已完成')
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
    notify('已退出云端账户，本机笔记仍然保留')
  }
  if (loadError)
    return (
      <div className="app-loading">
        <BookOpen size={36} />
        <h1>暂时无法打开笔记</h1>
        <p role="alert">{loadError}</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    )
  if (!data)
    return (
      <div className="app-loading">
        <BookOpen size={36} />
        <h1>Orion</h1>
        <p>正在打开你的学习空间…</p>
      </div>
    )
  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <button
          className="sidebar-scrim"
          aria-label="收起侧栏"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="主导航">
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
            aria-label="关闭侧栏"
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
          aria-label="账户与云同步"
          onClick={() => setDialog('account')}
        >
          <span className="workspace-avatar">O</span>
          <span>
            我的学习空间
            <small>
              {cloudSession
                ? cloudState === 'checking' || cloudState === 'syncing'
                  ? '正在同步…'
                  : cloudState === 'error'
                    ? '本地已保存 · 等待同步'
                    : cloudSession.user.email
                : '登录后跨设备同步'}
            </small>
          </span>
          {cloudSession && cloudState !== 'error' ? <Cloud size={15} /> : <CloudOff size={15} />}
        </button>
        <label className="search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            aria-label="搜索笔记"
            placeholder="搜索笔记…"
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
          新建笔记<span>＋</span>
        </button>
        <nav className="main-nav">
          <button
            className={view === 'library' && !folder && !favorites ? 'selected' : ''}
            onClick={() => navigate('library')}
          >
            <LayoutGrid size={18} />
            全部笔记<span>{active.length}</span>
          </button>
          <button
            className={view === 'review' ? 'selected' : ''}
            onClick={() => navigate('review')}
          >
            <Layers size={18} />
            学习与复习{dueCount ? <span className="count-pill">{dueCount}</span> : null}
          </button>
          <button
            className={favorites ? 'selected' : ''}
            onClick={() => navigate('library', '', true)}
          >
            <Star size={18} />
            收藏笔记
          </button>
        </nav>
        <div className="sidebar-section-label">
          笔记本
          <button
            className="icon-button"
            aria-label="新建笔记本"
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
        <div className="sidebar-section-label recent-label">最近编辑</div>
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
                <span>{n.title || '无标题笔记'}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <Leaf size={18} />
            <strong>给知识一点生长的时间</strong>
            <span>写下来，再想一遍。</span>
          </div>
          <button
            className="sidebar-utility"
            onClick={() => {
              setImportError('')
              setDialog('import')
            }}
          >
            <Upload size={17} />
            导入与备份
          </button>
          <button className="sidebar-utility" onClick={() => navigate('trash')}>
            <Trash2 size={17} />
            回收站
          </button>
          <button className="sidebar-utility" onClick={() => setDialog('settings')}>
            <SettingsIcon size={17} />
            设置
            <span className={`connection-dot ${settings.apiKey ? 'connected' : ''}`} />
          </button>
          <div className="local-footer">
            <span className={cloudSession && cloudState === 'synced' ? 'connected' : ''} />
            {cloudSession ? '本地优先 · 云端同步' : '数据保存在此设备'}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button sidebar-toggle"
              aria-label="打开侧栏"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>我的空间</span>
            <ChevronRight size={14} />
            <span>
              {view === 'editor'
                ? note?.folder || '笔记'
                : view === 'review'
                  ? '学习与复习'
                  : view === 'trash'
                    ? '回收站'
                    : favorites
                      ? '收藏笔记'
                      : folder || '全部笔记'}
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
              {saveState === 'saved' ? '已保存' : saveState === 'saving' ? '保存中…' : '保存失败'}
            </span>
            {view === 'editor' && note ? (
              <>
                <button
                  className={`icon-button favorite-button ${note.favorite ? 'is-favorite' : ''}`}
                  title="收藏"
                  aria-label={note.favorite ? '取消收藏' : '收藏笔记'}
                  onClick={() => updateNote(note.id, { favorite: !note.favorite })}
                >
                  <Star size={18} fill={note.favorite ? 'currentColor' : 'none'} />
                </button>
                <details className="export-menu">
                  <summary className="button plain">
                    <Download size={16} />
                    <span>导出</span>
                    <ChevronDown size={13} />
                  </summary>
                  <div className="dropdown-menu">
                    <button
                      disabled={exporting}
                      onClick={() => {
                        void pdf()
                      }}
                    >
                      {exporting ? '正在生成 PDF…' : '下载 PDF（含手写）'}
                    </button>
                    <button onClick={() => exportMarkdown(note)}>Markdown 文件</button>
                    <button onClick={() => exportPlainText(note)}>纯文本文件</button>
                    <button onClick={() => window.print()}>打印 / 保存为 PDF</button>
                    <button onClick={backup}>完整数据备份</button>
                  </div>
                </details>
                <button
                  aria-label="学习伙伴"
                  className={`button ai-toggle ${aiOpen ? 'on' : ''}`}
                  aria-pressed={aiOpen}
                  onClick={() => setAiOpen(!aiOpen)}
                >
                  <Sparkles size={16} />
                  <span>学习伙伴</span>
                </button>
              </>
            ) : null}
          </div>
        </header>
        {saveState === 'error' ? (
          <div className="save-error" role="alert">
            本地保存失败，可能是存储空间不足。请立即导出备份，避免丢失修改。
            <button onClick={backup}>导出备份</button>
            <button onClick={() => setData({ ...data })}>重试保存</button>
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
                    <span>一页笔记，一步理解</span>
                    <button
                      className="icon-button"
                      aria-label="笔记属性"
                      title="笔记属性"
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
                    aria-label="笔记标题"
                    value={note.title}
                    maxLength={500}
                    placeholder="无标题笔记"
                    onChange={(e) => updateNote(note.id, { title: e.target.value })}
                  />
                  <div className="note-metadata">
                    <span>编辑于 {date(note.updatedAt)}</span>
                    <span className="metadata-dot">·</span>
                    <span>{words} 字</span>
                    <div className="note-tags">
                      {note.tags.map((t) => (
                        <span key={t}># {t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="note-tabs" role="tablist" aria-label="笔记形式">
                    <button
                      role="tab"
                      aria-selected={tab === 'text'}
                      className={tab === 'text' ? 'selected' : ''}
                      onClick={() => setTab('text')}
                    >
                      <Type size={16} />
                      文字笔记
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'drawing'}
                      className={tab === 'drawing' ? 'selected' : ''}
                      onClick={() => setTab('drawing')}
                    >
                      <PenTool size={16} />
                      手写画板
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
                      制作闪卡
                    </button>
                  </div>
                </div>
                <div
                  className="note-body"
                  role="tabpanel"
                  aria-label={tab === 'text' ? '文字笔记' : '手写画板'}
                >
                  <Suspense fallback={<div className="loading-inline">正在准备…</div>}>
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
                    <Check size={13} /> 你的思考，值得被记录
                  </span>
                  <span>{Math.max(1, Math.ceil(words / 400))} 分钟阅读</span>
                </footer>
              </section>
              {aiOpen ? (
                <>
                  <button
                    className="ai-scrim"
                    aria-label="收起学习伙伴"
                    onClick={() => setAiOpen(false)}
                  />
                  <Suspense
                    fallback={<aside className="ai-panel loading-inline">正在准备学习伙伴…</aside>}
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
                      ? '回收站'
                      : favorites
                        ? '值得再读一遍'
                        : folder || '我的笔记'}
                  </h1>
                  <p>
                    {view === 'trash'
                      ? '笔记保留在这里，直到你恢复或永久删除。'
                      : search
                        ? `搜索「${search}」· ${visibleNotes.length} 篇结果`
                        : '收集想法，连接知识，慢慢形成自己的理解。'}
                  </p>
                </div>
                {view !== 'trash' ? (
                  <button className="button primary" onClick={createNote}>
                    <Plus size={17} />
                    新建笔记
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
                      {dueCount ? `今天有 ${dueCount} 张闪卡等你回想` : '给学过的知识，一次回响'}
                    </strong>
                    <small>花几分钟，让记忆更牢固一点。</small>
                  </span>
                  <span className="banner-cta">
                    开始复习 <ArrowUpRight size={18} />
                  </span>
                </button>
              ) : null}
              <div className="library-list-head">
                <span>{visibleNotes.length} 篇笔记</span>
                <span>按最近编辑排序</span>
              </div>
              <div className="notes-grid">
                {visibleNotes.map((n) => (
                  <article className="note-card" key={n.id}>
                    {view === 'trash' ? (
                      <div className="card-main">
                        <Folder size={21} />
                        <h2>{n.title || '无标题笔记'}</h2>
                        <p>{htmlText(n.html).slice(0, 110) || '还没有文字内容'}</p>
                      </div>
                    ) : (
                      <button className="card-main" onClick={() => openNote(n)}>
                        <span className="card-folder">
                          <Folder size={19} />
                          {n.folder}
                          {n.favorite ? <Star size={14} fill="currentColor" /> : null}
                        </span>
                        <h2>{n.title || '无标题笔记'}</h2>
                        <p>{htmlText(n.html).slice(0, 110) || '还没有文字内容，点击开始记录…'}</p>
                        {n.strokes.length ? (
                          <span className="handwriting-badge">
                            <PenTool size={13} />
                            包含手写内容
                          </span>
                        ) : null}
                      </button>
                    )}
                    <div className="card-footer">
                      <span>{date(n.updatedAt)}</span>
                      {view === 'trash' ? (
                        <>
                          <button
                            className="text-button"
                            onClick={() => {
                              updateNote(n.id, { deletedAt: undefined })
                              notify('笔记已恢复')
                            }}
                          >
                            <RotateCcw size={14} />
                            恢复
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`永久删除 ${n.title}`}
                            onClick={() => setPendingDelete(n)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label={`删除 ${n.title}`}
                          onClick={() => {
                            updateNote(n.id, { deletedAt: Date.now() })
                            notify('已移到回收站，可随时恢复')
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
                      ? '没有找到相关笔记'
                      : view === 'trash'
                        ? '回收站是空的'
                        : '给新的想法，留一页空白'}
                  </h2>
                  <p>
                    {search
                      ? '试试标题、标签或正文中的其他关键词。'
                      : '每一份理解，都可以从一个简单的记录开始。'}
                  </p>
                  {view !== 'trash' ? (
                    <button
                      className="button secondary"
                      onClick={search ? () => setSearch('') : createNote}
                    >
                      {search ? '清除搜索' : '写第一篇笔记'}
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
            notify('设置已更新，密钥仅保留在本次打开的页面中')
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
      {dialog === 'folder' ? (
        <Modal title="新建笔记本" onClose={() => setDialog(null)}>
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
              笔记本名称
              <input
                autoFocus
                required
                maxLength={100}
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder="例如：阅读、产品设计、英语"
              />
            </label>
            <div className="modal-actions">
              <button className="button primary">创建笔记本</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog === 'properties' && note ? (
        <Modal title="整理这篇笔记" onClose={() => setDialog(null)}>
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
              所属笔记本
              <select value={folderChoice} onChange={(e) => setFolderChoice(e.target.value)}>
                {allFolders.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="field">
              标签
              <input
                value={tagDraft}
                maxLength={1000}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="用逗号分隔，例如：学习方法, 读书"
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
                  notify('笔记已移入回收站')
                }}
              >
                移入回收站
              </button>
              <button className="button primary">保存修改</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {dialog === 'card' ? (
        <Modal title="制作一张复习闪卡" onClose={() => setDialog(null)}>
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
                关联笔记
                <select
                  required
                  value={cardDraft.noteId}
                  onChange={(e) => setCardDraft({ ...cardDraft, noteId: e.target.value })}
                >
                  <option value="" disabled>
                    选择笔记
                  </option>
                  {active.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title || '无标题笔记'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                问题
                <textarea
                  required
                  rows={3}
                  maxLength={4000}
                  value={cardDraft.question}
                  onChange={(e) => setCardDraft({ ...cardDraft, question: e.target.value })}
                  placeholder="一个值得主动回想的问题…"
                />
              </label>
              <label className="field">
                参考答案
                <textarea
                  required
                  rows={4}
                  maxLength={10000}
                  value={cardDraft.answer}
                  onChange={(e) => setCardDraft({ ...cardDraft, answer: e.target.value })}
                  placeholder="用自己的话解释这个知识点…"
                />
              </label>
              <div className="modal-actions">
                <button className="button primary">加入复习</button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <p>先创建一篇笔记，再为它制作闪卡。</p>
              <button
                className="button primary"
                onClick={() => {
                  setDialog(null)
                  createNote()
                }}
              >
                创建笔记
              </button>
            </div>
          )}
        </Modal>
      ) : null}
      {dialog === 'import' ? (
        <Modal
          title="导入与备份"
          onClose={() => {
            if (!importing) setDialog(null)
          }}
        >
          <p className="dialog-description">把已有的知识带进来，也为重要的记录留一份备份。</p>
          <label className={`import-zone ${importing ? 'disabled' : ''}`}>
            <Upload size={26} />
            <strong>{importing ? '正在读取文件…' : '选择要导入的文件'}</strong>
            <span>Markdown、TXT 或 Orion JSON 备份 · 最大 50 MB</span>
            <input
              type="file"
              aria-label="选择导入文件"
              accept=".md,.markdown,.txt,.json"
              disabled={importing}
              onChange={(e) => void importFile(e)}
            />
          </label>
          <p className="field-help">
            备份导入为新副本，保留当前所有笔记。JSON
            包含手写笔迹、闪卡和复习进度，可用于迁移到其他设备。
          </p>
          {importError ? (
            <p className="error-box" role="alert">
              {importError}
            </p>
          ) : null}
          <button className="button secondary full" onClick={backup}>
            <Download size={17} />
            导出完整备份
          </button>
        </Modal>
      ) : null}
      {pendingDelete ? (
        <Modal title="永久删除这篇笔记？" onClose={() => setPendingDelete(null)}>
          <p className="dialog-description">
            「{pendingDelete.title}」的文字、手写内容和相关闪卡将一起删除，无法撤销。
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setPendingDelete(null)}>
              取消
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
                notify('已永久删除')
              }}
            >
              确认永久删除
            </button>
          </div>
        </Modal>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
