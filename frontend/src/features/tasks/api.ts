import {
  BackupService,
  FeatureService,
  ProjectService,
  TaskService,
} from "../../../bindings/github.com/junyiwu/yi-todo/internal/service";
import type {
  CreateDependencyInput,
  CreateReminderInput,
  CreateProjectInput,
  CreateTaskInput,
  TaskDetail,
  TaskListItem,
  TaskQuery,
  UpdateTaskInput,
  UpdateTaskMetadataInput,
  UpdateDescriptionInput,
} from "../../../bindings/github.com/junyiwu/yi-todo/internal/service";
import type {
  Attachment,
  Category,
  Dependency,
  PomodoroSession,
  Project,
  Reminder,
  SearchResult,
  TaskStatus,
} from "../../../bindings/github.com/junyiwu/yi-todo/internal/domain/models.js";
import type { TaskView } from "../../stores/uiStore";

export type { TaskListItem };

export type TaskFilterState = {
  title: string;
  status: "all" | "todo" | "in_progress" | "completed";
  important: "all" | "yes" | "no";
  urgent: "all" | "yes" | "no";
  start: string;
  end: string;
  sort: "default" | "due" | "start" | "title" | "created";
};

const defaultTaskFilters: TaskFilterState = {
  title: "",
  status: "all",
  important: "all",
  urgent: "all",
  start: "",
  end: "",
  sort: "default",
};

function taskQuery(
  view: TaskView,
  projectId: string | null,
  categoryId: string | null,
): TaskQuery {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  return {
    view,
    titleQuery: "",
    projectId,
    categoryId,
    dueFrom:
      view === "upcoming"
        ? tomorrowStart.toISOString()
        : todayStart.toISOString(),
    dueTo: tomorrowStart.toISOString(),
    status: null,
    important: null,
    urgent: null,
    startFrom: null,
    endTo: null,
    sort: "default",
    limit: 200,
    offset: 0,
  };
}

function withFilters(query: TaskQuery, filters: TaskFilterState): TaskQuery {
  const value = (filter: "all" | "yes" | "no") =>
    filter === "all" ? null : filter === "yes";
  return {
    ...query,
    titleQuery: filters.title.trim(),
    status: filters.status === "all" ? null : (filters.status as TaskStatus),
    important: value(filters.important),
    urgent: value(filters.urgent),
    startFrom: filters.start ? new Date(filters.start).toISOString() : null,
    endTo: filters.end ? new Date(filters.end).toISOString() : null,
    sort: filters.sort,
  };
}

export const taskAPI = {
  hello: async (): Promise<string> => TaskService.Hello(),
  list: async (
    view: TaskView,
    projectId: string | null = null,
    categoryId: string | null = null,
  ): Promise<TaskListItem[]> => {
    const tasks: TaskListItem[] | null = await TaskService.ListTasks(
      taskQuery(view, projectId, categoryId),
    );
    return tasks ?? [];
  },
  listFiltered: async ({
    view,
    projectId,
    categoryId,
    filters,
    titleQuery = "",
    limit,
    offset,
  }: {
    view: TaskView;
    projectId: string | null;
    categoryId: string | null;
    filters: TaskFilterState;
    titleQuery?: string;
    limit: number;
    offset: number;
  }): Promise<TaskListItem[]> => {
    const query = withFilters(taskQuery(view, projectId, categoryId), filters);
    return (
      (await TaskService.ListTasks({
        ...query,
        titleQuery: titleQuery || query.titleQuery,
        limit,
        offset,
      })) ?? []
    );
  },
  countFiltered: async ({
    view,
    projectId,
    categoryId,
    filters,
  }: {
    view: TaskView;
    projectId: string | null;
    categoryId: string | null;
    filters: TaskFilterState;
  }): Promise<number> =>
    TaskService.CountTasks(
      withFilters(taskQuery(view, projectId, categoryId), filters),
    ),
  listRange: async (
    from: string,
    to: string,
    filters: TaskFilterState = defaultTaskFilters,
  ): Promise<TaskListItem[]> =>
    (await TaskService.ListTasks(withFilters({
      view: "range",
      titleQuery: "",
      projectId: null,
      categoryId: null,
      dueFrom: from,
      dueTo: to,
      status: null,
      important: null,
      urgent: null,
      startFrom: null,
      endTo: null,
      sort: "default",
      limit: 5000,
      offset: 0,
    }, filters))) ?? [],
  listGantt: async (filters: TaskFilterState = defaultTaskFilters): Promise<TaskListItem[]> =>
    (await TaskService.ListTasks(withFilters({
      view: "all",
      titleQuery: "",
      projectId: null,
      categoryId: null,
      dueFrom: null,
      dueTo: null,
      status: null,
      important: null,
      urgent: null,
      startFrom: null,
      endTo: null,
      sort: "default",
      limit: 10000,
      offset: 0,
    }, filters))) ?? [],
  create: async ({
    title,
    projectId,
    parentId = null,
  }: {
    title: string;
    projectId: string | null;
    parentId?: string | null;
  }): Promise<TaskListItem> =>
    TaskService.CreateTask({
      title,
      projectId,
      parentId,
    } satisfies CreateTaskInput),
  update: async (id: string, title: string): Promise<TaskListItem> =>
    TaskService.UpdateTask({ id, title } satisfies UpdateTaskInput),
  complete: async (id: string): Promise<TaskListItem> =>
    TaskService.CompleteTask(id),
  reopen: async (id: string): Promise<TaskListItem> =>
    TaskService.ReopenTask(id),
  setStatus: async (id: string, status: TaskStatus): Promise<TaskListItem> =>
    TaskService.UpdateTaskStatus({ id, status }),
  delete: async (id: string): Promise<void> => TaskService.DeleteTask(id),
  detail: async (id: string): Promise<TaskDetail> =>
    TaskService.GetTaskDetail(id),
  get: async (id: string): Promise<TaskListItem> => TaskService.GetTask(id),
  updateMetadata: async (
    input: UpdateTaskMetadataInput,
  ): Promise<TaskListItem> => TaskService.UpdateTaskMetadata(input),
};

