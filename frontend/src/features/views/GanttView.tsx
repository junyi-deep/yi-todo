import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'

import { Button } from '@/components/ui/button'
import { featureAPI, taskAPI, type TaskListItem } from '../tasks/api'

const day = 86_400_000

export function GanttView({ tasks, onSelect }: { tasks: TaskListItem[]; onSelect: (id: string) => void }) {
  const parent = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [predecessor, setPredecessor] = useState<string | null>(null)
  const scheduled = useMemo(() => tasks.filter((task) => task.startAt || task.dueAt), [tasks])
  const virtual = useVirtualizer({ count: scheduled.length, getScrollElement: () => parent.current, estimateSize: () => 42, overscan: 8 })
  const dependencies = useQuery({ queryKey: ['dependencies'], queryFn: featureAPI.listDependencies })
  const origin = useMemo(() => {
    const values = scheduled.flatMap((task) => [task.startAt, task.dueAt]).filter(Boolean).map((value) => new Date(String(value)).getTime())
    return values.length ? Math.min(...values) - 2 * day : Date.now()
  }, [scheduled])

  const addDependency = async (successor: string) => {
    if (!predecessor) { setPredecessor(successor); return }
    if (predecessor !== successor) await featureAPI.createDependency(predecessor, successor)
    setPredecessor(null)
    await queryClient.invalidateQueries({ queryKey: ['dependencies'] })
  }
  const move = async (task: TaskListItem, days: number, edge: 'both' | 'start' | 'end' = 'both') => {
    const start = new Date(String(task.startAt ?? task.dueAt)); const end = new Date(String(task.dueAt ?? task.startAt))
    if (edge !== 'end') start.setDate(start.getDate() + days)
    if (edge !== 'start') end.setDate(end.getDate() + days)
    await taskAPI.updateMetadata({ id: task.id, projectId: task.projectId, priority: task.priority, important: task.important, urgent: task.urgent, startAt: start.toISOString(), dueAt: end.toISOString(), progress: task.progress, estimatedMinutes: null })
    await queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }
  const virtualRows = virtual.getVirtualItems()
  const visible = new Set(virtualRows.map((row) => scheduled[row.index].id))
  const taskIndex = new Map(scheduled.map((task, index) => [task.id, index]))
  const taskEdge = (task: TaskListItem, end: boolean) => 300 + Math.max(0, (new Date(String(end ? task.dueAt ?? task.startAt : task.startAt ?? task.dueAt)).getTime() - origin) / day) * 28 + (end ? 28 : 0)

  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    <div className="border-b p-3 text-xs text-muted-foreground">拖动条块调整排期；两端按钮调整持续时间。点击“连线”选择前置与后续任务。当前依赖 {dependencies.data?.length ?? 0} 条。</div>
    <div ref={parent} className="min-h-0 flex-1 overflow-auto"><div className="relative min-w-[1100px]" style={{ height: virtual.getTotalSize() }}>
      <svg className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="100%" height={virtual.getTotalSize()} aria-hidden="true"><defs><marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" /></marker></defs>{(dependencies.data ?? []).filter((item) => visible.has(item.predecessorId) && visible.has(item.successorId)).map((item) => { const fromIndex = taskIndex.get(item.predecessorId)!; const toIndex = taskIndex.get(item.successorId)!; const from = scheduled[fromIndex]; const to = scheduled[toIndex]; const x1 = taskEdge(from, true); const x2 = taskEdge(to, false); const y1 = fromIndex * 42 + 21; const y2 = toIndex * 42 + 21; return <path key={`${item.predecessorId}-${item.successorId}`} d={`M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}`} fill="none" className="stroke-muted-foreground" strokeWidth="1.5" markerEnd="url(#gantt-arrow)" /> })}</svg>
      {virtualRows.map((row) => {
        const task = scheduled[row.index]; const start = new Date(String(task.startAt ?? task.dueAt)).getTime(); const end = new Date(String(task.dueAt ?? task.startAt)).getTime() + day
        const left = 300 + Math.max(0, (start - origin) / day) * 28; const width = Math.max(28, ((end - start) / day) * 28)
        return <div key={task.id} className="absolute left-0 right-0 flex items-center border-b" style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
          <button type="button" onClick={() => onSelect(task.id)} className="w-[250px] truncate px-4 text-left text-sm">{task.parentId ? '↳ ' : ''}{task.title}</button>
          <Button size="xs" variant={predecessor === task.id ? 'default' : 'ghost'} onClick={() => addDependency(task.id)}>连线</Button>
          <div draggable onDragStart={(event) => event.dataTransfer.setData('text/x', String(event.clientX))} onDragEnd={(event) => { const initial = Number(event.dataTransfer.getData('text/x')); const daysMoved = Math.round((event.clientX - initial) / 28); if (daysMoved) void move(task, daysMoved) }} className="bg-primary/80 absolute flex h-5 cursor-grab items-center justify-between rounded text-primary-foreground" title={`${task.progress}%`} style={{ left, width }}>
            <button type="button" className="z-10 h-full w-3 cursor-w-resize" aria-label="调整开始" onClick={() => move(task, 1, 'start')} />
            <div className="bg-primary absolute inset-y-0 left-0 rounded" style={{ width: `${task.progress}%` }} />
            <button type="button" className="z-10 h-full w-3 cursor-e-resize" aria-label="调整结束" onClick={() => move(task, 1, 'end')} />
          </div>
        </div>
      })}
    </div></div>
  </div>
}
