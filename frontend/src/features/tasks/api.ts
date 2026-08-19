import {
  BackupService,
  FeatureService,
  ProjectService,
  TagService,
  TaskService,
} from '../../../bindings/github.com/junyiwu/yi-todo/internal/service'
import type {
  CreateDependencyInput,
  CreateReminderInput,
  CreateSubtaskInput,
  CreateProjectInput,
  CreateTagInput,
  CreateTaskInput,
  SetTaskTagsInput,
  TaskDetail,
  TaskListItem,
  TaskQuery,
  UpdateTaskInput,
  UpdateTaskMetadataInput,
  UpdateDescriptionInput,
} from '../../../bindings/github.com/junyiwu/yi-todo/internal/service'
import type { Attachment, Dependency, PomodoroSession, Project, Reminder, SearchResult, Tag } from '../../../bindings/github.com/junyiwu/yi-todo/internal/domain/models.js'
import type { TaskView } from '../../stores/uiStore'

export type { TaskListItem }

function taskQuery(view: TaskView, projectId: string | null): TaskQuery {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  return {
    view,
    projectId,
    dueFrom: view === 'upcoming' ? tomorrowStart.toISOString() : todayStart.toISOString(),
    dueTo: tomorrowStart.toISOString(),
    limit: 200,
    offset: 0,
  }
}

export const taskAPI = {
  hello: async (): Promise<string> => TaskService.Hello(),
  list: async (view: TaskView, projectId: string | null = null): Promise<TaskListItem[]> => {
    const tasks: TaskListItem[] | null = await TaskService.ListTasks(taskQuery(view, projectId))
    return tasks ?? []
  },
  listRange: async (from: string, to: string): Promise<TaskListItem[]> => (await TaskService.ListTasks({ view: 'range', projectId: null, dueFrom: from, dueTo: to, limit: 5000, offset: 0 })) ?? [],
  listGantt: async (): Promise<TaskListItem[]> => (await TaskService.ListTasks({ view: 'all', projectId: null, dueFrom: null, dueTo: null, limit: 10000, offset: 0 })) ?? [],
  create: async ({ title, projectId }: { title: string; projectId: string | null }): Promise<TaskListItem> =>
    TaskService.CreateTask({ title, projectId } satisfies CreateTaskInput),
  update: async (id: string, title: string): Promise<TaskListItem> =>
    TaskService.UpdateTask({ id, title } satisfies UpdateTaskInput),
  complete: async (id: string): Promise<TaskListItem> => TaskService.CompleteTask(id),
  reopen: async (id: string): Promise<TaskListItem> => TaskService.ReopenTask(id),
  delete: async (id: string): Promise<void> => TaskService.DeleteTask(id),
  detail: async (id: string): Promise<TaskDetail> => TaskService.GetTaskDetail(id),
  get: async (id: string): Promise<TaskListItem> => TaskService.GetTask(id),
  updateMetadata: async (input: UpdateTaskMetadataInput): Promise<TaskListItem> =>
    TaskService.UpdateTaskMetadata(input),
  setTags: async (id: string, tagIds: string[]): Promise<TaskDetail> =>
    TaskService.SetTags({ id, tagIds } satisfies SetTaskTagsInput),
}

export const projectAPI = {
  list: async (): Promise<Project[]> => (await ProjectService.ListProjects()) ?? [],
  create: async (name: string, color: string | null): Promise<Project> =>
    ProjectService.CreateProject({ name, color } satisfies CreateProjectInput),
  archive: async (id: string): Promise<void> => ProjectService.ArchiveProject(id),
}

export const tagAPI = {
  list: async (): Promise<Tag[]> => (await TagService.ListTags()) ?? [],
  create: async (name: string, color: string | null): Promise<Tag> =>
    TagService.CreateTag({ name, color } satisfies CreateTagInput),
}

export const featureAPI = {
  updateDescription: (input: UpdateDescriptionInput) => FeatureService.UpdateDescription(input),
  createSubtask: (parentId: string, title: string) => FeatureService.CreateSubtask({ parentId, title } satisfies CreateSubtaskInput),
  listSubtasks: async (parentId: string): Promise<TaskListItem[]> => (await FeatureService.ListSubtasks(parentId)) ?? [],
  search: async (keyword: string): Promise<SearchResult[]> => (await FeatureService.SearchTasks(keyword)) ?? [],
  createDependency: (predecessorId: string, successorId: string) => FeatureService.CreateDependency({ predecessorId, successorId } satisfies CreateDependencyInput),
  listDependencies: async (): Promise<Dependency[]> => (await FeatureService.ListDependencies()) ?? [],
  importAttachment: async (taskId: string, file: File): Promise<Attachment> => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return FeatureService.ImportAttachment({ taskId, originalName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: btoa(binary) })
  },
  listAttachments: async (taskId: string): Promise<Attachment[]> => (await FeatureService.ListAttachments(taskId)) ?? [],
  readAttachment: (id: string) => FeatureService.ReadAttachment(id),
  createReminder: async (taskId: string, remindAt: string): Promise<Reminder> => {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    return FeatureService.CreateReminder({ taskId, remindAt } satisfies CreateReminderInput)
  },
  listReminders: async (taskId: string): Promise<Reminder[]> => (await FeatureService.ListReminders(taskId)) ?? [],
  activePomodoro: (): Promise<PomodoroSession | null> => FeatureService.GetActivePomodoro(),
  startPomodoro: async (taskId: string | null, plannedSeconds: number): Promise<PomodoroSession> => { if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission(); return FeatureService.StartPomodoro({ taskId, plannedSeconds }) },
  pausePomodoro: (): Promise<PomodoroSession | null> => FeatureService.PausePomodoro(),
  resumePomodoro: (): Promise<PomodoroSession | null> => FeatureService.ResumePomodoro(),
  stopPomodoro: (complete: boolean): Promise<PomodoroSession | null> => FeatureService.StopPomodoro(complete),
  statistics: (days = 30) => FeatureService.GetStatistics(days),
  getSetting: (key: string) => FeatureService.GetSetting(key),
  setSetting: (key: string, value: string) => FeatureService.SetSetting({ key, value }),
  createBackup: () => BackupService.CreateBackup(),
  listBackups: async () => (await BackupService.ListBackups()) ?? [],
  restoreBackup: (name: string) => BackupService.RestoreBackup(name),
  exportData: () => BackupService.ExportData(),
  importData: (payload: string) => BackupService.ImportData(payload),
}

export type { Attachment, Dependency, PomodoroSession, Project, Reminder, SearchResult, Tag, TaskDetail, UpdateTaskMetadataInput }

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { message?: unknown }
      if (typeof parsed.message === 'string') return parsed.message
    } catch {
      return error.message
    }
    return error.message
  }
  return '操作失败，请重试'
}
