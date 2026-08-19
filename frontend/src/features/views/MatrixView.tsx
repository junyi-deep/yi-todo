import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import type { TaskListItem, UpdateTaskMetadataInput } from '../tasks/api'

type Props = { tasks: TaskListItem[]; onSelect: (id: string) => void; onMetadata: (input: UpdateTaskMetadataInput) => void }
const quadrants = [
  { key: 'q1', title: 'Q1 · 重要且紧急', important: true, urgent: true },
  { key: 'q2', title: 'Q2 · 重要不紧急', important: true, urgent: false },
  { key: 'q3', title: 'Q3 · 紧急不重要', important: false, urgent: true },
  { key: 'q4', title: 'Q4 · 不重要不紧急', important: false, urgent: false },
]
export function MatrixView({ tasks, onSelect, onMetadata }: Props) {
  const groups = useMemo(() => Object.fromEntries(quadrants.map((q) => [q.key, tasks.filter((task) => task.important === q.important && task.urgent === q.urgent)])), [tasks])
  return <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">{quadrants.map((quadrant) => <Card key={quadrant.key} className="min-h-0 gap-2 overflow-hidden p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const task = tasks.find((item) => item.id === event.dataTransfer.getData('text/task-id')); if (task) onMetadata({ id: task.id, projectId: task.projectId, priority: task.priority, important: quadrant.important, urgent: quadrant.urgent, startAt: task.startAt, dueAt: task.dueAt, progress: task.progress, estimatedMinutes: null }) }}>
    <h3 className="text-sm font-semibold">{quadrant.title}<span className="text-muted-foreground ml-2 text-xs">{groups[quadrant.key].length}</span></h3>
    <div className="min-h-0 space-y-2 overflow-auto">{groups[quadrant.key].map((task) => <button type="button" draggable key={task.id} onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)} onClick={() => onSelect(task.id)} className="bg-background hover:bg-accent w-full cursor-grab rounded-md border p-3 text-left text-sm shadow-sm">{task.title}</button>)}</div>
  </Card>)}</div>
}
