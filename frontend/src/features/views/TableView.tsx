import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskView } from "../../stores/uiStore";
import {
  errorMessage,
  taskAPI,
  type TaskFilterState,
  type TaskListItem,
} from "../tasks/api";

const column = createColumnHelper<TaskListItem>();
const emptyRows: TaskListItem[] = [];

function localTime(value: unknown): string {
  return value
    ? new Date(String(value)).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

type Props = {
  view: TaskView;
  projectId: string | null;
  categoryId: string | null;
  filters: TaskFilterState;
  onSort: (sort: TaskFilterState["sort"]) => void;
  onSelect: (id: string) => void;
};

export function TableView({ view, projectId, categoryId, filters, onSort, onSelect }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPage, setJumpPage] = useState("1");
  useEffect(() => setPage(0), [view, projectId, categoryId, filters, pageSize]);
  const countQuery = useQuery({
    queryKey: ["task-table-count", view, projectId, categoryId, filters],
    queryFn: () => taskAPI.countFiltered({ view, projectId, categoryId, filters }),
  });
  const total = countQuery.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);
  useEffect(() => setJumpPage(String(page + 1)), [page]);
  const query = useQuery({
    queryKey: ["task-table", view, projectId, categoryId, filters, pageSize, page],
    queryFn: () =>
      taskAPI.listFiltered({
        view,
        projectId,
        categoryId,
        filters,
        limit: pageSize,
        offset: page * pageSize,
      }),
    placeholderData: (previousData) => previousData,
  });
  const allRows = query.data ?? emptyRows;
  const rows = useMemo(() => allRows.slice(0, pageSize), [allRows, pageSize]);
  const sortableHeader = (label: string, sort: TaskFilterState["sort"]) => (
    <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort(sort)}>
      {label}<ArrowDownUp className="size-3" />
    </button>
  );
  const columns = useMemo(
    () => [
      column.accessor("title", {
        header: () => sortableHeader("任务", "title"),
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      column.accessor("status", { header: "状态", cell: (info) => {
        const value = String(info.getValue());
        return value === "todo" ? "待办" : value === "in_progress" ? "进行中" : value === "completed" ? "已完成" : "已取消";
      } }),
      column.display({ id: "quadrant", header: "四象限", cell: ({ row }) => row.original.important ? (row.original.urgent ? "重要且紧急" : "重要不紧急") : row.original.urgent ? "紧急不重要" : "不重要不紧急" }),
      column.accessor("progress", { header: "进度", cell: (info) => `${info.getValue()}%` }),
      column.accessor("startAt", { header: () => sortableHeader("开始", "start"), cell: (info) => localTime(info.getValue()) }),
      column.accessor("dueAt", { header: () => sortableHeader("结束", "due"), cell: (info) => localTime(info.getValue()) }),
      column.accessor("estimatedMinutes", { header: "预计", cell: (info) => info.getValue() == null ? "—" : `${info.getValue()} 分钟` }),
      column.accessor("createdAt", { header: () => sortableHeader("创建", "created"), cell: (info) => localTime(info.getValue()) }),
    ],
    [onSort],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  if (query.isError)
    return <div className="grid flex-1 place-items-center text-sm text-destructive">{errorMessage(query.error)}</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] table-fixed text-xs">
          <thead className="sticky top-0 z-10 bg-muted/90 text-left text-[11px] text-muted-foreground backdrop-blur">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="h-9 border-b">
                {group.headers.map((header) => <th key={header.id} className="px-3 font-medium first:w-[28%]">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} tabIndex={0} className="h-10 border-b hover:bg-accent/60 focus:bg-accent" onClick={() => onSelect(row.original.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(row.original.id); }}>
                {row.getVisibleCells().map((cell) => <td key={cell.id} className="truncate px-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {query.isPending && <div className="p-8 text-center text-xs text-muted-foreground">正在读取任务…</div>}
        {!query.isPending && rows.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">没有符合条件的任务</div>}
      </div>
      <footer className="flex h-10 shrink-0 items-center justify-end gap-2 border-t px-3 text-xs text-muted-foreground">
        <span>共 {total} 条 · 第 {page + 1}/{totalPages} 页</span>
        <div className="flex items-center gap-1">每页
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger size="sm" className="w-20"><SelectValue /></SelectTrigger><SelectContent>{[25, 50, 100, 200].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select>
        </div>
        <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); const target = Math.min(totalPages, Math.max(1, Number(jumpPage) || 1)); setPage(target - 1); }}>
          <span>跳至</span>
          <Input type="number" min={1} max={totalPages} value={jumpPage} onChange={(event) => setJumpPage(event.target.value)} className="h-7 w-16 px-2 text-center text-xs shadow-none focus-visible:ring-0" aria-label="跳转页码" />
          <Button type="submit" variant="outline" size="xs">跳转</Button>
        </form>
        <Button variant="outline" size="icon-xs" aria-label="上一页" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft /></Button>
        <Button variant="outline" size="icon-xs" aria-label="下一页" disabled={page + 1 >= totalPages || query.isFetching} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}><ChevronRight /></Button>
      </footer>
    </div>
  );
}
