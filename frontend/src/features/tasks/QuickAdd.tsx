import { FormEvent, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { zhCN } from '../../i18n/zh-CN'

type Props = {
  pending: boolean
  onCreate: (title: string) => Promise<void>
}

export function QuickAdd({ pending, onCreate }: Props) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || pending) return
    await onCreate(trimmed)
    setTitle('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="bg-card flex items-center gap-2 rounded-xl border p-2 shadow-xs">
      <Plus className="text-muted-foreground ml-1 size-4" aria-hidden="true" />
      <Input
        id="quick-add-task"
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={zhCN.addPlaceholder}
        aria-label={zhCN.addPlaceholder}
        maxLength={500}
        className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <kbd className="text-muted-foreground hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">⌘/Ctrl N</kbd>
      <Button
        type="submit"
        disabled={pending || !title.trim()}
        size="sm"
      >
        {pending ? '…' : zhCN.add}
      </Button>
    </form>
  )
}
