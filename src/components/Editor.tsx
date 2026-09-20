import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
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
} from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function NoteEditor({
  html,
  onChange,
}: {
  html: string
  onChange: (html: string) => void
}) {
  const callback = useRef(onChange)
  callback.current = onChange
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, protocols: ['https', 'http', 'mailto'] },
      }),
      Highlight,
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
    },
    onUpdate: ({ editor }) => callback.current(editor.getHTML()),
    shouldRerenderOnTransaction: true,
  })
  useEffect(() => {
    if (editor && html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false })
  }, [html, editor])
  if (!editor) return <div className="loading-inline">编辑器准备中…</div>
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
      <EditorContent editor={editor} />
    </>
  )
}
