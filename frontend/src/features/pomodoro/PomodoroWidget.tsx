import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Check, Pause, Play, Square } from "lucide-react";
import { featureAPI } from "../tasks/api";
import { useUIStore } from "../../stores/uiStore";

export function PomodoroWidget() {
  const taskId = useUIStore((state) => state.selectedTaskId);
  const client = useQueryClient();
  const active = useQuery({
    queryKey: ["pomodoro"],
    queryFn: featureAPI.activePomodoro,
    refetchInterval: 1000,
  });
  const focusSetting = useQuery({
    queryKey: ["setting", "pomodoro.focusMinutes"],
    queryFn: async () =>
      Number(await featureAPI.getSetting("pomodoro.focusMinutes")) || 25,
  });
  const start = useMutation({
    mutationFn: () => featureAPI.startPomodoro(taskId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["pomodoro"] }),
  });
  const pause = useMutation({
    mutationFn: featureAPI.pausePomodoro,
    onSuccess: () => client.invalidateQueries({ queryKey: ["pomodoro"] }),
  });
  const resume = useMutation({
    mutationFn: featureAPI.resumePomodoro,
    onSuccess: () => client.invalidateQueries({ queryKey: ["pomodoro"] }),
  });
  const session = active.data;
  const remaining = session
    ? Math.max(0, session.plannedSeconds - session.elapsedSeconds)
    : (focusSetting.data ?? 25) * 60;
  return (
    <div className="mb-1 rounded-lg border border-sidebar-border/80 bg-sidebar-accent/25 p-1.5">
      <div className="flex h-8 items-center gap-2 rounded-md px-1">
        <span className="text-[13px]">专注</span>
        <span className="ml-auto font-mono text-xs tabular-nums">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:
          {String(remaining % 60).padStart(2, "0")}
        </span>
        {session?.state === "running" ? (
          <Button size="xs" variant="outline" className="h-6" onClick={() => pause.mutate()}>
            <Pause />暂停
          </Button>
        ) : session?.state === "paused" ? (
          <Button size="xs" variant="outline" className="h-6" onClick={() => resume.mutate()}>
            <Play />继续
          </Button>
        ) : (
          <Button size="xs" variant="outline" className="h-6" onClick={() => start.mutate()}>
            <Play />开始
          </Button>
        )}
      </div>
      {session && (
        <div className="mt-1 flex gap-1">
          <Button
            size="xs"
            variant="outline"
            className="h-6 flex-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() =>
              featureAPI
                .stopPomodoro(false)
                .then(() =>
                  client.invalidateQueries({ queryKey: ["pomodoro"] }),
                )
            }
          >
            <Square />取消
          </Button>
          <Button
            size="xs"
            variant="secondary"
            className="h-6 flex-1 border border-border bg-foreground text-background hover:bg-foreground/85"
            onClick={() =>
              featureAPI
                .stopPomodoro(true)
                .then(() =>
                  client.invalidateQueries({ queryKey: ["pomodoro"] }),
                )
            }
          >
            <Check />完成
          </Button>
        </div>
      )}
    </div>
  );
}
