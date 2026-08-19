import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, CirclePlus, Inbox, Layers3, ListTodo } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { projectAPI, taskAPI } from '../../features/tasks/api'
import { zhCN } from '../../i18n/zh-CN'
import { useUIStore, type TaskView } from '../../stores/uiStore'
import { PomodoroWidget } from '../../features/pomodoro/PomodoroWidget'
import { SettingsDialog } from '../../features/settings/SettingsDialog'

const views: Array<{ id: TaskView; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: zhCN.inbox, icon: Inbox },
  { id: 'today', label: '今天', icon: CheckCircle2 },
  { id: 'upcoming', label: '即将到来', icon: CalendarDays },
  { id: 'all', label: zhCN.allTasks, icon: ListTodo },
  { id: 'completed', label: '已完成', icon: CheckCircle2 },
]

export function Sidebar() {
  const activeView = useUIStore((state) => state.activeView)
  const selectedProjectId = useUIStore((state) => state.selectedProjectId)
  const setActiveView = useUIStore((state) => state.setActiveView)
  const queryClient = useQueryClient()
  const [connection, setConnection] = useState('正在连接 Go…')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: projectAPI.list })
  const createProject = useMutation({
    mutationFn: (name: string) => projectAPI.create(name, '#6366f1'),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setActiveView('project', project.id)
      setProjectName('')
      setDialogOpen(false)
    },
  })

  useEffect(() => {
    taskAPI.hello().then(setConnection).catch(() => setConnection('Go core unavailable'))
  }, [])

  const submitProject = (event: FormEvent) => {
    event.preventDefault()
    if (projectName.trim()) createProject.mutate(projectName.trim())
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col border-r px-3 pb-4 pt-14">
      <div className="mb-5 px-2">
        <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.2em]">Local-first</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{zhCN.appName}</div>
      </div>
      <nav aria-label="任务视图" className="space-y-1">
        {views.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant="ghost" className={cn('w-full justify-start', activeView === id && 'bg-sidebar-accent')} onClick={() => setActiveView(id)}>
            <Icon data-icon="inline-start" />{label}
          </Button>
        ))}
      </nav>
      <Separator className="my-4" />
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-muted-foreground text-xs font-medium">项目</span>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="新建项目"><CirclePlus /></Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={submitProject}>
              <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>为相关任务建立一个本地项目。</DialogDescription></DialogHeader>
              <Input className="my-5" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" maxLength={100} autoFocus />
              <DialogFooter><Button type="submit" disabled={!projectName.trim() || createProject.isPending}>创建</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="min-h-0 space-y-1 overflow-auto">
        {(projectsQuery.data ?? []).map((project) => (
          <Button key={project.id} variant="ghost" className={cn('w-full justify-start', activeView === 'project' && selectedProjectId === project.id && 'bg-sidebar-accent')} onClick={() => setActiveView('project', project.id)}>
            <Layers3 data-icon="inline-start" style={{ color: project.color ?? undefined }} />
            <span className="truncate">{project.name}</span>
          </Button>
        ))}
      </div>
      <div className="mt-auto"><PomodoroWidget /><SettingsDialog /></div>
      <div className="bg-card mt-2 rounded-lg border p-3">
        <div className="text-xs font-medium">{zhCN.localOnly}</div>
        <div className="text-muted-foreground mt-1 truncate text-[11px]" title={connection}>{connection}</div>
      </div>
    </aside>
  )
}
