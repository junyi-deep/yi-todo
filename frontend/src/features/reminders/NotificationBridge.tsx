import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'

export function NotificationBridge() {
  useEffect(() => {
    const offReminder = Events.On('reminder:fired', (event) => { if ('Notification' in window && Notification.permission === 'granted') new Notification('LocalTodo 提醒', { body: '一个任务提醒已到期' }); window.dispatchEvent(new CustomEvent('localtodo:reminder', { detail: event.data })) })
    const offPomodoro = Events.On('pomodoro:completed', () => { if ('Notification' in window && Notification.permission === 'granted') new Notification('专注完成', { body: '休息一下，然后开始下一轮。' }) })
    return () => { offReminder(); offPomodoro() }
  }, [])
  return null
}
