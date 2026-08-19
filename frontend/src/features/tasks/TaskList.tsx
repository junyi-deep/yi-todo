import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { zhCN } from '../../i18n/zh-CN'
import type { TaskListItem } from './api'
import { TaskRow } from './TaskRow'

type Props = {
  tasks: TaskListItem[]
  selectedTaskId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onToggle: (task: TaskListItem) => void
  onDelete: (id: string) => void
}

export function TaskList({ tasks, selectedTaskId, busy, onSelect, onToggle, onDelete }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  })

  if (tasks.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div className="max-w-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-500 dark:bg-indigo-950/50">✓</div>
          <h2 className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-100">{zhCN.emptyTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{zhCN.emptyBody}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" aria-label="任务列表">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const task = tasks[virtualRow.index]
          return (
            <div key={task.id} className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${virtualRow.start}px)` }}>
              <TaskRow task={task} selected={selectedTaskId === task.id} busy={busy} onSelect={onSelect} onToggle={onToggle} onDelete={onDelete} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

