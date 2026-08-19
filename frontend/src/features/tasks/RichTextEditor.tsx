import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { mergeAttributes, Node } from '@tiptap/core'
import { Bold, Code2, Heading2, Italic, List } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  format: string
  source: string
  onChange: (format: 'richtext' | 'markdown', source: string, plain: string) => void
}

const AttachmentImage = Node.create({
  name: 'attachmentImage', group: 'block', atom: true,
  addAttributes: () => ({ attachmentId: { default: '' }, name: { default: '' } }),
  parseHTML: () => [{ tag: 'figure[data-attachment-id]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes, { 'data-attachment-id': HTMLAttributes.attachmentId, class: 'rounded-md border bg-muted p-3 text-sm' }), `🖼 ${HTMLAttributes.name || '本地图片'}`],
})

export function RichTextEditor({ format: initialFormat, source, onChange }: Props) {
  const [format, setFormat] = useState<'richtext' | 'markdown'>(initialFormat === 'markdown' ? 'markdown' : 'richtext')
  const [markdown, setMarkdown] = useState(initialFormat === 'markdown' ? source : '')
  const editor = useEditor({
    extensions: [StarterKit, AttachmentImage],
    content: (() => { try { return initialFormat === 'richtext' && source ? JSON.parse(source) : { type: 'doc', content: [] } } catch { return { type: 'doc', content: [] } } })(),
    editorProps: { attributes: { class: 'prose prose-sm dark:prose-invert min-h-28 max-w-none px-3 py-2 outline-none' } },
    onUpdate: ({ editor: current }) => onChange('richtext', JSON.stringify(current.getJSON()), current.getText()),
  })

  useEffect(() => {
    if (!editor || initialFormat !== 'richtext') return
    if (JSON.stringify(editor.getJSON()) === source) return
    try { editor.commands.setContent(source ? JSON.parse(source) : { type: 'doc', content: [] }, { emitUpdate: false }) } catch { editor.commands.clearContent(false) }
  }, [editor, initialFormat, source])
  useEffect(() => {
    const insert = (event: Event) => { const item = (event as CustomEvent<{ id: string; name: string }>).detail; editor?.chain().focus().insertContent({ type: 'attachmentImage', attrs: { attachmentId: item.id, name: item.name } }).run() }
    window.addEventListener('localtodo:insert-attachment', insert)
    return () => window.removeEventListener('localtodo:insert-attachment', insert)
  }, [editor])

  const switchFormat = (next: 'richtext' | 'markdown') => {
    if (next === format) return
    if (next === 'markdown') {
      const text = editor?.getText() ?? ''
      setMarkdown(text)
      onChange('markdown', text, text)
    } else {
      editor?.commands.setContent(markdown)
      onChange('richtext', JSON.stringify(editor?.getJSON() ?? { type: 'doc', content: [] }), editor?.getText() ?? '')
    }
    setFormat(next)
  }

  return <div className="space-y-2">
    <div className="flex items-center gap-1">
      <Button type="button" size="xs" variant={format === 'richtext' ? 'secondary' : 'ghost'} onClick={() => switchFormat('richtext')}>富文本</Button>
      <Button type="button" size="xs" variant={format === 'markdown' ? 'secondary' : 'ghost'} onClick={() => switchFormat('markdown')}>Markdown</Button>
      {format === 'richtext' && <div className="ml-auto flex gap-1">
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></Button>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 /></Button>
      </div>}
    </div>
    {format === 'markdown'
      ? <Textarea value={markdown} rows={7} onChange={(event) => { setMarkdown(event.target.value); onChange('markdown', event.target.value, event.target.value.replace(/[#_*`>\[\]()!-]/g, ' ')) }} />
      : <div className="rounded-md border bg-background"><EditorContent editor={editor} /></div>}
  </div>
}
