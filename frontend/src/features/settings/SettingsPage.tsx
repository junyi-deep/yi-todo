import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { errorMessage, featureAPI } from "../tasks/api";
import { applyTheme, type AppTheme, useThemeSetting } from "./ThemeSetting";

const themes: Array<{ id: AppTheme; label: string }> = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const themeQuery = useThemeSetting();
  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: featureAPI.listBackups,
  });
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [exportAll, setExportAll] = useState(true);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportedPath, setExportedPath] = useState("");
  const [backupAction, setBackupAction] = useState<{
    kind: "restore" | "delete";
    name: string;
  } | null>(null);
  useEffect(() => {
    Promise.all([
      featureAPI.getSetting("pomodoro.focusMinutes"),
      featureAPI.getSetting("pomodoro.notifyOnComplete"),
    ]).then(([minutes, notify]) => {
      if (minutes) setFocusMinutes(Number(minutes) || 25);
      setNotifyOnComplete(notify !== "false");
    });
  }, []);
  const themeMutation = useMutation({
    mutationFn: async (theme: AppTheme) => {
      await featureAPI.setSetting("appearance.theme", theme);
      return theme;
    },
    onMutate: applyTheme,
    onSuccess: (theme) =>
      queryClient.setQueryData(["setting", "appearance.theme"], theme),
    onError: () => applyTheme(themeQuery.data ?? "system"),
  });
  const backupMutation = useMutation({
    mutationFn: featureAPI.createBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: featureAPI.deleteBackup,
    onSuccess: () => {
      setBackupAction(null);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: featureAPI.restoreBackup,
    onSuccess: () => {
      setBackupAction(null);
      queryClient.invalidateQueries();
    },
  });
  const focusMutation = useMutation({
    mutationFn: async () => {
      const minutes = Math.max(1, Math.min(240, Math.round(focusMinutes)));
      await featureAPI.setSetting("pomodoro.focusMinutes", String(minutes));
      await featureAPI.setSetting(
        "pomodoro.notifyOnComplete",
        String(notifyOnComplete),
      );
      return minutes;
    },
    onSuccess: (minutes) => {
      setFocusMinutes(minutes);
      queryClient.setQueryData(["setting", "pomodoro.focusMinutes"], minutes);
    },
  });
  const exportMutation = useMutation({
    mutationFn: async () => {
      const from = exportAll || !exportFrom ? null : new Date(`${exportFrom}T00:00:00`).toISOString();
      const toDate = exportAll || !exportTo ? null : new Date(`${exportTo}T00:00:00`);
      if (toDate) toDate.setDate(toDate.getDate() + 1);
      return featureAPI.exportTasks(exportAll, from, toDate?.toISOString() ?? null);
    },
    onSuccess: (path) => setExportedPath(path),
  });
  const error =
    backupsQuery.error ??
    themeMutation.error ??
    backupMutation.error ??
    deleteMutation.error ??
    restoreMutation.error ??
    focusMutation.error ??
    exportMutation.error;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-5">
        <h1 className="text-lg font-semibold">设置与数据</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <section className="settings-section">
            <div>
              <h2>外观</h2>
              <p>主题会保存在本地系统配置表中。</p>
            </div>
            <div className="flex rounded-lg bg-muted p-1">
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "h-7 rounded-md px-3 text-xs transition-colors",
                    (themeQuery.data ?? "system") === item.id
                      ? "bg-background font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => themeMutation.mutate(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
          <section className="settings-section">
            <div>
              <h2>专注</h2>
              <p>
                设置每次番茄钟的默认专注分钟数，以及完成后是否发送系统通知。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                专注分钟
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={focusMinutes}
                  onChange={(event) =>
                    setFocusMinutes(Number(event.target.value))
                  }
                  className="bg-background h-7 w-16 rounded-md border px-2 text-right"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={notifyOnComplete}
                  onChange={(event) =>
                    setNotifyOnComplete(event.target.checked)
                  }
                />
                完成后发送系统通知
              </label>
              <Button
                size="sm"
                disabled={focusMutation.isPending}
                onClick={() => focusMutation.mutate()}
              >
                {focusMutation.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </section>
          <section className="settings-section items-start">
            <div>
              <h2>导出 Excel</h2>
              <p>导出任务完整信息、提醒、依赖和番茄记录；附件文件不会写入工作簿。时间范围按任务创建时间筛选。</p>
            </div>
            <div className="flex max-w-md flex-wrap items-center justify-end gap-2">
              <Select value={exportAll ? "all" : "range"} onValueChange={(value) => setExportAll(value === "all")}><SelectTrigger className="text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部任务</SelectItem><SelectItem value="range">选择时间范围</SelectItem></SelectContent></Select>
              {!exportAll && (
                <>
                  <input aria-label="导出开始日期" type="date" className="h-8 rounded-md border bg-background px-2 text-xs" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
                  <span className="text-muted-foreground">至</span>
                  <input aria-label="导出结束日期" type="date" className="h-8 rounded-md border bg-background px-2 text-xs" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
                </>
              )}
              <Button size="sm" disabled={exportMutation.isPending || (!exportAll && (!exportFrom || !exportTo))} onClick={() => exportMutation.mutate()}>
                <FileSpreadsheet />{exportMutation.isPending ? "导出中…" : "选择位置并导出"}
              </Button>
              {exportedPath && <span className="w-full truncate text-right text-[10px] text-muted-foreground" title={exportedPath}>已导出：{exportedPath}</span>}
            </div>
          </section>
          <section className="settings-section items-start">
            <div>
              <h2>本地备份</h2>
              <p>默认仅保留最近 10 次备份，创建新备份时自动清理更早的文件。</p>
            </div>
            <Button
              size="sm"
              disabled={backupMutation.isPending}
              onClick={() => backupMutation.mutate()}
            >
              {backupMutation.isPending ? "备份中…" : "立即备份"}
            </Button>
          </section>
          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_120px_96px] border-b bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <span>备份文件</span>
              <span>创建时间</span>
              <span className="text-right">操作</span>
            </div>
            {backupsQuery.isPending && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                正在读取备份…
              </div>
            )}
            {!backupsQuery.isPending &&
              (backupsQuery.data ?? []).length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  暂无备份
                </div>
              )}
            {(backupsQuery.data ?? []).map((item) => (
              <div
                key={item.name}
                className="grid min-h-10 grid-cols-[1fr_120px_96px] items-center border-b px-3 text-xs last:border-b-0"
              >
                <span className="truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="text-muted-foreground">
                  {new Date(String(item.createdAt)).toLocaleString(undefined, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="恢复"
                    onClick={() =>
                      setBackupAction({ kind: "restore", name: item.name })
                    }
                  >
                    <RotateCcw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive"
                    title="删除"
                    onClick={() =>
                      setBackupAction({ kind: "delete", name: item.name })
                    }
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {errorMessage(error)}
            </p>
          )}
        </div>
      </div>
      <Dialog
        open={Boolean(backupAction)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending && !restoreMutation.isPending)
            setBackupAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {backupAction?.kind === "restore" ? "恢复此备份？" : "永久删除此备份？"}
            </DialogTitle>
            <DialogDescription className="break-all">
              {backupAction?.kind === "restore"
                ? `将恢复 ${backupAction.name}，当前数据会先自动创建安全备份。`
                : `${backupAction?.name ?? ""} 删除后无法恢复。`}
            </DialogDescription>
          </DialogHeader>
          {(deleteMutation.error || restoreMutation.error) && (
            <p role="alert" className="text-destructive text-xs">
              {errorMessage(deleteMutation.error ?? restoreMutation.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleteMutation.isPending || restoreMutation.isPending}
              onClick={() => setBackupAction(null)}
            >
              取消
            </Button>
            <Button
              variant={backupAction?.kind === "delete" ? "destructive" : "default"}
              disabled={deleteMutation.isPending || restoreMutation.isPending}
              onClick={() => {
                if (!backupAction) return;
                if (backupAction.kind === "restore")
                  restoreMutation.mutate(backupAction.name);
                else deleteMutation.mutate(backupAction.name);
              }}
            >
              {deleteMutation.isPending || restoreMutation.isPending
                ? "处理中…"
                : backupAction?.kind === "restore"
                  ? "确认恢复"
                  : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
