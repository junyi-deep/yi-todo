import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";

import { zhCN } from "../../i18n/zh-CN";
import { errorMessage, featureAPI, taskAPI, type TaskListItem } from "./api";
import { TaskRow } from "./TaskRow";

type Props = {
  tasks: TaskListItem[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<unknown>;
  selectedTaskId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onToggle: (task: TaskListItem) => void;
  onDelete: (id: string) => void;
};

type FlatRow =
  | { kind: "task"; task: TaskListItem; depth: number }
  | { kind: "add"; target: QuickAddTarget; depth: number };

type QuickAddTarget = {
  anchorId: string;
  parentId: string | null;
  projectId: string | null;
  kind: "sibling" | "child";
};

export function TaskList({
  tasks,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  selectedTaskId,
  busy,
  onSelect,
  onToggle,
  onDelete,
}: Props) {
  const client = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [supplemental, setSupplemental] = useState<Map<string, TaskListItem>>(
    new Map(),
  );
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(
    new Set(),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState<QuickAddTarget | null>(null);
  const [title, setTitle] = useState("");

  const mergedTasks = useMemo(() => {
    const byID = new Map(supplemental);
    for (const task of tasks) byID.set(task.id, task);
    return [...byID.values()];
  }, [supplemental, tasks]);
  const children = useMemo(() => {
    const map = new Map<string, TaskListItem[]>();
    for (const task of mergedTasks) {
      if (!task.parentId) continue;
      const list = map.get(task.parentId) ?? [];
      list.push(task);
      map.set(task.parentId, list);
    }
    for (const list of map.values())
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [mergedTasks]);
  const flat = useMemo<FlatRow[]>(() => {
    const result: FlatRow[] = [];
    const visit = (task: TaskListItem, depth: number) => {
      result.push({ kind: "task", task, depth });
      if (adding?.anchorId === task.id)
        result.push({
          kind: "add",
          target: adding,
          depth: adding.kind === "child" ? depth + 1 : depth,
        });
      if (expanded.has(task.id))
        for (const child of children.get(task.id) ?? [])
          visit(child, depth + 1);
    };
    const ids = new Set(mergedTasks.map((task) => task.id));
    for (const task of mergedTasks)
      if (!task.parentId || !ids.has(task.parentId)) visit(task, 0);
    return result;
  }, [adding, children, expanded, mergedTasks]);

  useEffect(() => {
    const handleQuickCreate = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !selectedTaskId || busy) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, button, select, [contenteditable="true"], [role="menu"]') &&
        !target.closest("[data-task-select]")
      )
        return;
      const selectedRow = flat.find(
        (row): row is Extract<FlatRow, { kind: "task" }> =>
          row.kind === "task" && row.task.id === selectedTaskId,
      );
      if (!selectedRow || (event.shiftKey && selectedRow.depth >= 5)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const child = event.shiftKey;
      setAdding({
        anchorId: selectedRow.task.id,
        parentId: child ? selectedRow.task.id : selectedRow.task.parentId,
        projectId: selectedRow.task.projectId,
        kind: child ? "child" : "sibling",
      });
      setTitle("");
      if (child)
        setExpanded((current) => new Set(current).add(selectedRow.task.id));
    };
    window.addEventListener("keydown", handleQuickCreate, true);
    return () => window.removeEventListener("keydown", handleQuickCreate, true);
  }, [busy, flat, selectedTaskId]);

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flat[index]?.kind === "add" ? 36 : 46),
    overscan: 12,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? -1;
  useEffect(() => {
    if (
      hasMore &&
      !loadingMore &&
      lastVisibleIndex >= Math.max(0, flat.length - 20)
    )
      void onLoadMore();
  }, [flat.length, hasMore, lastVisibleIndex, loadingMore, onLoadMore]);

  const expand = async (task: TaskListItem) => {
    if (expanded.has(task.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      return;
    }
    setExpanded((current) => new Set(current).add(task.id));
    const loadedCount = children.get(task.id)?.length ?? 0;
    if (task.childCount <= loadedCount || loadingChildren.has(task.id)) return;
    setLoadingChildren((current) => new Set(current).add(task.id));
    try {
      const loaded = await featureAPI.listSubtasks(task.id);
      setSupplemental((current) => {
        const next = new Map(current);
        for (const child of loaded) next.set(child.id, child);
        return next;
      });
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoadingChildren((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const add = async (target: QuickAddTarget) => {
    if (!title.trim()) return;
    try {
      const created = await taskAPI.create({
        title: title.trim(),
        projectId: target.projectId,
        parentId: target.parentId,
      });
      setSupplemental((current) => new Map(current).set(created.id, created));
      setTitle("");
      setAdding(null);
      if (target.parentId)
        setExpanded((current) => new Set(current).add(target.parentId!));
      onSelect(created.id);
      setLoadError(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["tasks"] }),
        client.invalidateQueries({ queryKey: ["task-count"] }),
        client.invalidateQueries({ queryKey: ["task-table-count"] }),
      ]);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  };

  if (!tasks.length && !loadingMore)
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div>
          <div className="mx-auto grid size-9 place-items-center rounded-full border text-muted-foreground">
            ✓
          </div>
          <h2 className="mt-3 text-sm font-medium">{zhCN.emptyTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{zhCN.emptyBody}</p>
        </div>
      </div>
    );
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      {loadError && (
        <div className="sticky top-0 z-20 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {loadError}
        </div>
      )}
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const row = flat[virtualRow.index];
          return (
            <div
              key={row.kind === "task" ? row.task.id : `add-${row.target.anchorId}-${row.target.kind}`}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === "task" ? (
                <TaskRow
                  task={row.task}
                  depth={row.depth}
                  hasChildren={
                    row.task.childCount > 0 ||
                    (children.get(row.task.id)?.length ?? 0) > 0
                  }
                  expanded={expanded.has(row.task.id)}
                  selected={selectedTaskId === row.task.id}
                  busy={busy}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onDelete={(id) => {
                    setSupplemental((current) => {
                      const next = new Map(current);
                      next.delete(id);
                      return next;
                    });
                    onDelete(id);
                  }}
                  onExpand={() => void expand(row.task)}
                  onAdd={() => {
                    setAdding({
                      anchorId: row.task.id,
                      parentId: row.task.id,
                      projectId: row.task.projectId,
                      kind: "child",
                    });
                    setTitle("");
                  }}
                />
              ) : (
                <form
                  className="flex h-9 items-center gap-2 border-b pr-3"
                  style={{ paddingLeft: 48 + Math.min(row.depth, 5) * 18 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void add(row.target);
                  }}
                >
                  <span className="text-muted-foreground">↳</span>
                  <input
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => !title && setAdding(null)}
                    placeholder={row.target.kind === "child" ? "添加子任务，回车创建" : "添加同级任务，回车创建"}
                    className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
                  />
                </form>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex h-9 items-center justify-center border-t text-[11px] text-muted-foreground">
        {loadingMore
          ? "正在加载更多任务…"
          : `已加载 ${Math.min(tasks.length, total)} / ${total} 条`}
      </div>
    </div>
  );
}
