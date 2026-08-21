import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { featureAPI } from "../tasks/api";
import { useUIStore } from "../../stores/uiStore";

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function FocusPage() {
  const today = localDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const query = useQuery({
    queryKey: ["focus-statistics", 120],
    queryFn: () => featureAPI.focusStatistics(120),
  });
  const selectedQuery = useQuery({
    queryKey: ["focus-statistics-day", selectedDate],
    queryFn: () => featureAPI.focusStatisticsForDate(selectedDate),
  });
  const calendar = useMemo(() => {
    const end = dateFromKey(today);
    const first = new Date(end);
    first.setDate(first.getDate() - 119);
    const start = new Date(first);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const final = new Date(end);
    final.setDate(final.getDate() + ((7 - ((final.getDay() + 6) % 7) - 1) % 7));
    const days: Array<{ key: string; inRange: boolean }> = [];
    for (const cursor = new Date(start); cursor <= final; cursor.setDate(cursor.getDate() + 1)) {
      const key = localDateKey(cursor);
      days.push({ key, inRange: cursor >= first && cursor <= end });
    }
    const weeks = Math.ceil(days.length / 7);
    const monthLabels = Array.from({ length: weeks }, (_, week) => {
      const date = dateFromKey(days[week * 7].key);
      const previous = week > 0 ? dateFromKey(days[(week - 1) * 7].key) : null;
      return !previous || date.getMonth() !== previous.getMonth() ? `${date.getMonth() + 1}月` : "";
    });
    return { days, weeks, monthLabels };
  }, [today]);
  const points = new Map((query.data?.days ?? []).map((item) => [item.date, item]));
  const selectedSummary = (selectedQuery.data?.days ?? []).reduce(
    (sum, item) => ({ minutes: sum.minutes + item.minutes, count: sum.count + item.count }),
    { minutes: 0, count: 0 },
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 items-center border-b px-5">
        <h1 className="text-lg font-semibold">专注统计</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <h2 className="mb-3 text-sm font-semibold">最近 120 天</h2>
        <div className="overflow-x-auto rounded-lg border bg-card p-4">
          <div className="min-w-[520px]">
            <div
              className="ml-10 grid h-5 gap-1 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${calendar.weeks}, minmax(15px, 1fr))` }}
              aria-hidden="true"
            >
              {calendar.monthLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="whitespace-nowrap">{label}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="grid w-8 shrink-0 grid-rows-7 gap-1 text-right text-[10px] leading-[15px] text-muted-foreground">
                {['周一', '', '周三', '', '周五', '', '周日'].map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
              <div
                className="grid flex-1 grid-flow-col grid-rows-7 gap-1"
                style={{ gridTemplateColumns: `repeat(${calendar.weeks}, minmax(15px, 1fr))` }}
              >
                {calendar.days.map(({ key, inRange }) => {
                  const item = points.get(key);
                  const level = Math.min(4, Math.ceil((item?.minutes ?? 0) / 25));
                  return (
                    <button
                      type="button"
                      key={key}
                      disabled={!inRange}
                      title={`${key} · ${item?.count ?? 0} 个番茄 · ${item?.minutes ?? 0} 分钟`}
                      onClick={() => setSelectedDate(key)}
                      className={cn(
                        "aspect-square min-h-[15px] rounded-[3px] transition-[box-shadow,transform] enabled:hover:scale-110",
                        !inRange && "invisible",
                        selectedDate === key && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      )}
                      style={{ backgroundColor: level ? `rgba(16, 185, 129, ${0.2 + level * 0.2})` : "var(--muted)" }}
                      aria-label={`选择 ${key}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <span>少</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <span key={level} className="size-3 rounded-[3px]" style={{ backgroundColor: level ? `rgba(16, 185, 129, ${0.2 + level * 0.2})` : "var(--muted)" }} />
              ))}
              <span>多</span>
            </div>
          </div>
        </div>

        <div className="mb-2 mt-6 flex items-end gap-3">
          <div>
            <h2 className="text-sm font-semibold">{selectedDate === today ? "今天" : selectedDate}的番茄钟</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{selectedSummary.count} 个番茄 · {selectedSummary.minutes} 分钟</p>
          </div>
          {selectedDate !== today && (
            <Button className="ml-auto" variant="ghost" size="xs" onClick={() => setSelectedDate(today)}>返回今天</Button>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border">
          {selectedQuery.isPending ? (
            <div className="p-6 text-center text-xs text-muted-foreground">正在读取…</div>
          ) : (selectedQuery.data?.tasks ?? []).length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">当天还没有完成番茄钟</div>
          ) : (
            (selectedQuery.data?.tasks ?? []).map((item) => (
              <div key={item.taskId ?? item.title} className="flex h-9 items-center border-b px-3 text-xs last:border-0">
                <span className="truncate">{item.title}</span>
                <span className="ml-auto text-muted-foreground">🍅 {item.pomodoroCount} · {item.minutes} 分钟</span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

export function PomodoroMode() {
  const client = useQueryClient();
  const selectedTaskId = useUIStore((state) => state.selectedTaskId);
  const focusSetting = useQuery({
    queryKey: ["setting", "pomodoro.focusMinutes"],
    queryFn: async () => Number(await featureAPI.getSetting("pomodoro.focusMinutes")) || 25,
  });
  const active = useQuery({ queryKey: ["pomodoro"], queryFn: featureAPI.activePomodoro, refetchInterval: 1000 });
  const session = active.data;
  const plannedSeconds = (focusSetting.data ?? 25) * 60;
  const remaining = session ? Math.max(0, session.plannedSeconds - session.elapsedSeconds) : plannedSeconds;
  const start = useMutation({
    mutationFn: () => featureAPI.startPomodoro(selectedTaskId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["pomodoro"] }),
  });
  return (
    <main className="grid min-h-0 flex-1 overflow-hidden place-items-center px-4 py-3">
      <div className="text-center">
        <div className="text-xs text-muted-foreground">{session ? "正在专注" : "准备专注"}</div>
        <div className="my-3 font-mono text-5xl font-semibold tabular-nums">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
        </div>
        {!session ? (
          <Button onClick={() => start.mutate()}>开始专注</Button>
        ) : session.state === "running" ? (
          <Button onClick={() => featureAPI.pausePomodoro().then(() => active.refetch())}>暂停</Button>
        ) : (
          <Button onClick={() => featureAPI.resumePomodoro().then(() => active.refetch())}>继续</Button>
        )}
      </div>
    </main>
  );
}
