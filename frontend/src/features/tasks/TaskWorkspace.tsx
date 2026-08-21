import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  GanttChart,
  Grid2X2,
  List,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";

import { TaskStatus } from "../../../bindings/github.com/junyiwu/yi-todo/internal/domain/models.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { zhCN } from "../../i18n/zh-CN";
import { useUIStore } from "../../stores/uiStore";
import {
  errorMessage,
  featureAPI,
  projectAPI,
  taskAPI,
  type TaskListItem,
  type TaskFilterState,
  type UpdateTaskMetadataInput,
} from "./api";
import { QuickAdd } from "./QuickAdd";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskList } from "./TaskList";
import { MatrixView } from "../views/MatrixView";
import { GanttView } from "../views/GanttView";
import type { WorkspaceMode } from "../../stores/uiStore";
import { SettingsPage } from "../settings/SettingsPage";
import { FocusPage } from "../pomodoro/FocusPage";
import { TableView } from "../views/TableView";

const CalendarView = lazy(() =>
  import("../views/CalendarView").then((module) => ({
    default: module.CalendarView,
  })),
);
const StatisticsView = lazy(() =>
  import("../views/StatisticsView").then((module) => ({
    default: module.StatisticsView,
  })),
);

export function TaskWorkspace() {
  const workspacePage = useUIStore((state) => state.workspacePage);
  return workspacePage === "settings" ? (
    <SettingsPage />
  ) : workspacePage === "focus" ? (
    <FocusPage />
  ) : (
    <TaskWorkspaceContent />
  );
}

