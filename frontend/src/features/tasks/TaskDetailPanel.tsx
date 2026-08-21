import {
  ClipboardEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellPlus,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flag,
  Folder,
  Paperclip,
  Plus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { zhCN } from "../../i18n/zh-CN";
import {
  errorMessage,
  featureAPI,
  taskAPI,
  type Attachment,
  type TaskListItem,
  type UpdateTaskMetadataInput,
} from "./api";
import { RichTextEditor } from "./RichTextEditor";
import { ScopeTreePicker } from "./ScopeTreePicker";
import { TaskStatus } from "../../../bindings/github.com/junyiwu/yi-todo/internal/domain/models.js";

type Props = {
  task: TaskListItem | undefined;
  pending: boolean;
  onClose: () => void;
  onSave: (id: string, title: string) => Promise<void>;
  onMetadata: (input: UpdateTaskMetadataInput) => Promise<void>;
  onToggle: (task: TaskListItem) => void;
  onDelete: (id: string) => void;
};

function dateInput(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function TaskDetailPanel({
  task,
  pending,
  onClose,
  onSave,
  onMetadata,
  onToggle,
  onDelete,
}: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.TaskStatusTodo);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [description, setDescription] = useState({
    format: "markdown" as const,
    source: "",
    plain: "",
  });
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [detailNotice, setDetailNotice] = useState("");
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [estimatedUnit, setEstimatedUnit] = useState<"minute" | "hour" | "day">(
    "minute",
  );
  const [repeatType, setRepeatType] = useState("none");
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [attachmentsOpen, setAttachmentsOpen] = useState(true);
  const [remindersOpen, setRemindersOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["task", task?.id],
    queryFn: () => taskAPI.detail(task!.id),
    enabled: Boolean(task?.id),
  });
  const subtasksQuery = useQuery({
    queryKey: ["subtasks", task?.id],
    queryFn: () => featureAPI.listSubtasks(task!.id),
    enabled: Boolean(task?.id),
  });
  const attachmentsQuery = useQuery({
    queryKey: ["attachments", task?.id],
    queryFn: () => featureAPI.listAttachments(task!.id),
    enabled: Boolean(task?.id),
  });
  const remindersQuery = useQuery({
    queryKey: ["reminders", task?.id],
    queryFn: () => featureAPI.listReminders(task!.id),
    enabled: Boolean(task?.id),
  });

  useEffect(() => {
    const fullTask = detailQuery.data?.task ?? task;
    if (!fullTask) return;
    setTitle(fullTask.title);
    setProjectId(fullTask.projectId);
    setPriority(fullTask.priority);
    setImportant(fullTask.important);
    setUrgent(fullTask.urgent);
    setStartAt(dateInput(fullTask.startAt));
    setDueAt(dateInput(fullTask.dueAt));
    setProgress(fullTask.progress);
    setStatus(fullTask.status);
    const estimated =
      "estimatedMinutes" in fullTask ? fullTask.estimatedMinutes : null;
    setEstimatedMinutes(estimated == null ? "" : String(estimated));
    if (detailQuery.data?.task)
      setDescription({
        format: "markdown",
        source: detailQuery.data.task.descriptionSource,
        plain: detailQuery.data.task.descriptionPlain,
      });
  }, [detailQuery.data, task]);

  if (!task) return null;

  const uploadFiles = async (files: File[]): Promise<Attachment[]> => {
    try {
      const items = [] as Attachment[];
      for (const file of files)
        items.push(await featureAPI.importAttachment(task.id, file));
      await attachmentsQuery.refetch();
      setDetailNotice("");
      return items;
    } catch (error) {
      setDetailNotice(errorMessage(error));
      return [];
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      if (trimmed !== task.title) await onSave(task.id, trimmed);
      await onMetadata({
        id: task.id,
        projectId,
        priority,
        important,
        urgent,
        startAt: dateValue(startAt),
        dueAt: dateValue(dueAt),
        progress,
        estimatedMinutes:
          estimatedMinutes === ""
            ? null
            : Math.round(
                Number(estimatedMinutes) *
                  (estimatedUnit === "minute"
                    ? 1
                    : estimatedUnit === "hour"
                      ? 60
                      : 1440),
              ),
      });
      if (status !== task.status) await taskAPI.setStatus(task.id, status);
      await featureAPI.updateDescription({ id: task.id, ...description });
      await queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      setDetailNotice("已保存");
    } catch (error) {
      setDetailNotice(errorMessage(error));
    }
  };

  const completed = task.status === "completed";
  return (
    <aside
      className="bg-background flex w-[380px] shrink-0 flex-col border-l"
      aria-label={zhCN.taskDetail}
      onPaste={(event: ClipboardEvent<HTMLElement>) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          void uploadFiles(files);
        }
      }}
      onDragOver={(event: DragEvent<HTMLElement>) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        const files = Array.from(event.dataTransfer.files);
        if (files.length) {
          event.preventDefault();
          void uploadFiles(files);
        }
      }}
    >
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <Button
          type="button"
          variant={completed ? "outline" : "default"}
          size="sm"
          className="h-8 px-3 font-semibold shadow-sm"
          disabled={pending}
          onClick={() => onToggle(task)}
        >
          <CheckCircle2 />
          {completed ? zhCN.reopen : "标记为完成"}
        </Button>
        <div className="ml-auto flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => onDelete(task.id)}
            aria-label={zhCN.delete}
          >
            <Trash2 />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={zhCN.close}
          >
            <X />
          </Button>
        </div>
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-4 pb-3 pt-4">
            <Textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.blur();
                }
              }}
              rows={1}
              maxLength={500}
              autoFocus
              className="max-h-[72px] min-h-6 resize-none overflow-y-auto border-0 p-0 text-lg font-semibold leading-6 shadow-none focus-visible:ring-0"
              aria-label={zhCN.title}
            />
          </div>
          <div className="border-y px-4 py-2">
            <div className="detail-property-row">
              <span className="detail-property-label">
                <Folder />
                清单
              </span>
              <ScopeTreePicker
                value={projectId ? `project:${projectId}` : "inbox"}
                allowCategory={false}
                className="flex-1"
                onChange={(value) =>
                  setProjectId(value === "inbox" ? null : value.slice("project:".length))
                }
              />
            </div>
            <div className="detail-property-row">
              <span className="detail-property-label">
                <CalendarDays />
                日期
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <Input
                  aria-label="开始日期"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="h-7 border-0 px-2 shadow-none"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  aria-label="截止日期"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  className="h-7 border-0 px-2 shadow-none"
                />
              </div>
            </div>
            <div className="detail-property-row">
              <span className="detail-property-label">
                <Flag />
                四象限
              </span>
              <Select
                value={String(priority)}
                onValueChange={(value) => {
                  const next = Number(value);
                  setPriority(next);
                  setImportant(next === 1 || next === 2);
                  setUrgent(next === 1 || next === 3);
                }}
              >
                <SelectTrigger className="h-7 min-w-0 flex-1 border-0 bg-transparent px-2 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "无",
                    "重要且紧急",
                    "重要不紧急",
                    "紧急不重要",
                    "不重要不紧急",
                  ].map((label, value) => (
                    <SelectItem key={label} value={String(value)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="detail-property-row">
              <span className="detail-property-label">
                <Clock3 />
                预计
              </span>
              <div className="flex flex-1">
                <Input
                  type="number"
                  min={0}
                  value={estimatedMinutes}
                  onChange={(event) => setEstimatedMinutes(event.target.value)}
                  className="h-7 flex-1 border-0 px-2 shadow-none"
                />
                <Select
                  value={estimatedUnit}
                  onValueChange={(value) =>
                    setEstimatedUnit(value as typeof estimatedUnit)
                  }
                >
                  <SelectTrigger className="h-7 w-20 border-0 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minute">分钟</SelectItem>
                    <SelectItem value="hour">小时</SelectItem>
                    <SelectItem value="day">天</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="detail-property-row">
              <span className="detail-property-label">
                <CheckCircle2 />
                状态
              </span>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
              >
                <SelectTrigger className="h-7 flex-1 border-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">待办</SelectItem>
                  <SelectItem value="in_progress">进行中</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="detail-property-row">
              <span className="detail-property-label">进度</span>
              <div className="flex flex-1 items-center gap-2 px-2">
                <Input
                  aria-label="进度"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(event) => setProgress(Number(event.target.value))}
                  className="h-5 flex-1 border-0 p-0 shadow-none"
                />
                <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                  {progress}%
                </span>
              </div>
            </div>
            <div className="pt-1">
              <button
                type="button"
                className="detail-section-title w-full px-0"
                onClick={() => setRemindersOpen(!remindersOpen)}
              >
                <span className="flex items-center gap-1.5">
                  <BellPlus className="size-3" />
                  提醒{" "}
                  <span className="text-muted-foreground font-normal">
                    {(remindersQuery.data ?? []).length}
                  </span>
                </span>
                {remindersOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              {remindersOpen && (
                <div className="space-y-1 pb-1">
                  {(remindersQuery.data ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded px-1 py-1 text-xs"
                    >
                      <span className="truncate">
                        {new Date(String(item.remindAt)).toLocaleString()} ·{" "}
                        {item.repeatType === "none"
                          ? "单次"
                          : item.repeatType === "daily"
                            ? "每天"
                            : item.repeatType === "weekly"
                              ? "每周"
                              : "每月"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto size-6"
                        onClick={async () => {
                          await featureAPI.deleteReminder(item.id);
                          await remindersQuery.refetch();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <Input
                      className="h-7 min-w-0 flex-1 border-0 shadow-none"
                      type="datetime-local"
                      value={remindAt}
                      onChange={(event) => setRemindAt(event.target.value)}
                    />
                    <Select value={repeatType} onValueChange={setRepeatType}>
                      <SelectTrigger className="h-7 w-20 border-0 shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">单次</SelectItem>
                        <SelectItem value="daily">每天</SelectItem>
                        <SelectItem value="weekly">每周</SelectItem>
                        <SelectItem value="monthly">每月</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!remindAt}
                      onClick={async () => {
                        const when = new Date(remindAt);
                        const repeatValue =
                          repeatType === "weekly"
                            ? when.getDay()
                            : repeatType === "monthly"
                              ? when.getDate()
                              : null;
                        await featureAPI.createReminder(
                          task.id,
                          when.toISOString(),
                          repeatType,
                          repeatValue,
                        );
                        setRemindAt("");
                        await remindersQuery.refetch();
                      }}
                    >
                      <BellPlus />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <button
                type="button"
                className="detail-section-title w-full"
                onClick={() => setDescriptionOpen(!descriptionOpen)}
              >
                <span>描述</span>
                {descriptionOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              {descriptionOpen && (
                <RichTextEditor
                  format="markdown"
                  source={description.source}
                  onChange={(format, source, plain) =>
                    setDescription({ format, source, plain })
                  }
                  attachments={attachmentsQuery.data ?? []}
                  onFiles={uploadFiles}
                  onOpenAttachment={async (id) => {
                    const item = (attachmentsQuery.data ?? []).find(
                      (x) => x.id === id,
                    );
                    if (item?.mimeType.startsWith("image/")) {
                      const content = await featureAPI.readAttachment(id);
                      setAttachmentPreview(
                        `data:${item.mimeType};base64,${content.dataBase64}`,
                      );
                    } else await featureAPI.openAttachment(id);
                  }}
                />
              )}
            </div>
            <Separator />
            <div>
              <div className="detail-section-title">
                <span>子任务</span>
                <span className="text-muted-foreground font-normal">
                  {
                    (subtasksQuery.data ?? []).filter(
                      (item) => item.status === "completed",
                    ).length
                  }
                  /{(subtasksQuery.data ?? []).length}
                </span>
              </div>
              {(subtasksQuery.data ?? []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs"
                  onClick={() => onToggle(item)}
                >
                  <Checkbox checked={item.status === "completed"} />
                  <span
                    className={
                      item.status === "completed"
                        ? "text-muted-foreground line-through"
                        : ""
                    }
                  >
                    {item.title}
                  </span>
                </button>
              ))}
              <div className="flex gap-1">
                <Input
                  value={subtaskTitle}
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  placeholder="添加子任务"
                  className="h-7 border-0 px-1.5 shadow-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!subtaskTitle.trim()}
                  onClick={async () => {
                    await taskAPI.create({
                      title: subtaskTitle.trim(),
                      projectId: task.projectId,
                      parentId: task.id,
                    });
                    setSubtaskTitle("");
                    await subtasksQuery.refetch();
                    await queryClient.invalidateQueries({
                      queryKey: ["tasks"],
                    });
                  }}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            <Separator />
            <div>
              <button
                type="button"
                className="detail-section-title w-full"
                onClick={() => setAttachmentsOpen(!attachmentsOpen)}
              >
                <span className="flex items-center gap-1.5">
                  <Paperclip className="size-3" />
                  附件{" "}
                  <span className="text-muted-foreground font-normal">
                    {(attachmentsQuery.data ?? []).length}
                  </span>
                </span>
                {attachmentsOpen ? <ChevronDown /> : <ChevronRight />}
              </button>
              {attachmentsOpen && (
                <div>
                  {(attachmentsQuery.data ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="hover:bg-accent flex h-7 items-center gap-1 rounded px-1.5 text-xs"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={async () => {
                          if (item.mimeType.startsWith("image/")) {
                            const content = await featureAPI.readAttachment(
                              item.id,
                            );
                            setPreviewZoom(1);
                            setAttachmentPreview(
                              `data:${item.mimeType};base64,${content.dataBase64}`,
                            );
                          } else await featureAPI.openAttachment(item.id);
                        }}
                      >
                        <Paperclip className="size-3 shrink-0" />
                        <span className="truncate">{item.originalName}</span>
                        <span className="text-muted-foreground ml-auto shrink-0">
                          {Math.ceil(item.byteSize / 1024)} KB
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        onClick={async () => {
                          await featureAPI.deleteAttachment(item.id);
                          await attachmentsQuery.refetch();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Input
                    className="mt-1 h-7 border-0 text-[11px] shadow-none"
                    type="file"
                    multiple
                    onChange={async (event) => {
                      await uploadFiles(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <footer className="flex h-11 shrink-0 items-center gap-2 border-t px-3">
          {detailNotice && (
            <span
              className="text-muted-foreground mr-auto self-center text-xs"
              role="status"
            >
              {detailNotice}
            </span>
          )}
          <span className="text-muted-foreground mr-auto text-[10px]">
            更改仅保存在本机
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={pending || detailQuery.isPending}
          >
            {zhCN.save}
          </Button>
        </footer>
      </form>
      {attachmentPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-8"
          onClick={() => setAttachmentPreview("")}
        >
          <div className="absolute right-5 top-5 flex gap-1">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                setPreviewZoom((value) => Math.max(0.25, value - 0.25));
              }}
            >
              <ZoomOut />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation();
                setPreviewZoom((value) => Math.min(4, value + 0.25));
              }}
            >
              <ZoomIn />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={() => setAttachmentPreview("")}
            >
              <X />
            </Button>
          </div>
          <img
            src={attachmentPreview}
            alt="附件预览"
            className="max-h-full max-w-full object-contain transition-transform"
            style={{ transform: `scale(${previewZoom})` }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </aside>
  );
}
