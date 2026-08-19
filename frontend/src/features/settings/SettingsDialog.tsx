import { useEffect, useState } from 'react'
import { Download, Settings, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { featureAPI } from '../tasks/api'

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState('')
  const [notice, setNotice] = useState('')
  const [backups, setBackups] = useState<Array<{ name: string; createdAt: unknown }>>([])
  useEffect(() => { const handler = () => setOpen(true); window.addEventListener('localtodo:open-settings', handler); return () => window.removeEventListener('localtodo:open-settings', handler) }, [])
  const backup = async () => { const item = await featureAPI.createBackup(); setNotice(`已备份：${item.name}`); setBackups(await featureAPI.listBackups()) }
  const exportData = async () => { const data = await featureAPI.exportData(); setPayload(data); setNotice('JSON 已生成，可复制保存') }
  const importData = async () => { await featureAPI.importData(payload); setNotice('导入完成，刷新视图后生效') }
  const setTheme = async (theme: 'light' | 'dark' | 'system') => {
    const dark = theme === 'dark' || theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', dark); localStorage.setItem('localtodo-theme', theme)
    await featureAPI.setSetting('appearance.theme', theme)
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" className="w-full justify-start"><Settings />设置与数据</Button></DialogTrigger>
    <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>设置与数据</DialogTitle><DialogDescription>设置与备份均保存在本机；导入采用事务并保留已有 ID。</DialogDescription></DialogHeader>
      <div className="space-y-2"><span className="text-muted-foreground text-xs">外观</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setTheme('system')}>跟随系统</Button><Button size="sm" variant="outline" onClick={() => setTheme('light')}>浅色</Button><Button size="sm" variant="outline" onClick={() => setTheme('dark')}>深色</Button></div></div>
      <div className="flex gap-2"><Button onClick={backup}>立即备份</Button><Button variant="outline" onClick={exportData}><Download />导出 JSON</Button><Button variant="outline" disabled={!payload.trim()} onClick={importData}><Upload />导入 JSON</Button></div>
      <div className="space-y-1"><Button size="sm" variant="ghost" onClick={async () => setBackups(await featureAPI.listBackups())}>查看备份</Button>{backups.map((item) => <div key={item.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"><span>{item.name}</span><Button size="xs" variant="outline" onClick={async () => { await featureAPI.restoreBackup(item.name); setNotice('备份已恢复，请刷新视图') }}>恢复</Button></div>)}</div>
      <Textarea rows={12} value={payload} onChange={(event) => setPayload(event.target.value)} placeholder="导出的 JSON 会显示在这里；也可粘贴 JSON 后导入。" />{notice && <p className="text-muted-foreground text-xs">{notice}</p>}
    </DialogContent>
  </Dialog>
}
