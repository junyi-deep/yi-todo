import { Sidebar } from '../components/layout/Sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskWorkspace } from '../features/tasks/TaskWorkspace'
import { SearchPalette } from '../features/search/SearchPalette'
import { NotificationBridge } from '../features/reminders/NotificationBridge'

export function App() {
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-screen min-h-[600px] min-w-[900px] overflow-hidden">
        <div className="bg-background/80 fixed inset-x-0 top-0 z-50 h-10 border-b backdrop-blur [--wails-draggable:drag]" />
        <Sidebar />
        <TaskWorkspace />
        <SearchPalette />
        <NotificationBridge />
      </div>
    </TooltipProvider>
  )
}
