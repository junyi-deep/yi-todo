import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Folder, List, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { projectAPI, type Category, type Project } from "./api";

type Row = { kind: "category" | "project"; id: string; name: string; depth: number };

function treeRows(categories: Category[], projects: Project[]): Row[] {
  const rows: Row[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const category of categories.filter((item) => item.parentId === parentId)) {
      rows.push({ kind: "category", id: category.id, name: category.name, depth });
      for (const project of projects.filter((item) => item.categoryId === category.id))
        rows.push({ kind: "project", id: project.id, name: project.name, depth: depth + 1 });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export function ScopeTreePicker({ value, onChange, allowCategory = false, allowInbox = true, allowTaskViews = false, className }: {
  value: string;
  onChange: (value: string) => void;
  allowCategory?: boolean;
  allowInbox?: boolean;
  allowTaskViews?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const categories = useQuery({ queryKey: ["categories"], queryFn: projectAPI.listCategories });
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectAPI.list });
  const rows = useMemo(() => treeRows(categories.data ?? [], projects.data ?? []), [categories.data, projects.data]);
  const selected = value === "inbox" ? "收集箱" : ({ today: "今天", upcoming: "即将到来", all: "全部任务", completed: "已完成" } as Record<string, string>)[value] ?? rows.find((row) => `${row.kind}:${row.id}` === value)?.name ?? "选择分类或清单";
  const filtered = rows.filter((row) => (!search.trim() || row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && (allowCategory || row.kind === "project"));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="ghost" className={cn("h-7 min-w-0 justify-between px-2 font-normal", className)}>{selected}<ChevronDown className="ml-auto size-3" /></Button></DialogTrigger>
      <DialogContent className="max-w-sm p-3">
        <DialogHeader><DialogTitle>选择分类或清单</DialogTitle></DialogHeader>
        <div className="relative mt-2"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索分类或清单" className="pl-8" /></div>
        <div className="max-h-80 overflow-auto py-1">
          {allowInbox && <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent" onClick={() => { onChange("inbox"); setOpen(false); }}><Folder className="size-3.5" />收集箱{value === "inbox" && <Check className="ml-auto size-3.5" />}</button>}
          {allowTaskViews && [["today", "今天"], ["upcoming", "即将到来"], ["all", "全部任务"], ["completed", "已完成"]].map(([id, label]) => <button type="button" key={id} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent" onClick={() => { onChange(id); setOpen(false); }}><List className="size-3.5" />{label}{value === id && <Check className="ml-auto size-3.5" />}</button>)}
          {filtered.map((row) => {
            const rowValue = `${row.kind}:${row.id}`;
            const Icon = row.kind === "category" ? Folder : List;
            return <button type="button" key={rowValue} className="flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-xs hover:bg-accent" style={{ paddingLeft: 8 + row.depth * 16 }} onClick={() => { onChange(rowValue); setOpen(false); }}><Icon className="size-3.5 shrink-0" /><span className="truncate">{row.name}</span>{value === rowValue && <Check className="ml-auto size-3.5" />}</button>;
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
