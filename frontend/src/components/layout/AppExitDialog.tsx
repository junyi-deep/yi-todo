import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const closeRequestedEvent = "app:close-requested";
const closeConfirmedEvent = "app:close-confirmed";

export function AppExitDialog() {
  const [open, setOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);

  useEffect(
    () => Events.On(closeRequestedEvent, () => setOpen(true)),
    [],
  );

  const confirmQuit = async () => {
    setQuitting(true);
    try {
      await Events.Emit(closeConfirmedEvent, null);
    } catch {
      setQuitting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!quitting) setOpen(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>退出 yi-todo？</AlertDialogTitle>
          <AlertDialogDescription>
            关闭窗口将退出应用，正在进行的专注计时也会停止显示。确定要退出吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={quitting}
            onClick={() => setOpen(false)}
          >
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={quitting}
            onClick={confirmQuit}
          >
            {quitting ? "正在退出…" : "确认退出"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
