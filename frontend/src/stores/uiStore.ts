import { create } from 'zustand'

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'all' | 'completed' | 'project'
export type WorkspaceMode = 'list' | 'matrix' | 'calendar' | 'gantt' | 'statistics'

type UIState = {
  activeView: TaskView
  workspaceMode: WorkspaceMode
  selectedProjectId: string | null
  selectedTaskId: string | null
  detailPanelOpen: boolean
  setActiveView: (view: TaskView, projectId?: string) => void
  setWorkspaceMode: (mode: WorkspaceMode) => void
  selectTask: (id: string) => void
  closeDetail: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'inbox',
  workspaceMode: 'list',
  selectedProjectId: null,
  selectedTaskId: null,
  detailPanelOpen: false,
  setActiveView: (activeView, selectedProjectId) => set({
    activeView,
    selectedProjectId: activeView === 'project' ? selectedProjectId ?? null : null,
    selectedTaskId: null,
    detailPanelOpen: false,
  }),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  selectTask: (selectedTaskId) => set({ selectedTaskId, detailPanelOpen: true }),
  closeDetail: () => set({ selectedTaskId: null, detailPanelOpen: false }),
}))
