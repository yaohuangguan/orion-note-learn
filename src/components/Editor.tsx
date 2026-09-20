import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Mathematics from '@tiptap/extension-mathematics'
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import 'katex/dist/katex.min.css'
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code2,
  Highlighter,
  Undo2,
  Redo2,
  Heading2,
  Heading3,
  ImagePlus,
  Sigma,
} from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function inlineMathContent(schema: Schema, text: string) {
  const result: ProseMirrorNode[] = []
  const expression = /\\\((.+?)\\\)|\$\$([^$\n]+?)\$\$|(?<!\$)\$([^$\n]+?)\$(?!\$)/g
  let cursor = 0
  let found = false
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0
    if (index > cursor) result.push(schema.text(text.slice(cursor, index)))
    const latex = (match[1] ?? match[2] ?? match[3]).trim()
    if (latex) {
      result.push(schema.nodes.inlineMath.create({ latex }))
      found = true
    } else {
      result.push(schema.text(match[0]))
    }
    cursor = index + match[0].length
  }
  if (cursor < text.length) result.push(schema.text(text.slice(cursor)))
  return { content: result, found }
}

function mathPasteSlice(schema: Schema, value: string) {
  const text = value.replace(/\r\n?/g, '\n')
  const trimmed = text.trim()
  const wholeBlock =
    trimmed.match(/^\$\$([\s\S]+)\$\$$/) ?? trimmed.match(/^\\\[([\s\S]+)\\\]$/)
  if (wholeBlock?.[1]?.trim()) {
    return new Slice(
      Fragment.from(schema.nodes.blockMath.create({ latex: wholeBlock[1].trim() })),
      0,
      0,
    )
  }

  let found = false
  const blocks: ProseMirrorNode[] = []
  for (const line of text.split('\n')) {
    const block = line.trim().match(/^\$\$([^$]+)\$\$$/) ?? line.trim().match(/^\\\[(.+)\\\]$/)
    if (block?.[1]?.trim()) {
      blocks.push(schema.nodes.blockMath.create({ latex: block[1].trim() }))
      found = true
      continue
    }
    const inline = inlineMathContent(schema, line)
    found ||= inline.found
    blocks.push(schema.nodes.paragraph.create(null, inline.content))
  }
  return found ? new Slice(Fragment.from(blocks), 0, 0) : null
}

export default function NoteEditor({
  html,
  onChange,
}: {
  html: string
  onChange: (html: string) => void
}) {
  const callback = useRef(onChange)
  const editorRef = useRef<Editor | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')
  callback.current = onChange

  const showMessage = (value: string) => {
    setMessage(value)
    window.setTimeout(() => setMessage(''), 3500)
  }

  const insertImage = async (file: File, currentEditor = editorRef.current) => {
    if (!currentEditor) return
    if (!SAFE_IMAGE_TYPES.has(file.type)) {
      showMessage('请使用 PNG、JPEG、GIF、WebP 或 AVIF 图片。')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showMessage('图片超过 12 MB，请压缩后再粘贴。')
      return
    }
    try {
      const src = await readImage(file)
      currentEditor
        .chain()
        .focus()
        .setImage({ src, alt: file.name || '粘贴的图片' })
        .run()
    } catch {
      showMessage('图片读取失败，请换一张图片重试。')
    }
  }

  const editMath = (kind: 'inline' | 'block', node: ProseMirrorNode, pos: number) => {
    const latex = window.prompt('编辑 LaTeX 公式', String(node.attrs.latex ?? ''))
    if (latex === null) return
    const value = latex.trim()
    const chain = editorRef.current?.chain().focus()
    if (!chain) return
    if (!value) {
      if (kind === 'inline') chain.deleteInlineMath({ pos }).run()
      else chain.deleteBlockMath({ pos }).run()
      return
    }
    if (kind === 'inline') chain.updateInlineMath({ pos, latex: value }).run()
    else chain.updateBlockMath({ pos, latex: value }).run()
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, protocols: ['https', 'http', 'mailto'] },
      }),
      Highlight,
      Image.configure({ allowBase64: true }),
      Mathematics.configure({
        katexOptions: { throwOnError: false, strict: false },
        inlineOptions: { onClick: (node, pos) => editMath('inline', node, pos) },
        blockOptions: { onClick: (node, pos) => editMath('block', node, pos) },
      }),
      Placeholder.configure({ placeholder: '写下一个想法，让理解从这里开始…' }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: 'prose note-prose',
        'aria-label': '笔记正文',
        role: 'textbox',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
      handlePaste(view, event) {
        const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        )
        if (images.length) {
          images.forEach((file) => void insertImage(file))
          return true
        }
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const slice = text ? mathPasteSlice(view.state.schema, text) : null
        if (!slice) return false
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
      handleDrop(_view, event) {
        const images = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        )
        if (!images.length) return false
        event.preventDefault()
        images.forEach((file) => void insertImage(file))
        return true
      },
    },
    onUpdate: ({ editor }) => callback.current(editor.getHTML()),
    shouldRerenderOnTransaction: true,
  })
  editorRef.current = editor
  useEffect(() => {
    if (editor && html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false })
  }, [html, editor])
  if (!editor) return <div className="loading-inline">编辑器准备中…</div>

  const insertFormula = () => {
    const latex = window.prompt('输入 LaTeX 公式', 'P(\\text{mW}) = 10^{\\frac{\\text{dBm}}{10}}')
    if (latex?.trim()) editor.chain().focus().insertBlockMath({ latex: latex.trim() }).run()
  }

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0]
    if (image) void insertImage(image, editor)
    event.target.value = ''
  }
  const buttons = [
    {
      label: '二级标题',
      Icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: '三级标题',
      Icon: Heading3,
      active: editor.isActive('heading', { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: '加粗',
      Icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: '斜体',
      Icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: '删除线',
      Icon: Strikethrough,
      active: editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: '高亮',
      Icon: Highlighter,
      active: editor.isActive('highlight'),
      run: () => editor.chain().focus().toggleHighlight().run(),
    },
    {
      label: '无序列表',
      Icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '有序列表',
      Icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: '引用',
      Icon: Quote,
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: '代码块',
      Icon: Code2,
      active: editor.isActive('codeBlock'),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ]
  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="文字格式">
        {buttons.map(({ label, Icon, active, run }) => (
          <button
            key={label}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={`icon-button ${active ? 'active' : ''}`}
            onClick={run}
          >
            <Icon size={17} />
          </button>
        ))}
        <span className="toolbar-divider" />
        <button className="icon-button" title="插入公式" aria-label="插入公式" onClick={insertFormula}>
          <Sigma size={17} />
        </button>
        <button
          className="icon-button"
          title="插入图片"
          aria-label="插入图片"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={17} />
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          aria-label="选择笔记图片"
          onChange={selectImage}
        />
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          title="撤销"
          aria-label="撤销文字"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          title="重做"
          aria-label="重做文字"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={17} />
        </button>
      </div>
      <div className={`editor-feature-hint ${message ? 'error' : ''}`} role={message ? 'alert' : undefined}>
        {message || '可直接粘贴或拖入图片；粘贴 \\(…\\)、$…$ 或 $$…$$ 即可渲染公式，点击公式可编辑。'}
      </div>
      <EditorContent editor={editor} />
    </>
  )
}