function TaskWorkspaceContent() {
  const activeView = useUIStore((state) => state.activeView);
  const selectedProjectId = useUIStore((state) => state.selectedProjectId);
  const selectedCategoryId = useUIStore((state) => state.selectedCategoryId);
  const workspaceMode = useUIStore((state) => state.workspaceMode);
  const setWorkspaceMode = useUIStore((state) => state.setWorkspaceMode);
  const selectedTaskId = useUIStore((state) => state.selectedTaskId);
  const detailPanelOpen = useUIStore((state) => state.detailPanelOpen);
  const selectTask = useUIStore((state) => state.selectTask);
  const closeDetail = useUIStore((state) => state.closeDetail);
  const openSettings = useUIStore((state) => state.openSettings);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [filterSaved, setFilterSaved] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [titleFilter, setTitleFilter] = useState("");
  const [debouncedTitleFilter, setDebouncedTitleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "todo" | "in_progress" | "completed"
  >("all");
  const [importantFilter, setImportantFilter] = useState<"all" | "yes" | "no">("all");
  const [urgentFilter, setUrgentFilter] = useState<"all" | "yes" | "no">("all");
  const [startFilter, setStartFilter] = useState("");
  const [endFilter, setEndFilter] = useState("");
  const [sort, setSort] = useState<"default" | "due" | "start" | "title" | "created">("default");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedTitleFilter(titleFilter.trim()),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [titleFilter]);
  const filters = useMemo<TaskFilterState>(() => ({ title: debouncedTitleFilter, status: statusFilter, important: importantFilter, urgent: urgentFilter, start: startFilter, end: endFilter, sort }), [debouncedTitleFilter, endFilter, importantFilter, sort, startFilter, statusFilter, urgentFilter]);
  const filtersToSave = useMemo<TaskFilterState>(() => ({ ...filters, title: titleFilter.trim() }), [filters, titleFilter]);
  useEffect(() => setFilterSaved(false), [filters]);
  const queryKey = ["tasks", activeView, selectedProjectId, selectedCategoryId, filters] as const;
  const taskPageSize = 200;

  const tasksQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => taskAPI.listFiltered({
      view: activeView,
      projectId: selectedProjectId,
      categoryId: selectedCategoryId,
      filters,
      limit: taskPageSize,
      offset: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === taskPageSize ? pages.length * taskPageSize : undefined,
  });
  const taskCountQuery = useQuery({
    queryKey: ["task-count", activeView, selectedProjectId, selectedCategoryId, filters],
    queryFn: () => taskAPI.countFiltered({ view: activeView, projectId: selectedProjectId, categoryId: selectedCategoryId, filters }),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: projectAPI.list,
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: projectAPI.listCategories });
  useEffect(() => {
    Promise.all([
      featureAPI.getSetting("tasks.defaultFilter"),
      featureAPI.getSetting("tasks.filtersOpen"),
    ]).then(([value, open]) => {
      setFiltersOpen(open === "true");
      if (!value) return;
      try {
        const saved = JSON.parse(value) as Partial<TaskFilterState>;
        if (typeof saved.title === "string") {
          setTitleFilter(saved.title);
          setDebouncedTitleFilter(saved.title.trim());
        }
        if (saved.status) setStatusFilter(saved.status);
        if (saved.important) setImportantFilter(saved.important);
        if (saved.urgent) setUrgentFilter(saved.urgent);
        if (typeof saved.start === "string") setStartFilter(saved.start);
        if (typeof saved.end === "string") setEndFilter(saved.end);
        if (saved.sort) setSort(saved.sort);
      } catch {
        // Ignore malformed legacy values and retain safe defaults.
      }
    });
  }, []);
  const saveFilters = useMutation({
    mutationFn: () => featureAPI.setSetting("tasks.defaultFilter", JSON.stringify(filtersToSave)),
    onSuccess: () => setFilterSaved(true),
    onError: (error) => setNotice(errorMessage(error)),
  });
  const ganttTasksQuery = useQuery({
    queryKey: ["tasks", "gantt", filters],
    queryFn: () => taskAPI.listGantt(filters),
    enabled: workspaceMode === "gantt",
  });
  const selectedTaskQuery = useQuery({
    queryKey: ["selected-task", selectedTaskId],
    queryFn: () => taskAPI.get(selectedTaskId!),
    enabled: Boolean(selectedTaskId),
  });
  const tasks = useMemo(
    () => tasksQuery.data?.pages.flat() ?? [],
    [tasksQuery.data],
  );
  const visibleTasks = tasks;
  const hasActiveFilters =
    Boolean(titleFilter.trim()) ||
    statusFilter !== "all" ||
    importantFilter !== "all" ||
    urgentFilter !== "all" ||
    Boolean(startFilter) ||
    Boolean(endFilter) ||
    sort !== "default";
  const resetFilters = () => {
    setTitleFilter("");
    setDebouncedTitleFilter("");
    setStatusFilter("all");
    setImportantFilter("all");
    setUrgentFilter("all");
    setStartFilter("");
    setEndFilter("");
    setSort("default");
  };

  const setFiltersExpanded = (open: boolean) => {
    setFiltersOpen(open);
    void featureAPI
      .setSetting("tasks.filtersOpen", String(open))
      .catch((error) => setNotice(errorMessage(error)));
  };

  const replaceTask = (updated: TaskListItem) => {
    queryClient.setQueryData<InfiniteData<TaskListItem[], number>>(queryKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) =>
              page.map((task) => (task.id === updated.id ? updated : task)),
            ),
          }
        : current,
    );
  };

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      taskAPI.create({
        title,
        projectId: activeView === "project" ? selectedProjectId : null,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task-count"] });
      selectTask(created.id);
      setNotice(null);
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      taskAPI.update(id, title),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<TaskListItem[], number>>(queryKey);
      queryClient.setQueryData<InfiniteData<TaskListItem[], number>>(queryKey, (current) =>
        current ? { ...current, pages: current.pages.map((page) => page.map((task) => task.id === id ? { ...task, title } : task)) } : current,
      );
      return { previous };
    },
    onSuccess: replaceTask,
    onError: (error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      setNotice(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["task-count"] });
      void queryClient.invalidateQueries({ queryKey: ["task-table-count"] });
    },
  });

  const completionMutation = useMutation({
    mutationFn: (task: TaskListItem) =>
      task.status === TaskStatus.TaskStatusCompleted
        ? taskAPI.reopen(task.id)
        : taskAPI.complete(task.id),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<TaskListItem[], number>>(queryKey);
      const completed = task.status !== TaskStatus.TaskStatusCompleted;
      queryClient.setQueryData<InfiniteData<TaskListItem[], number>>(queryKey, (current) =>
        current ? { ...current, pages: current.pages.map((page) => page.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: completed
                  ? TaskStatus.TaskStatusCompleted
                  : TaskStatus.TaskStatusTodo,
                progress: completed ? 100 : 0,
                completedAt: completed ? new Date().toISOString() : null,
              }
            : item,
        )) } : current,
      );
      return { previous };
    },
    onSuccess: replaceTask,
    onError: (error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      setNotice(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["task-count"] });
      void queryClient.invalidateQueries({ queryKey: ["task-table-count"] });
    },
  });

  const metadataMutation = useMutation({
    mutationFn: (input: UpdateTaskMetadataInput) =>
      taskAPI.updateMetadata(input),
    onSuccess: (updated) => {
      replaceTask(updated);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", updated.id] });
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: taskAPI.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<TaskListItem[], number>>(queryKey);
      queryClient.setQueryData<InfiniteData<TaskListItem[], number>>(queryKey, (current) =>
        current ? { ...current, pages: current.pages.map((page) => page.filter((task) => task.id !== id)) } : current,
      );
      if (selectedTaskId === id) closeDetail();
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      setNotice(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["task-count"] });
      void queryClient.invalidateQueries({ queryKey: ["task-table-count"] });
    },
  });

  const busy =
    updateMutation.isPending ||
    metadataMutation.isPending ||
    completionMutation.isPending ||
    deleteMutation.isPending;
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? selectedTaskQuery.data;
  const heading =
    activeView === "project"
      ? (projectsQuery.data?.find((project) => project.id === selectedProjectId)
          ?.name ?? "项目")
      : activeView === "category"
        ? (categoriesQuery.data?.find((category) => category.id === selectedCategoryId)?.name ?? "分类")
      : (
          {
            inbox: zhCN.inbox,
            today: "今天",
            upcoming: "即将到来",
            all: zhCN.allTasks,
            completed: "已完成",
          } as const
        )[activeView];
  const modes: Array<{ id: WorkspaceMode; label: string; icon: typeof List }> =
    [
      { id: "list", label: "列表", icon: List },
      { id: "matrix", label: "四象限", icon: Grid2X2 },
      { id: "calendar", label: "日历", icon: CalendarDays },
      { id: "gantt", label: "甘特图", icon: GanttChart },
      { id: "table", label: "表格", icon: Table2 },
      { id: "statistics", label: "统计", icon: BarChart3 },
    ];

  useEffect(() => {
    const focusNewTask = () => {
      setWorkspaceMode("list");
      window.setTimeout(() =>
        document.querySelector<HTMLInputElement>("#quick-add-task")?.focus(),
      );
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === "Escape") closeDetail();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        focusNewTask();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        openSettings();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        selectedTask
      )
        completionMutation.mutate(selectedTask);
      if (event.key === " " && selectedTask) {
        event.preventDefault();
        completionMutation.mutate(selectedTask);
      }
      if (event.key === "Enter" && selectedTask) selectTask(selectedTask.id);
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        tasks.length > 0
      ) {
        event.preventDefault();
        const current = tasks.findIndex((item) => item.id === selectedTaskId);
        const next =
          event.key === "ArrowDown"
            ? Math.min(tasks.length - 1, current + 1)
            : Math.max(0, current <= 0 ? 0 : current - 1);
        selectTask(tasks[next].id);
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("localtodo:new-task", focusNewTask);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("localtodo:new-task", focusNewTask);
    };
  }, [
    closeDetail,
    completionMutation,
    openSettings,
    selectTask,
    selectedTask,
    selectedTaskId,
    setWorkspaceMode,
    tasks,
  ]);

  return (
    <div className="flex min-w-0 flex-1">
      <main className="bg-background flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {heading}
            </h1>
          </div>
          <div className="flex items-center gap-0.5">
            {modes.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={workspaceMode === id ? "secondary" : "ghost"}
                    onClick={() => setWorkspaceMode(id)}
                    aria-label={label}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}
            <span className="text-muted-foreground ml-1 border-l pl-2 text-[11px] tabular-nums">
              {taskCountQuery.data ?? tasks.length}
            </span>
            <Button
              type="button"
              variant={filtersOpen || hasActiveFilters ? "secondary" : "ghost"}
              size="icon-sm"
              title="筛选任务"
              aria-label={filtersOpen ? "收起筛选和排序" : "展开筛选和排序"}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersExpanded(!filtersOpen)}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        </header>
        {filtersOpen && (
          <div className="shrink-0 border-b bg-muted/20 px-4 py-2 text-xs">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <label className="min-w-52 flex-1 sm:max-w-72">
                <span className="mb-1 block text-[11px] text-muted-foreground">
                  任务名称
                </span>
                <span className="relative block">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={titleFilter}
                    onChange={(event) => setTitleFilter(event.target.value)}
                    placeholder="搜索任务名称"
                    aria-label="按任务名称过滤"
                    className="h-7 border border-transparent bg-background/70 pl-7 pr-7 text-xs shadow-none focus-visible:border-foreground focus-visible:ring-0"
                  />
                  {titleFilter && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="清除任务名称过滤"
                      className="absolute right-0.5 top-1/2 -translate-y-1/2"
                      onClick={() => setTitleFilter("")}
                    >
                      <X />
                    </Button>
                  )}
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">状态</span>
                <select className="h-7 min-w-24 rounded-md border bg-background px-2 outline-none" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">全部</option><option value="todo">待办</option><option value="in_progress">进行中</option><option value="completed">已完成</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">重要</span>
                <select className="h-7 min-w-20 rounded-md border bg-background px-2 outline-none" value={importantFilter} onChange={(event) => setImportantFilter(event.target.value as typeof importantFilter)}>
                  <option value="all">全部</option><option value="yes">是</option><option value="no">否</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">紧急</span>
                <select className="h-7 min-w-20 rounded-md border bg-background px-2 outline-none" value={urgentFilter} onChange={(event) => setUrgentFilter(event.target.value as typeof urgentFilter)}>
                  <option value="all">全部</option><option value="yes">是</option><option value="no">否</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">排序方式</span>
                <select className="h-7 min-w-28 rounded-md border bg-background px-2 outline-none" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                  <option value="default">默认顺序</option><option value="start">开始时间</option><option value="due">结束时间</option><option value="title">任务名称</option><option value="created">创建时间</option>
                </select>
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-border/60 pt-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">开始时间（可选）</span>
                <span className="flex items-center gap-1">
                  <input type="datetime-local" aria-label="按最早开始时间过滤" className="h-7 rounded-md border bg-background px-2 text-foreground outline-none" value={startFilter} onChange={(event) => setStartFilter(event.target.value)} />
                  {startFilter ? (
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="清除开始时间" title="清除开始时间" onClick={() => setStartFilter("")}><X /></Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">不限</span>
                  )}
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">结束时间（可选）</span>
                <span className="flex items-center gap-1">
                  <input type="datetime-local" aria-label="按最晚结束时间过滤" className="h-7 rounded-md border bg-background px-2 text-foreground outline-none" value={endFilter} onChange={(event) => setEndFilter(event.target.value)} />
                  {endFilter ? (
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="清除结束时间" title="清除结束时间" onClick={() => setEndFilter("")}><X /></Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">不限</span>
                  )}
                </span>
              </label>
              <div className="ml-auto flex items-center gap-1">
                {hasActiveFilters && <Button variant="ghost" size="xs" onClick={resetFilters}><RotateCcw />重置</Button>}
                <Button variant="outline" size="xs" disabled={saveFilters.isPending} onClick={() => saveFilters.mutate()} title="以后启动应用时自动使用当前条件"><Save />{filterSaved ? "已保存为默认条件" : "保存为默认条件"}</Button>
              </div>
            </div>
          </div>
        )}
        {workspaceMode === "list" && activeView !== "category" && (
          <QuickAdd
            pending={createMutation.isPending}
            onCreate={async (title) => {
              await createMutation.mutateAsync(title);
            }}
          />
        )}
        {notice && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive flex h-8 shrink-0 items-center justify-between border-b px-4 text-xs"
          >
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setNotice(null)}
              aria-label="关闭错误"
            >
              ×
            </Button>
          </div>
        )}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tasksQuery.isPending ? (
            <div className="text-muted-foreground grid flex-1 place-items-center text-sm">
              {zhCN.loading}
            </div>
          ) : tasksQuery.isError ? (
            <div className="grid flex-1 place-items-center text-center">
              <div>
                <p className="text-destructive text-sm">
                  {errorMessage(tasksQuery.error)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => tasksQuery.refetch()}
                  className="mt-3"
                >
                  {zhCN.retry}
                </Button>
              </div>
            </div>
          ) : workspaceMode === "table" ? (
            <TableView view={activeView} projectId={selectedProjectId} categoryId={selectedCategoryId} filters={filters} onSort={setSort} onSelect={selectTask} />
          ) : workspaceMode === "matrix" ? (
            <MatrixView
              tasks={visibleTasks}
              onSelect={selectTask}
              onMetadata={(input) => metadataMutation.mutate(input)}
            />
          ) : workspaceMode === "calendar" ? (
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center">加载日历…</div>
              }
            >
              <CalendarView onSelect={selectTask} filters={filters} />
            </Suspense>
          ) : workspaceMode === "gantt" ? (
            <GanttView
              tasks={ganttTasksQuery.data ?? []}
              onSelect={selectTask}
            />
          ) : workspaceMode === "statistics" ? (
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center">加载统计…</div>
              }
            >
              <StatisticsView />
            </Suspense>
          ) : (
            <TaskList
              key={`${activeView}:${selectedProjectId ?? ""}:${selectedCategoryId ?? ""}:${JSON.stringify(filters)}`}
              tasks={visibleTasks}
              total={taskCountQuery.data ?? tasks.length}
              hasMore={tasksQuery.hasNextPage}
              loadingMore={tasksQuery.isFetchingNextPage}
              onLoadMore={tasksQuery.fetchNextPage}
              selectedTaskId={selectedTaskId}
              busy={busy}
              onSelect={selectTask}
              onToggle={(task) => completionMutation.mutate(task)}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          )}
        </section>
      </main>
      {detailPanelOpen && (
        <TaskDetailPanel
          task={selectedTask}
          pending={busy}
          onClose={closeDetail}
          onSave={async (id, title) => {
            await updateMutation.mutateAsync({ id, title });
          }}
          onMetadata={async (input) => {
            await metadataMutation.mutateAsync(input);
          }}
          onToggle={(task) => completionMutation.mutate(task)}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}
