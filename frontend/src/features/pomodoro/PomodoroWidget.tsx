import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { featureAPI } from '../tasks/api'
import { useUIStore } from '../../stores/uiStore'

export function PomodoroWidget() {
  const taskId = useUIStore((state) => state.selectedTaskId); const client = useQueryClient()
  const active = useQuery({ queryKey: ['pomodoro'], queryFn: featureAPI.activePomodoro, refetchInterval: 1000 })
  const start = useMutation({ mutationFn: () => featureAPI.startPomodoro(taskId, 25 * 60), onSuccess: () => client.invalidateQueries({ queryKey: ['pomodoro'] }) })
  const pause = useMutation({ mutationFn: featureAPI.pausePomodoro, onSuccess: () => client.invalidateQueries({ queryKey: ['pomodoro'] }) })
  const resume = useMutation({ mutationFn: featureAPI.resumePomodoro, onSuccess: () => client.invalidateQueries({ queryKey: ['pomodoro'] }) })
  const session = active.data; const remaining = session ? Math.max(0, session.plannedSeconds - session.elapsedSeconds) : 25 * 60
  return <div className="bg-card mb-3 rounded-lg border p-3"><div className="flex items-center justify-between"><div><div className="text-xs font-medium">专注计时</div><div className="mt-1 font-mono text-xl tabular-nums">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</div></div>{session?.state === 'running' ? <Button size="icon-sm" variant="outline" onClick={() => pause.mutate()}><Pause /></Button> : session?.state === 'paused' ? <Button size="icon-sm" onClick={() => resume.mutate()}><Play /></Button> : <Button size="icon-sm" onClick={() => start.mutate()}><Play /></Button>}</div>{session && <div className="mt-2 flex"><Button size="xs" variant="ghost" className="flex-1" onClick={() => featureAPI.stopPomodoro(false).then(() => client.invalidateQueries({ queryKey: ['pomodoro'] }))}>取消</Button><Button size="xs" variant="ghost" className="flex-1" onClick={() => featureAPI.stopPomodoro(true).then(() => client.invalidateQueries({ queryKey: ['pomodoro'] }))}>完成</Button></div>}</div>
}
