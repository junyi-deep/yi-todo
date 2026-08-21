import { Sidebar } from "../components/layout/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskWorkspace } from "../features/tasks/TaskWorkspace";
import { SearchPalette } from "../features/search/SearchPalette";
import { NotificationBridge } from "../features/reminders/NotificationBridge";
import { AppTopBar } from "../components/layout/AppTopBar";
import { ThemeController } from "../features/settings/ThemeSetting";
import { useUIStore } from "../stores/uiStore";
import { CompactTodoView } from "../features/tasks/CompactTodoView";
import { PomodoroMode } from "../features/pomodoro/FocusPage";
import { cn } from "@/lib/utils";

export function App() {
  const mode = useUIStore((state) => state.windowMode);
  return (
    <TooltipProvider>
      <div
        className={cn(
          "app-window-shell bg-background text-foreground flex h-screen flex-col overflow-hidden rounded-xl border text-[13px] shadow-2xl",
          mode === "normal" && "min-h-[600px] min-w-[900px]",
        )}
      >
        <AppTopBar />
        <div className="flex min-h-0 flex-1">
          {mode === "normal" ? (
            <>
              <Sidebar />
              <TaskWorkspace />
            </>
          ) : mode === "todo" ? (
            <CompactTodoView />
          ) : (
            <PomodoroMode />
          )}
        </div>
        <SearchPalette />
        <NotificationBridge />
        <ThemeController />
      </div>
    </TooltipProvider>
  );
}
