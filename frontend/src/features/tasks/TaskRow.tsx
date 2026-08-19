import { memo } from 'react'
import { Check, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { zhCN } from '../../i18n/zh-CN'
import type { TaskListItem } from './api'

type Props = {
  task: TaskListItem
  selected: boolean
  busy: boolean
  onSelect: (id: string) => void
  onToggle: (task: TaskListItem) => void
  onDelete: (id: string) => void
}

export const TaskRow = memo(function TaskRow({ task, selected, busy, onSelect, onToggle, onDelete }: Props) {
  const completed = task.status === 'completed'
  return (
    <div className={cn('group flex h-16 items-center gap-3 border-b px-3 transition-colors', selected ? 'bg-accent' : 'hover:bg-muted/50')}>
      <Button
        type="button" variant={completed ? 'default' : 'outline'} size="icon-xs"
        disabled={busy}
        onClick={() => onToggle(task)}
        aria-label={completed ? `重新打开 ${task.title}` : `完成 ${task.title}`}
        className="rounded-full"
      >
        <Check className={cn(!completed && 'opacity-0')} />
      </Button>
      <button type="button" onClick={() => onSelect(task.id)} className="min-w-0 flex-1 py-3 text-left">
        <div className={cn('truncate text-sm', completed && 'text-muted-foreground line-through')}>{task.title}</div>
        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[11px]">
          {task.priority > 0 && <Badge variant="outline">P{task.priority}</Badge>}
          {task.dueAt && <span>{new Date(String(task.dueAt)).toLocaleDateString()}</span>}
          <span>{completed ? '已完成' : '保存在本机'}</span>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        onClick={() => onDelete(task.id)}
        aria-label={`删除 ${task.title}`}
        className="text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 /><span className="sr-only">{zhCN.delete}</span>
      </Button>
    </div>
  )
})
