import { useEffect } from "react";
import { Events } from "@wailsio/runtime";

export function NotificationBridge() {
  useEffect(() => {
    const offReminder = Events.On("reminder:fired", (event) => {
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("yi-todo 提醒", { body: "一个任务提醒已到期" });
      window.dispatchEvent(
        new CustomEvent("localtodo:reminder", { detail: event.data }),
      );
    });
    return () => {
      offReminder();
    };
  }, []);
  return null;
}
