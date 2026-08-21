import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { taskAPI } from "./api";
import { useUIStore, type TaskView } from "../../stores/uiStore";
import { ScopeTreePicker } from "./ScopeTreePicker";

export function CompactTodoView() {
  const active = useUIStore((s) => s.activeView);
  const projectId = useUIStore((s) => s.selectedProjectId);
  const categoryId = useUIStore((s) => s.selectedCategoryId);
  const setView = useUIStore((s) => s.setActiveView);
  const tasks = useQuery({
    queryKey: ["tasks", active, projectId, categoryId],
    queryFn: () => taskAPI.list(active, projectId, categoryId),
  });
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="border-b p-2">
        <ScopeTreePicker
          value={active === "project" ? `project:${projectId}` : active === "category" ? `category:${categoryId}` : active}
          allowCategory
          allowTaskViews
          onChange={(value) =>
            value.startsWith("project:") ? setView("project", value.slice(8)) : value.startsWith("category:") ? setView("category", value.slice(9)) : setView(value as TaskView)
          }
          className="w-full"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {(tasks.data ?? []).map((task) => (
          <button
            key={task.id}
            className="flex h-10 w-full items-center gap-2 border-b px-3 text-left text-xs"
            onClick={() =>
              taskAPI.complete(task.id).then(() => tasks.refetch())
            }
          >
            <span className="grid size-4 place-items-center rounded-full border">
              {task.status === "completed" && <Check />}
            </span>
            <span className="truncate">{task.title}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
