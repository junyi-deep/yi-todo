import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { featureAPI } from '../tasks/api'
import { useUIStore } from '../../stores/uiStore'

export function SearchPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const setActiveView = useUIStore((state) => state.setActiveView)
  const selectTask = useUIStore((state) => state.selectTask)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 200); return () => window.clearTimeout(timer) }, [query])
  const results = useQuery({ queryKey: ['search', debounced], queryFn: () => featureAPI.search(debounced), enabled: debounced.length > 0 })

  const openResult = (id: string) => { setActiveView('all'); selectTask(id); setOpen(false); setQuery('') }
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="gap-0 p-0 sm:max-w-xl">
    <DialogHeader className="sr-only"><DialogTitle>搜索任务</DialogTitle></DialogHeader>
    <div className="flex items-center border-b px-4"><Search className="text-muted-foreground size-4" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题与描述…" className="h-14 border-0 shadow-none focus-visible:ring-0" /></div>
    <div className="max-h-96 overflow-auto p-2">
      {debounced && !results.isPending && (results.data ?? []).length === 0 && <p className="text-muted-foreground p-8 text-center text-sm">没有匹配任务</p>}
      {(results.data ?? []).map((item) => <button key={item.id} type="button" onClick={() => openResult(item.id)} className="hover:bg-accent w-full rounded-md px-3 py-3 text-left">
        <div className="text-sm font-medium">{item.title}</div><div className="text-muted-foreground mt-1 line-clamp-1 text-xs">{item.projectName ?? '收件箱'}{item.descriptionPlain ? ` · ${item.descriptionPlain}` : ''}</div>
      </button>)}
    </div>
  </DialogContent></Dialog>
}
