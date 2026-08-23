import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {
  DateClickArg,
  EventResizeDoneArg,
} from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import { taskAPI, type TaskFilterState } from "../tasks/api";

export function CalendarView({ onSelect, filters }: { onSelect: (id: string) => void; filters: TaskFilterState }) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState(() => ({
    from: new Date(
      new Date().getFullYear(),
      new Date().getMonth() - 1,
      1,
    ).toISOString(),
    to: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 2,
      1,
    ).toISOString(),
  }));
  const query = useQuery({
    queryKey: ["calendar", range, filters],
    queryFn: () => taskAPI.listRange(range.from, range.to, filters),
  });
  const update = useMutation({
    mutationFn: taskAPI.updateMetadata,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["calendar"] }),
  });
  const events: EventInput[] = (query.data ?? []).flatMap((task) => {
    const start = task.startAt ?? task.dueAt;
    if (!start) return [];
    return [{
      id: task.id,
      title: task.title,
      start,
      end: task.startAt && task.dueAt ? task.dueAt : undefined,
      allDay: false,
    }];
  });
  const schedule = (id: string, start: Date | null, end: Date | null) => {
    const task = query.data?.find((item) => item.id === id);
    if (!task) return;
    update.mutate({
      id,
      projectId: task.projectId,
      priority: task.priority,
      important: task.important,
      urgent: task.urgent,
      startAt: start?.toISOString() ?? null,
      dueAt: (end ?? start)?.toISOString() ?? null,
      progress: task.progress,
      estimatedMinutes: null,
    });
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background p-3">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        locale="zh-cn"
        editable
        selectable
        height="100%"
        slotMinTime="06:00:00"
        slotMaxTime="24:00:00"
        nowIndicator
        datesSet={(arg) =>
          setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })
        }
        events={events}
        eventClick={(arg: EventClickArg) => onSelect(arg.event.id)}
        eventDrop={(arg: EventDropArg) =>
          schedule(arg.event.id, arg.event.start, arg.event.end)
        }
        eventResize={(arg: EventResizeDoneArg) =>
          schedule(arg.event.id, arg.event.start, arg.event.end)
        }
        dateClick={async (arg: DateClickArg) => {
          const title = window.prompt("新任务");
          if (!title) return;
          const created = await taskAPI.create({ title, projectId: null });
          const due = new Date(arg.date.getTime() + 60 * 60 * 1000);
          await taskAPI.updateMetadata({
            id: created.id,
            projectId: null,
            priority: 0,
            important: false,
            urgent: false,
            startAt: arg.date.toISOString(),
            dueAt: due.toISOString(),
            progress: 0,
            estimatedMinutes: 25,
          });
          await queryClient.invalidateQueries({ queryKey: ["calendar"] });
        }}
      />
    </div>
  );
}
