import { useQuery } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'

import { Card } from '@/components/ui/card'
import { featureAPI } from '../tasks/api'

export function StatisticsView() {
  const query = useQuery({ queryKey: ['statistics', 30], queryFn: () => featureAPI.statistics(30) })
  if (query.isPending) return <div className="grid flex-1 place-items-center">加载统计…</div>
  if (!query.data) return <div className="grid flex-1 place-items-center">统计不可用</div>
  const { overview } = query.data
  const completionTrend = query.data.completionTrend ?? []
  const projects = query.data.projects ?? []
  return <div className="min-h-0 flex-1 overflow-auto p-5">
    <div className="grid grid-cols-5 gap-3">{[
      ['今日完成', overview.todayCompleted], ['本周完成', overview.weekCompleted], ['完成率', `${overview.completionRate.toFixed(0)}%`], ['专注分钟', overview.focusMinutes], ['已逾期', overview.overdueCount],
    ].map(([label, value]) => <Card key={label} className="gap-1 p-4"><span className="text-muted-foreground text-xs">{label}</span><strong className="text-2xl">{value}</strong></Card>)}</div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Card className="p-3"><ReactECharts style={{ height: 320 }} option={{ tooltip: {}, xAxis: { type: 'category', data: completionTrend.map((item) => item.date) }, yAxis: { type: 'value' }, series: [{ type: 'line', smooth: true, data: completionTrend.map((item) => item.value) }] }} /></Card><Card className="p-3"><ReactECharts style={{ height: 320 }} option={{ tooltip: {}, series: [{ type: 'pie', radius: ['35%', '70%'], data: projects }] }} /></Card></div>
  </div>
}
