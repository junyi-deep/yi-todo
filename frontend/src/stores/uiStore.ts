import { create } from "zustand";

const DEFAULT_SIDEBAR_WIDTH = 224;

function initialSidebarWidth() {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  const stored = window.localStorage.getItem("yi-todo.sidebar-width");
  if (stored === null) return DEFAULT_SIDEBAR_WIDTH;
  const saved = Number(stored);
  return Number.isFinite(saved) ? Math.min(420, Math.max(200, saved)) : DEFAULT_SIDEBAR_WIDTH;
}

export type TaskView =
  | "inbox"
  | "today"
  | "upcoming"
  | "all"
  | "completed"
  | "project"
  | "category";
export type WorkspaceMode =
  | "list"
  | "matrix"
  | "calendar"
  | "gantt"
  | "table"
  | "statistics";

type UIState = {
  workspacePage: "tasks" | "settings" | "focus";
  windowMode: "normal" | "todo" | "pomodoro";
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  activeView: TaskView;
  workspaceMode: WorkspaceMode;
  selectedProjectId: string | null;
  selectedCategoryId: string | null;
  selectedTaskId: string | null;
  detailPanelOpen: boolean;
  setActiveView: (view: TaskView, scopeId?: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  selectTask: (id: string) => void;
  closeDetail: () => void;
  openSettings: () => void;
  openFocus: () => void;
  setWindowMode: (mode: "normal" | "todo" | "pomodoro") => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
};

export const useUIStore = create<UIState>((set) => ({
  activeView: "inbox",
  workspacePage: "tasks",
  windowMode: "normal",
  sidebarCollapsed: false,
  sidebarWidth: initialSidebarWidth(),
  workspaceMode: "list",
  selectedProjectId: null,
  selectedCategoryId: null,
  selectedTaskId: null,
  detailPanelOpen: false,
  setActiveView: (activeView, scopeId) =>
    set({
      workspacePage: "tasks",
      activeView,
      selectedProjectId:
        activeView === "project" ? (scopeId ?? null) : null,
      selectedCategoryId:
        activeView === "category" ? (scopeId ?? null) : null,
      selectedTaskId: null,
      detailPanelOpen: false,
    }),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  selectTask: (selectedTaskId) =>
    set({ selectedTaskId, detailPanelOpen: true }),
  closeDetail: () => set({ selectedTaskId: null, detailPanelOpen: false }),
  openSettings: () =>
    set({
      workspacePage: "settings",
      selectedTaskId: null,
      detailPanelOpen: false,
    }),
  openFocus: () =>
    set({
      workspacePage: "focus",
      selectedTaskId: null,
      detailPanelOpen: false,
    }),
  setWindowMode: (windowMode) => set({ windowMode }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarWidth: (width) => {
    const sidebarWidth = Math.min(420, Math.max(200, Math.round(width)));
    window.localStorage.setItem("yi-todo.sidebar-width", String(sidebarWidth));
    set({ sidebarWidth });
  },
}));
