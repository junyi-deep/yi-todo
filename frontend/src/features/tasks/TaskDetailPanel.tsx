import { ClipboardEvent, DragEvent, FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellPlus, Paperclip, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { zhCN } from '../../i18n/zh-CN'
import { errorMessage, featureAPI, projectAPI, tagAPI, taskAPI, type TaskListItem, type UpdateTaskMetadataInput } from './api'
import { RichTextEditor } from './RichTextEditor'

type Props = {
  task: TaskListItem | undefined
  pending: boolean
  onClose: () => void
  onSave: (id: string, title: string) => Promise<void>
  onMetadata: (input: UpdateTaskMetadataInput) => Promise<void>
  onToggle: (task: TaskListItem) => void
  onDelete: (id: string) => void
}

function dateInput(value: unknown): string {
  if (!value) return ''
  const date = new Date(String(value))
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dateValue(value: string): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

export function TaskDetailPanel({ task, pending, onClose, onSave, onMetadata, onToggle, onDelete }: Props) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [priority, setPriority] = useState(0)
  const [important, setImportant] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [startAt, setStartAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [progress, setProgress] = useState(0)
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [description, setDescription] = useState({ format: 'richtext' as 'richtext' | 'markdown', source: '', plain: '' })
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [detailNotice, setDetailNotice] = useState('')
  const [attachmentPreview, setAttachmentPreview] = useState('')

  const detailQuery = useQuery({
    queryKey: ['task', task?.id],
    queryFn: () => taskAPI.detail(task!.id),
    enabled: Boolean(task?.id),
  })
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: projectAPI.list })
  const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: tagAPI.list })
  const subtasksQuery = useQuery({ queryKey: ['subtasks', task?.id], queryFn: () => featureAPI.listSubtasks(task!.id), enabled: Boolean(task?.id) })
  const attachmentsQuery = useQuery({ queryKey: ['attachments', task?.id], queryFn: () => featureAPI.listAttachments(task!.id), enabled: Boolean(task?.id) })
  const remindersQuery = useQuery({ queryKey: ['reminders', task?.id], queryFn: () => featureAPI.listReminders(task!.id), enabled: Boolean(task?.id) })
  const createTag = useMutation({
    mutationFn: (name: string) => tagAPI.create(name, '#64748b'),
    onSuccess: (tag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setSelectedTagIDs((current) => [...current, tag.id])
      setNewTagName('')
    },
  })

  useEffect(() => {
    const fullTask = detailQuery.data?.task ?? task
    if (!fullTask) return
    setTitle(fullTask.title)
    setProjectId(fullTask.projectId)
    setPriority(fullTask.priority)
    setImportant(fullTask.important)
    setUrgent(fullTask.urgent)
    setStartAt(dateInput(fullTask.startAt))
    setDueAt(dateInput(fullTask.dueAt))
    setProgress(fullTask.progress)
    const estimated = 'estimatedMinutes' in fullTask ? fullTask.estimatedMinutes : null
    setEstimatedMinutes(estimated == null ? '' : String(estimated))
    setSelectedTagIDs((detailQuery.data?.tags ?? []).map((tag) => tag.id))
    if (detailQuery.data?.task) setDescription({ format: detailQuery.data.task.descriptionFormat === 'markdown' ? 'markdown' : 'richtext', source: detailQuery.data.task.descriptionSource, plain: detailQuery.data.task.descriptionPlain })
  }, [detailQuery.data, task])

  if (!task) return null

  const uploadFiles = async (files: File[]) => {
    try { for (const file of files) { const item = await featureAPI.importAttachment(task.id, file); if (item.mimeType.startsWith('image/')) window.dispatchEvent(new CustomEvent('localtodo:insert-attachment', { detail: { id: item.id, name: item.originalName } })) }; await attachmentsQuery.refetch(); setDetailNotice('') } catch (error) { setDetailNotice(errorMessage(error)) }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      if (trimmed !== task.title) await onSave(task.id, trimmed)
      await onMetadata({
      id: task.id,
      projectId,
      priority,
      important,
      urgent,
      startAt: dateValue(startAt),
      dueAt: dateValue(dueAt),
      progress,
      estimatedMinutes: estimatedMinutes === '' ? null : Number(estimatedMinutes),
      })
      await taskAPI.setTags(task.id, selectedTagIDs)
      await featureAPI.updateDescription({ id: task.id, ...description })
      await queryClient.invalidateQueries({ queryKey: ['task', task.id] })
      setDetailNotice('已保存')
    } catch (error) { setDetailNotice(errorMessage(error)) }
  }

  const completed = task.status === 'completed'
  return (
    <aside className="bg-background flex w-[400px] shrink-0 flex-col border-l pt-10" aria-label={zhCN.taskDetail} onPaste={(event: ClipboardEvent<HTMLElement>) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void uploadFiles(files) } }} onDragOver={(event: DragEvent<HTMLElement>) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={(event: DragEvent<HTMLElement>) => { const files = Array.from(event.dataTransfer.files); if (files.length) { event.preventDefault(); void uploadFiles(files) } }}>
      <header className="flex h-14 items-center justify-between border-b px-5">
        <h2 className="text-sm font-semibold">{zhCN.taskDetail}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={zhCN.close}><X /></Button>
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
          <label className="block space-y-2"><span className="text-muted-foreground text-xs font-medium">{zhCN.title}</span><Textarea value={title} onChange={(event) => setTitle(event.target.value)} rows={3} maxLength={500} autoFocus /></label>
          <div className="space-y-2"><span className="text-muted-foreground text-xs font-medium">描述</span><RichTextEditor format={description.format} source={description.source} onChange={(format, source, plain) => setDescription({ format, source, plain })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2"><span className="text-muted-foreground text-xs">项目</span><Select value={projectId ?? 'inbox'} onValueChange={(value) => setProjectId(value === 'inbox' ? null : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inbox">收件箱</SelectItem>{(projectsQuery.data ?? []).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-2"><span className="text-muted-foreground text-xs">优先级</span><Select value={String(priority)} onValueChange={(value) => setPriority(Number(value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>{value === 0 ? '无' : `P${value}`}</SelectItem>)}</SelectContent></Select></label>
          </div>
          <div className="grid grid-cols-2 gap-3"><label className="space-y-2"><span className="text-muted-foreground text-xs">开始日期</span><Input type="date" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label><label className="space-y-2"><span className="text-muted-foreground text-xs">截止日期</span><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={important} onCheckedChange={(checked) => setImportant(checked === true)} />重要</label><label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={urgent} onCheckedChange={(checked) => setUrgent(checked === true)} />紧急</label></div>
          <div className="space-y-2"><div className="flex justify-between text-xs"><span className="text-muted-foreground">进度</span><span>{progress}%</span></div><Progress value={progress} /><Input type="range" min={0} max={100} step={5} value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></div>
          <label className="block space-y-2"><span className="text-muted-foreground text-xs">预计分钟</span><Input type="number" min={0} value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
          <Separator />
          <div className="space-y-3"><span className="text-muted-foreground text-xs font-medium">标签</span><div className="flex flex-wrap gap-2">{(tagsQuery.data ?? []).map((tag) => { const selected = selectedTagIDs.includes(tag.id); return <Badge key={tag.id} variant={selected ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedTagIDs((current) => selected ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>{tag.name}</Badge> })}</div><div className="flex gap-2"><Input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="新标签" maxLength={50} /><Button type="button" variant="outline" size="icon" disabled={!newTagName.trim() || createTag.isPending} onClick={() => createTag.mutate(newTagName.trim())}><Plus /><span className="sr-only">添加标签</span></Button></div></div>
          <Separator />
          <div className="space-y-2"><div className="flex justify-between text-xs font-medium"><span>子任务</span><span className="text-muted-foreground">{(subtasksQuery.data ?? []).filter((item) => item.status === 'completed').length}/{(subtasksQuery.data ?? []).length}</span></div>{(subtasksQuery.data ?? []).map((item) => <button type="button" key={item.id} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs" onClick={() => onToggle(item)}><Checkbox checked={item.status === 'completed'} /><span className={item.status === 'completed' ? 'line-through' : ''}>{item.title}</span></button>)}<div className="flex gap-2"><Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="添加子任务" /><Button type="button" variant="outline" size="icon" disabled={!subtaskTitle.trim()} onClick={async () => { await featureAPI.createSubtask(task.id, subtaskTitle.trim()); setSubtaskTitle(''); await subtasksQuery.refetch() }}><Plus /></Button></div></div>
          <Separator />
          <div className="space-y-2"><span className="text-muted-foreground text-xs font-medium">附件（可粘贴或拖入）</span>{attachmentPreview && <img src={attachmentPreview} alt="附件预览" className="max-h-52 w-full rounded-md border object-contain" />}{(attachmentsQuery.data ?? []).map((item) => <button type="button" key={item.id} className="flex w-full items-center gap-2 text-left text-xs" onClick={async () => { if (!item.mimeType.startsWith('image/')) return; const content = await featureAPI.readAttachment(item.id); setAttachmentPreview(`data:${item.mimeType};base64,${content.dataBase64}`) }}><Paperclip className="size-3" /><span className="truncate">{item.originalName}</span><span className="text-muted-foreground ml-auto">{Math.ceil(item.byteSize / 1024)} KB</span></button>)}<Input type="file" multiple onChange={async (event) => { await uploadFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /></div>
          <Separator />
          <div className="space-y-2"><span className="text-muted-foreground text-xs font-medium">提醒</span>{(remindersQuery.data ?? []).map((item) => <div key={item.id} className="text-xs">{new Date(String(item.remindAt)).toLocaleString()} · {item.status}</div>)}<div className="flex gap-2"><Input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} /><Button type="button" variant="outline" size="icon" disabled={!remindAt} onClick={async () => { await featureAPI.createReminder(task.id, new Date(remindAt).toISOString()); setRemindAt(''); await remindersQuery.refetch() }}><BellPlus /></Button></div></div>
        </div>
        <footer className="flex gap-2 border-t p-4">
          {detailNotice && <span className="text-muted-foreground mr-auto self-center text-xs" role="status">{detailNotice}</span>}
          <Button type="submit" disabled={pending || detailQuery.isPending}>{zhCN.save}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onToggle(task)}>{completed ? zhCN.reopen : zhCN.complete}</Button>
          <Button type="button" variant="destructive" className="ml-auto" disabled={pending} onClick={() => onDelete(task.id)}>{zhCN.delete}</Button>
        </footer>
      </form>
    </aside>
  )
}
