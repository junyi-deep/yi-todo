import { useMemo } from "react";
import { CornerDownRight } from "lucide-react";
import type { TaskListItem, UpdateTaskMetadataInput } from "../tasks/api";

type Props = {
  tasks: TaskListItem[];
  onSelect: (id: string) => void;
  onMetadata: (input: UpdateTaskMetadataInput) => void;
};
const quadrants = [
  { key: "q1", title: "Q1 · 重要且紧急", important: true, urgent: true },
  { key: "q2", title: "Q2 · 重要不紧急", important: true, urgent: false },
  { key: "q3", title: "Q3 · 紧急不重要", important: false, urgent: true },
  { key: "q4", title: "Q4 · 不重要不紧急", important: false, urgent: false },
];
export function MatrixView({ tasks, onSelect, onMetadata }: Props) {
  const { groups, depthById, parentById } = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const depthById = new Map<string, number>();
    const depthOf = (id: string, seen = new Set<string>()): number => {
      if (depthById.has(id)) return depthById.get(id)!;
      const task = byId.get(id);
      if (!task?.parentId || seen.has(task.parentId)) return 0;
      seen.add(id);
      const depth = Math.min(5, 1 + depthOf(task.parentId, seen));
      depthById.set(id, depth);
      return depth;
    };
    tasks.forEach((task) => depthOf(task.id));
    const pathOf = (task: TaskListItem): string => {
      const parts = [String(task.sortOrder).padStart(12, "0"), task.id];
      let parent = task.parentId ? byId.get(task.parentId) : undefined;
      const seen = new Set([task.id]);
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        parts.unshift(String(parent.sortOrder).padStart(12, "0"), parent.id);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return parts.join("/");
    };
    const ordered = [...tasks].sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
    return {
      depthById,
      parentById: byId,
      groups: Object.fromEntries(
        quadrants.map((q) => [
          q.key,
          ordered.filter(
            (task) =>
              task.important === q.important && task.urgent === q.urgent,
          ),
        ]),
      ),
    };
  }, [tasks]);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2">
      {quadrants.map((quadrant) => (
        <section
          key={quadrant.key}
          className="flex min-h-0 flex-col border-b border-r"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const task = tasks.find(
              (item) => item.id === event.dataTransfer.getData("text/task-id"),
            );
            if (task)
              onMetadata({
                id: task.id,
                projectId: task.projectId,
                priority: task.priority,
                important: quadrant.important,
                urgent: quadrant.urgent,
                startAt: task.startAt,
                dueAt: task.dueAt,
                progress: task.progress,
                estimatedMinutes: null,
              });
          }}
        >
          <h3 className="flex h-9 shrink-0 items-center border-b bg-muted/35 px-3 text-xs font-semibold">
            {quadrant.title}
            <span className="text-muted-foreground ml-auto text-[10px]">
              {groups[quadrant.key].length}
            </span>
          </h3>
          <div className="min-h-0 overflow-auto p-1.5">
            {groups[quadrant.key].map((task) => (
              <button
                type="button"
                draggable
                key={task.id}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/task-id", task.id)
                }
                onClick={() => onSelect(task.id)}
                className="hover:bg-accent flex w-full cursor-grab items-center gap-1.5 rounded-md border-b py-2 pr-2.5 text-left text-[13px]"
                style={{ paddingLeft: 10 + (depthById.get(task.id) ?? 0) * 14 }}
                title={task.parentId ? `子任务 · 父任务：${parentById.get(task.parentId)?.title ?? "未显示"}` : "主任务"}
              >
                {(depthById.get(task.id) ?? 0) > 0 && <CornerDownRight className="size-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{task.title}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
