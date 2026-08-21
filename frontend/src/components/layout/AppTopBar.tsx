import { useState } from "react";
import { Window } from "@wailsio/runtime";
import {
  Timer,
  CirclePlus,
  ListTodo,
  Maximize2,
  Minus,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "../../features/settings/ThemeSetting";
import { useUIStore } from "../../stores/uiStore";

type WindowMode = "normal" | "todo" | "pomodoro";

export function AppTopBar() {
  const [pinned, setPinned] = useState(false);
  const mode = useUIStore((state) => state.windowMode);
  const setMode = useUIStore((state) => state.setWindowMode);

  const setWindowMode = async (next: WindowMode) => {
    setMode(next);
    setPinned(false);
    await Window.SetAlwaysOnTop(false);
    if (next === "normal") {
      await Window.SetMinSize(900, 600);
      await Window.SetSize(1280, 800);
    }
    if (next === "todo") {
      await Window.SetMinSize(420, 520);
      await Window.SetSize(460, 680);
    }
    if (next === "pomodoro") {
      await Window.SetMinSize(340, 240);
      await Window.SetSize(390, 280);
    }
    await Window.Center();
  };

  const togglePin = async () => {
    const next = !pinned;
    await Window.SetAlwaysOnTop(next);
    setPinned(next);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest(".app-no-drag"))
      void Window.ToggleMaximise();
  };
  const prepareDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (
      event.detail !== 2 ||
      (event.target as HTMLElement).closest(".app-no-drag")
    )
      return;
    const target = event.target as HTMLElement;
    target.style.setProperty("--wails-draggable", "no-drag");
    window.setTimeout(
      () => target.style.removeProperty("--wails-draggable"),
      0,
    );
  };

  if (mode !== "normal") {
    return (
      <header
        className="app-drag-region bg-sidebar/95 flex h-9 shrink-0 items-center border-b px-1 backdrop-blur"
        onMouseDownCapture={prepareDoubleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div className="min-w-0 flex-1" />
        <div className="app-no-drag flex shrink-0 items-center">
          <Button
            variant={pinned ? "secondary" : "ghost"}
            size="icon-sm"
            title={pinned ? "取消窗口置顶" : "固定窗口在最上层"}
            aria-label={pinned ? "取消窗口置顶" : "固定窗口在最上层"}
            onClick={togglePin}
          >
            {pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="还原主窗口"
            aria-label="还原主窗口"
            onClick={() => setWindowMode("normal")}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="最小化"
            aria-label="最小化"
            onClick={() => Window.Minimise()}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="最大化或还原"
            aria-label="最大化或还原"
            onClick={() => Window.ToggleMaximise()}
          >
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="关闭并退出"
            aria-label="关闭并退出"
            className="hover:bg-destructive hover:text-white"
            onClick={() => Window.Close()}
          >
            <X />
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header
      className="app-drag-region bg-sidebar/95 flex h-9 shrink-0 items-center border-b px-2 backdrop-blur"
      onMouseDownCapture={prepareDoubleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="w-28 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <button
          type="button"
          title="搜索任务（⌘K）"
          className="app-no-drag text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-7 w-full max-w-md items-center gap-2 rounded-lg bg-muted/55 px-3 text-left text-xs transition-colors"
          onClick={() =>
            window.dispatchEvent(new Event("localtodo:open-search"))
          }
        >
          <Search className="size-3.5" />
          <span className="truncate">搜索任务</span>
          <kbd className="ml-auto text-[10px] opacity-70">⌘ K</kbd>
        </button>
      </div>
      <div className="app-no-drag flex shrink-0 justify-end">
        <Button
          variant="ghost"
          size="icon-sm"
          title="切换到紧凑任务列表"
          aria-label="紧凑待办视图"
          onClick={() => setWindowMode("todo")}
        >
          <ListTodo />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="切换到番茄钟窗口"
          aria-label="番茄钟视图"
          onClick={() => setWindowMode("pomodoro")}
        >
          <Timer />
        </Button>
        <ThemeToggle />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-7 text-xs"
          title="新建任务（⌘N）"
          onClick={() => window.dispatchEvent(new Event("localtodo:new-task"))}
        >
          <CirclePlus /> 新任务
        </Button>
        <span className="mx-1 h-4 self-center border-l" />
        <Button
          variant="ghost"
          size="icon-sm"
          title="最小化"
          aria-label="最小化"
          onClick={() => Window.Minimise()}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="最大化或还原"
          aria-label="最大化或还原"
          onClick={() => Window.ToggleMaximise()}
        >
          <Square />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="关闭并退出"
          aria-label="关闭并退出"
          className="hover:bg-destructive hover:text-white"
          onClick={() => Window.Close()}
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
