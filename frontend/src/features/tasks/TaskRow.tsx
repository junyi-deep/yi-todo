import { memo } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { zhCN } from "../../i18n/zh-CN";
import { featureAPI, type TaskListItem } from "./api";

type Props = {
  task: TaskListItem;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onToggle: (task: TaskListItem) => void;
  onDelete: (id: string) => void;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onExpand: () => void;
  onAdd: () => void;
};

export const TaskRow = memo(function TaskRow({
  task,
  selected,
  busy,
  onSelect,
  onToggle,
  onDelete,
  depth,
  hasChildren,
  expanded,
  onExpand,
  onAdd,
}: Props) {
  const completed = task.status === "completed";
  return (
    <div
      className={cn(
        "group relative flex h-[46px] items-center gap-1.5 border-b pr-3 transition-colors",
        selected ? "bg-accent/80" : "hover:bg-muted/45",
      )}
      style={{ paddingLeft: 12 + Math.min(depth, 5) * 18 }}
    >
      {selected && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}
      <button
        type="button"
        className="grid size-[17px] shrink-0 place-items-center text-muted-foreground"
        onClick={onExpand}
        disabled={!hasChildren}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )
        ) : null}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(task)}
        aria-label={completed ? `重新打开 ${task.title}` : `完成 ${task.title}`}
        className={cn(
          "grid size-[17px] shrink-0 place-items-center rounded-full border transition-colors",
          completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/55 hover:border-primary hover:bg-primary/5",
        )}
      >
        <Check className={cn("size-3", !completed && "opacity-0")} />
      </button>
      <button
        type="button"
        data-task-select
        onClick={() => onSelect(task.id)}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
      >
        <div
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            completed && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-[10px]">
          {task.priority > 0 && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                task.priority === 1
                  ? "text-red-500"
                  : task.priority === 2
                    ? "text-amber-500"
                    : task.priority === 3
                      ? "text-blue-500"
                      : "text-slate-500",
              )}
            >
              <Flag className="size-3" />
              {
                ["", "重要紧急", "重要不紧急", "紧急不重要", "不重要不紧急"][
                  task.priority
                ]
              }
            </span>
          )}
          {task.dueAt && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              {new Date(String(task.dueAt)).toLocaleDateString(undefined, {
                month: "numeric",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="opacity-0 group-hover:opacity-100"
        onClick={onAdd}
        disabled={depth >= 5}
        aria-label="添加子任务"
      >
        <Plus />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="opacity-0 group-hover:opacity-100"
        onClick={() => featureAPI.startPomodoro(task.id)}
        aria-label="启动番茄钟"
      >
        <Timer />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={busy}
        onClick={() => onDelete(task.id)}
        aria-label={`删除 ${task.title}`}
        className="text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 />
        <span className="sr-only">{zhCN.delete}</span>
      </Button>
    </div>
  );
});
