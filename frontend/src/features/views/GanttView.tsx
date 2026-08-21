import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { featureAPI, taskAPI, type TaskListItem } from "../tasks/api";

const day = 86_400_000;
const labelWidth = 300;
const dayWidth = 32;

function beginningOfDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function GanttView({
  tasks,
  onSelect,
}: {
  tasks: TaskListItem[];
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [predecessor, setPredecessor] = useState<string | null>(null);
  const scheduled = useMemo(
    () => tasks.filter((task) => task.startAt || task.dueAt),
    [tasks],
  );
  const dependencies = useQuery({
    queryKey: ["dependencies"],
    queryFn: featureAPI.listDependencies,
  });
  const bounds = useMemo(() => {
    const values = scheduled
      .flatMap((task) => [task.startAt, task.dueAt])
      .filter(Boolean)
      .map((value) => new Date(String(value)).getTime());
    const origin =
      beginningOfDay(values.length ? Math.min(...values) : Date.now()) -
      2 * day;
    const end =
      beginningOfDay(values.length ? Math.max(...values) : Date.now()) +
      4 * day;
    return { origin, count: Math.max(14, Math.ceil((end - origin) / day)) };
  }, [scheduled]);
  const dates = useMemo(
    () =>
      Array.from(
        { length: bounds.count },
        (_, index) => new Date(bounds.origin + index * day),
      ),
    [bounds],
  );

  const addDependency = async (successor: string) => {
    if (!predecessor) {
      setPredecessor(successor);
      return;
    }
    if (predecessor !== successor)
      await featureAPI.createDependency(predecessor, successor);
    setPredecessor(null);
    await queryClient.invalidateQueries({ queryKey: ["dependencies"] });
  };
  const move = async (
    task: TaskListItem,
    days: number,
    edge: "both" | "start" | "end" = "both",
  ) => {
    const start = new Date(String(task.startAt ?? task.dueAt));
    const end = new Date(String(task.dueAt ?? task.startAt));
    if (edge !== "end") start.setDate(start.getDate() + days);
    if (edge !== "start") end.setDate(end.getDate() + days);
    if (edge === "start" && start >= end)
      start.setTime(end.getTime() - 15 * 60_000);
    if (edge === "end" && end <= start)
      end.setTime(start.getTime() + 15 * 60_000);
    await taskAPI.updateMetadata({
      id: task.id,
      projectId: task.projectId,
      priority: task.priority,
      important: task.important,
      urgent: task.urgent,
      startAt: start.toISOString(),
      dueAt: end.toISOString(),
      progress: task.progress,
      estimatedMinutes: task.estimatedMinutes,
    });
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    task: TaskListItem,
    edge: "both" | "start" | "end",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    const pointerID = event.pointerId;
    const initialX = event.clientX;
    target.setPointerCapture(pointerID);
    const finish = (finishEvent: PointerEvent) => {
      target.releasePointerCapture(pointerID);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      const daysMoved = Math.round((finishEvent.clientX - initialX) / dayWidth);
      if (daysMoved) void move(task, daysMoved, edge);
      else if (edge === "both") onSelect(task.id);
    };
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        拖动任务条调整排期，拖动左右把手调整开始和结束日期；点击任务条打开详情。“连线”依次选择前置与后续任务。依赖{" "}
        {dependencies.data?.length ?? 0} 条。
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ minWidth: labelWidth + dates.length * dayWidth }}
        >
          <div className="sticky top-0 z-20 flex h-9 border-b bg-background/95 backdrop-blur">
            <div className="sticky left-0 z-30 flex w-[300px] shrink-0 items-center border-r bg-background px-4 text-xs font-medium">
              任务
            </div>
            {dates.map((date) => (
              <div
                key={date.toISOString()}
                className="flex w-8 shrink-0 flex-col items-center justify-center border-r text-[9px] text-muted-foreground"
              >
                <span>
                  {date.getMonth() + 1}/{date.getDate()}
                </span>
                <span>{"日一二三四五六"[date.getDay()]}</span>
              </div>
            ))}
          </div>
          {scheduled.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted-foreground">
              暂无已排期任务
            </div>
          ) : (
            scheduled.map((task) => {
              const start = new Date(
                String(task.startAt ?? task.dueAt),
              ).getTime();
              const end = Math.max(
                start + 60 * 60 * 1000,
                new Date(String(task.dueAt ?? task.startAt)).getTime(),
              );
              const left =
                labelWidth +
                Math.max(0, (start - bounds.origin) / day) * dayWidth;
              const width = Math.max(18, ((end - start) / day) * dayWidth);
              return (
                <div
                  key={task.id}
                  className="relative flex h-10 items-center border-b"
                >
                  <div className="sticky left-0 z-10 flex h-full w-[300px] shrink-0 items-center gap-1 border-r bg-background px-2">
                    <button
                      type="button"
                      onClick={() => onSelect(task.id)}
                      className="min-w-0 flex-1 truncate px-2 text-left text-xs"
                    >
                      {task.parentId ? "↳ " : ""}
                      {task.title}
                    </button>
                    <Button
                      size="xs"
                      variant={predecessor === task.id ? "default" : "ghost"}
                      onClick={() => addDependency(task.id)}
                    >
                      连线
                    </Button>
                  </div>
                  <div
                    className="pointer-events-none absolute bottom-0 top-0"
                    style={{
                      left: labelWidth,
                      width: dates.length * dayWidth,
                      backgroundImage:
                        "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                      backgroundSize: `${dayWidth}px 100%`,
                    }}
                  />
                  <div
                    onPointerDown={(event) => beginDrag(event, task, "both")}
                    className="bg-primary/75 absolute z-[5] flex h-5 touch-none cursor-grab select-none items-center overflow-hidden rounded text-primary-foreground shadow-sm active:cursor-grabbing"
                    style={{ left, width }}
                    title={`${new Date(start).toLocaleString()} – ${new Date(end).toLocaleString()} · ${task.progress}%`}
                  >
                    <button
                      type="button"
                      className="z-10 h-full w-3 shrink-0 touch-none cursor-w-resize border-r border-white/35"
                      aria-label="拖动调整开始日期"
                      title="拖动调整开始日期"
                      onPointerDown={(event) => beginDrag(event, task, "start")}
                    />
                    <div
                      className="bg-primary absolute inset-y-0 left-0"
                      style={{ width: `${task.progress}%` }}
                    />
                    <span className="pointer-events-none relative z-10 min-w-0 flex-1 truncate px-1 text-[9px]">
                      {task.progress}%
                    </span>
                    <button
                      type="button"
                      className="z-10 h-full w-3 shrink-0 touch-none cursor-e-resize border-l border-white/35"
                      aria-label="拖动调整结束日期"
                      title="拖动调整结束日期"
                      onPointerDown={(event) => beginDrag(event, task, "end")}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