export const projectAPI = {
  list: async (): Promise<Project[]> =>
    (await ProjectService.ListProjects()) ?? [],
  create: async (name: string, color: string | null, categoryId: string): Promise<Project> =>
    ProjectService.CreateProject({ name, color, categoryId } satisfies CreateProjectInput),
  archive: async (id: string): Promise<void> =>
    ProjectService.ArchiveProject(id),
  delete: async (id: string): Promise<void> => ProjectService.DeleteProject(id),
  listCategories: async (): Promise<Category[]> =>
    (await ProjectService.ListCategories()) ?? [],
  createCategory: (name: string, parentId: string | null): Promise<Category> =>
    ProjectService.CreateCategory({ name, parentId }),
  deleteCategory: (id: string): Promise<void> => ProjectService.DeleteCategory(id),
};

export const featureAPI = {
  updateDescription: (input: UpdateDescriptionInput) =>
    FeatureService.UpdateDescription(input),
  listSubtasks: async (parentId: string): Promise<TaskListItem[]> =>
    (await FeatureService.ListSubtasks(parentId)) ?? [],
  search: async (keyword: string): Promise<SearchResult[]> =>
    (await FeatureService.SearchTasks(keyword)) ?? [],
  createDependency: (predecessorId: string, successorId: string) =>
    FeatureService.CreateDependency({
      predecessorId,
      successorId,
    } satisfies CreateDependencyInput),
  listDependencies: async (): Promise<Dependency[]> =>
    (await FeatureService.ListDependencies()) ?? [],
  importAttachment: async (taskId: string, file: File): Promise<Attachment> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return FeatureService.ImportAttachment({
      taskId,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64: btoa(binary),
    });
  },
  listAttachments: async (taskId: string): Promise<Attachment[]> =>
    (await FeatureService.ListAttachments(taskId)) ?? [],
  readAttachment: (id: string) => FeatureService.ReadAttachment(id),
  createReminder: async (
    taskId: string,
    remindAt: string,
    repeatType = "none",
    repeatValue: number | null = null,
  ): Promise<Reminder> => {
    if ("Notification" in window && Notification.permission === "default")
      await Notification.requestPermission();
    return FeatureService.CreateReminder({
      taskId,
      remindAt,
      repeatType,
      repeatValue,
    } satisfies CreateReminderInput);
  },
  listReminders: async (taskId: string): Promise<Reminder[]> =>
    (await FeatureService.ListReminders(taskId)) ?? [],
  deleteReminder: FeatureService.DeleteReminder,
  deleteAttachment: FeatureService.DeleteAttachment,
  openAttachment: FeatureService.OpenAttachment,
  activePomodoro: (): Promise<PomodoroSession | null> =>
    FeatureService.GetActivePomodoro(),
  startPomodoro: async (
    taskId: string | null,
    plannedSeconds?: number,
  ): Promise<PomodoroSession> => {
    const focusMinutes =
      Number(await FeatureService.GetSetting("pomodoro.focusMinutes")) || 25;
    return FeatureService.StartPomodoro({
      taskId,
      plannedSeconds: plannedSeconds ?? focusMinutes * 60,
    });
  },
  pausePomodoro: (): Promise<PomodoroSession | null> =>
    FeatureService.PausePomodoro(),
  resumePomodoro: (): Promise<PomodoroSession | null> =>
    FeatureService.ResumePomodoro(),
  stopPomodoro: (complete: boolean): Promise<PomodoroSession | null> =>
    FeatureService.StopPomodoro(complete),
  statistics: (days = 30) => FeatureService.GetStatistics(days),
  focusStatistics: (days = 90) => FeatureService.GetFocusStatistics(days),
  focusStatisticsForDate: (date: string) =>
    FeatureService.GetFocusStatisticsForDate(date),
  getSetting: (key: string) => FeatureService.GetSetting(key),
  setSetting: (key: string, value: string) =>
    FeatureService.SetSetting({ key, value }),
  createBackup: () => BackupService.CreateBackup(),
  listBackups: async () => (await BackupService.ListBackups()) ?? [],
  restoreBackup: (name: string) => BackupService.RestoreBackup(name),
  deleteBackup: (name: string) => BackupService.DeleteBackup(name),
  exportTasks: (all: boolean, from: string | null, to: string | null) =>
    BackupService.ExportTasksToExcel({ all, from, to }),
};

export type {
  Attachment,
  Category,
  Dependency,
  PomodoroSession,
  Project,
  Reminder,
  SearchResult,
  TaskDetail,
  UpdateTaskMetadataInput,
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as { message?: unknown };
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      return error.message;
    }
    return error.message;
  }
  return "操作失败，请重试";
}
