import { lazy, Suspense, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, CalendarDays, GanttChart, Grid2X2, List } from 'lucide-react'

import { TaskStatus } from '../../../bindings/github.com/junyiwu/yi-todo/internal/domain/models.js'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { zhCN } from '../../i18n/zh-CN'
import { useUIStore } from '../../stores/uiStore'
import { errorMessage, projectAPI, taskAPI, type TaskListItem, type UpdateTaskMetadataInput } from './api'
import { QuickAdd } from './QuickAdd'
import { TaskDetailPanel } from './TaskDetailPanel'
import { TaskList } from './TaskList'
import { MatrixView } from '../views/MatrixView'
import { GanttView } from '../views/GanttView'
import type { WorkspaceMode } from '../../stores/uiStore'

const CalendarView = lazy(() => import('../views/CalendarView').then((module) => ({ default: module.CalendarView })))
const StatisticsView = lazy(() => import('../views/StatisticsView').then((module) => ({ default: module.StatisticsView })))

export function TaskWorkspace() {
  const activeView = useUIStore((state) => state.activeView)
  const selectedProjectId = useUIStore((state) => state.selectedProjectId)
  const workspaceMode = useUIStore((state) => state.workspaceMode)
  const setWorkspaceMode = useUIStore((state) => state.setWorkspaceMode)
  const selectedTaskId = useUIStore((state) => state.selectedTaskId)
  const detailPanelOpen = useUIStore((state) => state.detailPanelOpen)
  const selectTask = useUIStore((state) => state.selectTask)
  const closeDetail = useUIStore((state) => state.closeDetail)
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const queryKey = ['tasks', activeView, selectedProjectId] as const

  const tasksQuery = useQuery({ queryKey, queryFn: () => taskAPI.list(activeView, selectedProjectId) })
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: projectAPI.list })
  const ganttTasksQuery = useQuery({ queryKey: ['tasks', 'gantt'], queryFn: taskAPI.listGantt, enabled: workspaceMode === 'gantt' })
  const selectedTaskQuery = useQuery({ queryKey: ['selected-task', selectedTaskId], queryFn: () => taskAPI.get(selectedTaskId!), enabled: Boolean(selectedTaskId) })
  const tasks = tasksQuery.data ?? []

  const replaceTask = (updated: TaskListItem) => {
    queryClient.setQueryData<TaskListItem[]>(queryKey, (current = []) => current.map((task) => (task.id === updated.id ? updated : task)))
  }

  const createMutation = useMutation({
    mutationFn: (title: string) => taskAPI.create({ title, projectId: activeView === 'project' ? selectedProjectId : null }),
    onSuccess: (created) => {
      queryClient.setQueryData<TaskListItem[]>(queryKey, (current = []) => [created, ...current])
      selectTask(created.id)
      setNotice(null)
    },
    onError: (error) => setNotice(errorMessage(error)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => taskAPI.update(id, title),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TaskListItem[]>(queryKey)
      queryClient.setQueryData<TaskListItem[]>(queryKey, (current = []) => current.map((task) => (task.id === id ? { ...task, title } : task)))
      return { previous }
    },
    onSuccess: replaceTask,
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      setNotice(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const completionMutation = useMutation({
    mutationFn: (task: TaskListItem) => task.status === TaskStatus.TaskStatusCompleted ? taskAPI.reopen(task.id) : taskAPI.complete(task.id),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TaskListItem[]>(queryKey)
      const completed = task.status !== TaskStatus.TaskStatusCompleted
      queryClient.setQueryData<TaskListItem[]>(queryKey, (current = []) => current.map((item) => item.id === task.id ? {
        ...item,
        status: completed ? TaskStatus.TaskStatusCompleted : TaskStatus.TaskStatusTodo,
        progress: completed ? 100 : 0,
        completedAt: completed ? new Date().toISOString() : null,
      } : item))
      return { previous }
    },
    onSuccess: replaceTask,
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      setNotice(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const metadataMutation = useMutation({
    mutationFn: (input: UpdateTaskMetadataInput) => taskAPI.updateMetadata(input),
    onSuccess: (updated) => {
      replaceTask(updated)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', updated.id] })
    },
    onError: (error) => setNotice(errorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: taskAPI.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TaskListItem[]>(queryKey)
      queryClient.setQueryData<TaskListItem[]>(queryKey, (current = []) => current.filter((task) => task.id !== id))
      if (selectedTaskId === id) closeDetail()
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      setNotice(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const busy = updateMutation.isPending || metadataMutation.isPending || completionMutation.isPending || deleteMutation.isPending
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? selectedTaskQuery.data
  const heading = activeView === 'project'
    ? projectsQuery.data?.find((project) => project.id === selectedProjectId)?.name ?? '项目'
    : ({ inbox: zhCN.inbox, today: '今天', upcoming: '即将到来', all: zhCN.allTasks, completed: '已完成' } as const)[activeView]
  const modes: Array<{ id: WorkspaceMode; label: string; icon: typeof List }> = [{ id: 'list', label: '列表', icon: List }, { id: 'matrix', label: '四象限', icon: Grid2X2 }, { id: 'calendar', label: '日历', icon: CalendarDays }, { id: 'gantt', label: '甘特图', icon: GanttChart }, { id: 'statistics', label: '统计', icon: BarChart3 }]

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'Escape') closeDetail()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); setWorkspaceMode('list'); window.setTimeout(() => document.querySelector<HTMLInputElement>('#quick-add-task')?.focus()) }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); window.dispatchEvent(new Event('localtodo:open-settings')) }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && selectedTask) completionMutation.mutate(selectedTask)
      if (event.key === ' ' && selectedTask) { event.preventDefault(); completionMutation.mutate(selectedTask) }
      if (event.key === 'Enter' && selectedTask) selectTask(selectedTask.id)
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && tasks.length > 0) {
        event.preventDefault()
        const current = tasks.findIndex((item) => item.id === selectedTaskId)
        const next = event.key === 'ArrowDown' ? Math.min(tasks.length - 1, current + 1) : Math.max(0, current <= 0 ? 0 : current - 1)
        selectTask(tasks[next].id)
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [closeDetail, completionMutation, selectTask, selectedTask, selectedTaskId, setWorkspaceMode, tasks])

  return (
    <div className="flex min-w-0 flex-1">
      <main className="bg-muted/20 flex min-w-0 flex-1 flex-col pt-10">
        <header className="px-6 pb-4 pt-5 lg:px-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div><p className="text-muted-foreground text-xs font-medium">任务</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{heading}</h1></div>
            <div className="flex items-center gap-1">{modes.map(({ id, label, icon: Icon }) => <Button key={id} type="button" size="sm" variant={workspaceMode === id ? 'secondary' : 'ghost'} onClick={() => setWorkspaceMode(id)}><Icon />{label}</Button>)}<span className="text-muted-foreground ml-2 text-xs">{tasks.length} 项</span></div>
          </div>
          {workspaceMode === 'list' && <QuickAdd pending={createMutation.isPending} onCreate={async (title) => { await createMutation.mutateAsync(title) }} />}
          {notice && <div role="alert" className="bg-destructive/10 text-destructive mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs"><span>{notice}</span><Button variant="ghost" size="icon-xs" onClick={() => setNotice(null)} aria-label="关闭错误">×</Button></div>}
        </header>
        <Card className="mx-6 mb-6 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 lg:mx-10">
          {tasksQuery.isPending ? (
            <div className="text-muted-foreground grid flex-1 place-items-center text-sm">{zhCN.loading}</div>
          ) : tasksQuery.isError ? (
            <div className="grid flex-1 place-items-center text-center"><div><p className="text-destructive text-sm">{errorMessage(tasksQuery.error)}</p><Button variant="outline" size="sm" onClick={() => tasksQuery.refetch()} className="mt-3">{zhCN.retry}</Button></div></div>
          ) : workspaceMode === 'matrix' ? <MatrixView tasks={tasks} onSelect={selectTask} onMetadata={(input) => metadataMutation.mutate(input)} />
          : workspaceMode === 'calendar' ? <Suspense fallback={<div className="grid flex-1 place-items-center">加载日历…</div>}><CalendarView onSelect={selectTask} /></Suspense>
          : workspaceMode === 'gantt' ? <GanttView tasks={ganttTasksQuery.data ?? []} onSelect={selectTask} />
          : workspaceMode === 'statistics' ? <Suspense fallback={<div className="grid flex-1 place-items-center">加载统计…</div>}><StatisticsView /></Suspense>
          : (
            <TaskList tasks={tasks} selectedTaskId={selectedTaskId} busy={busy} onSelect={selectTask} onToggle={(task) => completionMutation.mutate(task)} onDelete={(id) => deleteMutation.mutate(id)} />
          )}
        </Card>
      </main>
      {detailPanelOpen && <TaskDetailPanel task={selectedTask} pending={busy} onClose={closeDetail} onSave={async (id, title) => { await updateMutation.mutateAsync({ id, title }) }} onMetadata={async (input) => { await metadataMutation.mutateAsync(input) }} onToggle={(task) => completionMutation.mutate(task)} onDelete={(id) => deleteMutation.mutate(id)} />}
    </div>
  )
}
