import { FormEvent, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, CalendarDays, ChartNoAxesCombined, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Folder, FolderInput, FolderPlus, Inbox,
  List, ListTodo, Pencil, Plus, Search, Settings, Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { errorMessage, projectAPI, type Category, type Project } from "../../features/tasks/api";
import { zhCN } from "../../i18n/zh-CN";
import { useUIStore, type TaskView } from "../../stores/uiStore";
import { PomodoroWidget } from "../../features/pomodoro/PomodoroWidget";
import { sidebarMarkURL } from "../../assets/sidebarMark";
import { usePersistentCategoryExpansion } from "../../hooks/usePersistentCategoryExpansion";

const views: Array<{ id: TaskView; label: string; icon: typeof Inbox }> = [
  { id: "inbox", label: zhCN.inbox, icon: Inbox },
  { id: "today", label: "今天", icon: CalendarDays },
  { id: "upcoming", label: "即将到来", icon: CalendarClock },
  { id: "all", label: zhCN.allTasks, icon: ListTodo },
  { id: "completed", label: "已完成", icon: CheckCircle2 },
];

type CreateTarget = { kind: "category"; parentId: string | null } | { kind: "project"; categoryId: string };
type EditTarget =
  | { kind: "category"; mode: "rename" | "move"; item: Category }
  | { kind: "project"; mode: "rename" | "move"; item: Project };
type NavigationDrag = { kind: "category" | "project"; id: string };
type DropPosition = "before" | "inside" | "after";
type NavigationDrop = NavigationDrag & { position: DropPosition };

export function Sidebar() {
  const activeView = useUIStore((state) => state.activeView);
  const selectedProjectId = useUIStore((state) => state.selectedProjectId);
  const selectedCategoryId = useUIStore((state) => state.selectedCategoryId);
  const workspacePage = useUIStore((state) => state.workspacePage);
  const setActiveView = useUIStore((state) => state.setActiveView);
  const openSettings = useUIStore((state) => state.openSettings);
  const openFocus = useUIStore((state) => state.openFocus);
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const client = useQueryClient();
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [search, setSearch] = useState("");
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [name, setName] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<Category | null>(null);
  const [dragged, setDragged] = useState<NavigationDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<NavigationDrop | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [dragError, setDragError] = useState("");
  const categories = useQuery({ queryKey: ["categories"], queryFn: projectAPI.listCategories });
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectAPI.list });
  const { expanded, toggleCategory, expandCategory } = usePersistentCategoryExpansion(
    categories.data ?? [],
    !categories.isPending,
  );

  const refreshNavigation = () => {
    client.invalidateQueries({ queryKey: ["categories"] });
    client.invalidateQueries({ queryKey: ["projects"] });
  };
  const refreshTaskViews = () => {
    client.invalidateQueries({ queryKey: ["tasks"] });
    client.invalidateQueries({ queryKey: ["task-count"] });
    client.invalidateQueries({ queryKey: ["task-table"] });
    client.invalidateQueries({ queryKey: ["task-table-count"] });
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!createTarget) throw new Error("缺少创建目标");
      return createTarget.kind === "category"
        ? projectAPI.createCategory(name.trim(), createTarget.parentId)
        : projectAPI.create(name.trim(), "#64748b", createTarget.categoryId);
    },
    onSuccess: () => {
      refreshNavigation();
      refreshTaskViews();
      if (createTarget?.kind === "category" && createTarget.parentId)
        expandCategory(createTarget.parentId);
      setCreateTarget(null);
      setName("");
    },
  });
  const update = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("缺少编辑目标");
      if (editTarget.kind === "category") {
        const parentId = editTarget.mode === "move" ? (destinationId === "__root__" ? null : destinationId) : editTarget.item.parentId;
        return projectAPI.updateCategory(editTarget.item.id, editTarget.mode === "rename" ? name.trim() : editTarget.item.name, parentId);
      }
      const categoryId = editTarget.mode === "move" ? destinationId : editTarget.item.categoryId;
      return projectAPI.update(editTarget.item.id, editTarget.mode === "rename" ? name.trim() : editTarget.item.name, categoryId);
    },
    onSuccess: () => {
      refreshNavigation();
      refreshTaskViews();
      if (editTarget?.mode === "move" && destinationId !== "__root__")
        expandCategory(destinationId);
      setEditTarget(null);
      setName("");
      setDestinationId("");
    },
  });
  const deleteProject = useMutation({
    mutationFn: projectAPI.delete,
    onSuccess: (_value, id) => {
      refreshNavigation();
      refreshTaskViews();
      if (selectedProjectId === id) setActiveView("inbox");
      setDeleteProjectTarget(null);
    },
  });
  const deleteCategory = useMutation({
    mutationFn: projectAPI.deleteCategory,
    onSuccess: (_value, id) => {
      const removedCategories = descendantIds(id);
      const removedProjects = new Set((projects.data ?? []).filter((project) => removedCategories.has(project.categoryId)).map((project) => project.id));
      refreshNavigation();
      refreshTaskViews();
      if ((selectedCategoryId && removedCategories.has(selectedCategoryId)) || (selectedProjectId && removedProjects.has(selectedProjectId)))
        setActiveView("inbox");
      setDeleteCategoryTarget(null);
    },
  });

  const childCategories = (parentId: string | null) => (categories.data ?? []).filter((item) => item.parentId === parentId);
  const descendantIds = (id: string) => {
    const result = new Set<string>([id]);
    const visit = (parentId: string) => childCategories(parentId).forEach((child) => { result.add(child.id); visit(child.id); });
    visit(id);
    return result;
  };
  const projectsInCategory = (categoryId: string) =>
    (projects.data ?? []).filter((project) => project.categoryId === categoryId);
  const insertAtTarget = (ids: string[], movedID: string, targetID: string | null, position: DropPosition) => {
    const ordered = ids.filter((id) => id !== movedID);
    if (!targetID || position === "inside") return [...ordered, movedID];
    const targetIndex = ordered.indexOf(targetID);
    if (targetIndex < 0) return [...ordered, movedID];
    ordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, movedID);
    return ordered;
  };
  const reorderNavigation = useMutation({
    mutationFn: async ({ item, target }: { item: NavigationDrag; target: NavigationDrop | null }) => {
      if (item.kind === "category") {
        if (target?.kind === "project") throw new Error("分类不能移动到清单中");
        const targetCategory = target ? (categories.data ?? []).find((category) => category.id === target.id) : undefined;
        const parentId = targetCategory && target?.position === "inside" ? targetCategory.id : (targetCategory?.parentId ?? null);
        if (parentId && descendantIds(item.id).has(parentId)) throw new Error("分类不能移动到自身或子分类中");
        const siblings = childCategories(parentId).map((category) => category.id);
        const orderedIds = insertAtTarget(siblings, item.id, targetCategory?.id ?? null, target?.position ?? "inside");
        await projectAPI.reorderCategory(item.id, parentId, orderedIds);
        return parentId;
      }
      let categoryId: string;
      let targetProject: Project | undefined;
      if (target?.kind === "category") {
        categoryId = target.id;
      } else if (target?.kind === "project") {
        targetProject = (projects.data ?? []).find((project) => project.id === target.id);
        if (!targetProject) throw new Error("目标清单不存在");
        categoryId = targetProject.categoryId;
      } else {
        throw new Error("清单必须归属分类");
      }
      const siblings = projectsInCategory(categoryId).map((project) => project.id);
      const orderedIds = insertAtTarget(siblings, item.id, targetProject?.id ?? null, target?.position ?? "inside");
      await projectAPI.reorderProject(item.id, categoryId, orderedIds);
      return categoryId;
    },
    onSuccess: (destinationId) => {
      refreshNavigation();
      refreshTaskViews();
      if (destinationId) expandCategory(destinationId);
      setDragError("");
    },
    onError: (error) => setDragError(errorMessage(error)),
    onSettled: () => {
      setDragged(null);
      setDropTarget(null);
      setRootDropActive(false);
    },
  });
  const beginDrag = (event: DragEvent<HTMLElement>, item: NavigationDrag) => {
    if (normalizedSearch || reorderNavigation.isPending) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${item.kind}:${item.id}`);
    setDragged(item);
    setRootDropActive(false);
    setDragError("");
  };
  const categoryDropPosition = (event: DragEvent<HTMLElement>): DropPosition => {
    if (dragged?.kind === "project") return "inside";
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
  };
  const showDropTarget = (event: DragEvent<HTMLElement>, target: NavigationDrop) => {
    if (!dragged || dragged.id === target.id || (dragged.kind === "category" && target.kind === "project")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setRootDropActive(false);
    setDropTarget(target);
  };
  const finishDrop = (event: DragEvent<HTMLElement>, target: NavigationDrop | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragged) reorderNavigation.mutate({ item: dragged, target });
  };
  const dropIndicator = (kind: NavigationDrag["kind"], id: string) => {
    if (dropTarget?.kind !== kind || dropTarget.id !== id) return "";
    if (dropTarget.position === "before") return "border-t-2 border-t-primary";
    if (dropTarget.position === "after") return "border-b-2 border-b-primary";
    return "bg-sidebar-accent ring-1 ring-inset ring-primary/40";
  };
  const flattenedCategories = useMemo(() => {
    const all = categories.data ?? [];
    const output: Array<{ item: Category; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => all.filter((item) => item.parentId === parentId).forEach((item) => { output.push({ item, depth }); visit(item.id, depth + 1); });
    visit(null, 0);
    return output;
  }, [categories.data]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const categoryMatches = useMemo(() => {
    if (!normalizedSearch) return null;
    const matches = new Set<string>();
    const byId = new Map((categories.data ?? []).map((item) => [item.id, item]));
    for (const category of categories.data ?? []) {
      const own = category.name.toLocaleLowerCase().includes(normalizedSearch);
      const projectMatch = (projects.data ?? []).some((project) => project.categoryId === category.id && project.name.toLocaleLowerCase().includes(normalizedSearch));
      if (!own && !projectMatch) continue;
      let current: Category | undefined = category;
      while (current) { matches.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; }
    }
    return matches;
  }, [categories.data, normalizedSearch, projects.data]);

  const beginEdit = (target: EditTarget) => {
    setEditTarget(target);
    setName(target.item.name);
    setDestinationId(target.kind === "category" ? (target.item.parentId ?? "__root__") : target.item.categoryId);
  };

  const renderProject = (project: Project, depth: number) => (
    <ContextMenu key={project.id}>
      <ContextMenuTrigger asChild>
        <div
          draggable={!normalizedSearch && !reorderNavigation.isPending}
          onDragStart={(event) => beginDrag(event, { kind: "project", id: project.id })}
          onDragEnd={() => { setDragged(null); setDropTarget(null); setRootDropActive(false); }}
          onDragOver={(event) => showDropTarget(event, { kind: "project", id: project.id, position: event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2 ? "before" : "after" })}
          onDrop={(event) => finishDrop(event, { kind: "project", id: project.id, position: event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2 ? "before" : "after" })}
          className={cn("cursor-grab rounded active:cursor-grabbing", dropIndicator("project", project.id))}
          style={{ paddingLeft: 22 + depth * 10 }}
        >
          <Button variant="ghost" size="sm" className={cn("h-7 w-full min-w-0 justify-start px-2 text-[12px] font-normal", workspacePage === "tasks" && activeView === "project" && selectedProjectId === project.id && "bg-sidebar-accent font-medium")} onClick={() => setActiveView("project", project.id)}>
            <List className="size-3.5" /><span className="truncate">{project.name}</span>
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => beginEdit({ kind: "project", mode: "rename", item: project })}><Pencil />重命名</ContextMenuItem>
        <ContextMenuItem onSelect={() => beginEdit({ kind: "project", mode: "move", item: project })}><FolderInput />移动到分类</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => setDeleteProjectTarget(project)}><Trash2 />删除清单</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  const renderCategory = (category: Category, depth: number): ReactNode => {
    if (categoryMatches && !categoryMatches.has(category.id)) return null;
    const children = childCategories(category.id);
    const lists = (projects.data ?? []).filter((project) => project.categoryId === category.id && (!normalizedSearch || project.name.toLocaleLowerCase().includes(normalizedSearch)));
    const open = normalizedSearch ? true : expanded.has(category.id);
    return (
      <div key={category.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              draggable={!normalizedSearch && !reorderNavigation.isPending}
              onDragStart={(event) => beginDrag(event, { kind: "category", id: category.id })}
              onDragEnd={() => { setDragged(null); setDropTarget(null); setRootDropActive(false); }}
              onDragOver={(event) => showDropTarget(event, { kind: "category", id: category.id, position: categoryDropPosition(event) })}
              onDrop={(event) => finishDrop(event, { kind: "category", id: category.id, position: categoryDropPosition(event) })}
              className={cn("flex cursor-grab items-center rounded active:cursor-grabbing", dropIndicator("category", category.id))}
            >
              <Button variant="ghost" size="icon-xs" className="shrink-0" style={{ marginLeft: depth * 10 }} aria-label={open ? "收起分类" : "展开分类"} onClick={() => toggleCategory(category.id)}>
                {open ? <ChevronDown /> : <ChevronRight />}
              </Button>
              <Button variant="ghost" size="sm" className={cn("h-8 min-w-0 flex-1 justify-start px-1.5 text-[12px] font-normal", workspacePage === "tasks" && activeView === "category" && selectedCategoryId === category.id && "bg-sidebar-accent font-medium")} onClick={() => setActiveView("category", category.id)}>
                <Folder className="size-3.5" /><span className="truncate">{category.name}</span>
              </Button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => beginEdit({ kind: "category", mode: "rename", item: category })}><Pencil />重命名</ContextMenuItem>
            <ContextMenuItem onSelect={() => beginEdit({ kind: "category", mode: "move", item: category })}><FolderInput />移动到分类</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setCreateTarget({ kind: "category", parentId: category.id })}><FolderPlus />新建子分类</ContextMenuItem>
            <ContextMenuItem onSelect={() => setCreateTarget({ kind: "project", categoryId: category.id })}><Plus />新建清单</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => setDeleteCategoryTarget(category)}><Trash2 />删除分类</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {open && <div>
          {children.map((child) => renderCategory(child, depth + 1))}
          {lists.map((project) => renderProject(project, depth))}
        </div>}
      </div>
    );
  };

  const submitCreate = (event: FormEvent) => { event.preventDefault(); if (name.trim()) create.mutate(); };
  const submitEdit = (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget || (editTarget.mode === "rename" && !name.trim()) || (editTarget.mode === "move" && !destinationId)) return;
    update.mutate();
  };
  const excludedMoveTargets = editTarget?.kind === "category" ? descendantIds(editTarget.item.id) : new Set<string>();

  return (
    <aside className="relative flex shrink-0 flex-col border-r bg-sidebar px-2 pb-2 pt-2 text-sidebar-foreground" style={{ width: collapsed ? 48 : sidebarWidth }}>
      <div className={cn("mb-2 flex h-10 items-center", collapsed ? "justify-center" : "justify-between px-1")}>
        {!collapsed && <button type="button" className="flex min-w-0 items-center gap-2 rounded-lg text-left outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring" title="收起侧栏" aria-label="收起侧栏" onClick={toggleSidebar}><img src={sidebarMarkURL} alt="" className="size-8 rounded-lg" decoding="async" draggable={false} /><span className="truncate text-sm font-semibold tracking-tight">yi-todo</span></button>}
        <Button variant="ghost" size="icon-sm" title={collapsed ? "展开侧栏" : "收起侧栏"} onClick={toggleSidebar}>{collapsed ? <ChevronRight /> : <ChevronLeft />}</Button>
      </div>
      <nav aria-label="任务视图" className="space-y-0.5">{views.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" size="sm" className={cn("h-8 w-full justify-start px-2 text-[13px] font-normal", workspacePage === "tasks" && activeView === id && "bg-sidebar-accent font-medium")} onClick={() => setActiveView(id)}><Icon />{!collapsed && label}</Button>)}</nav>
      <Separator className="my-2" />
      {!collapsed && <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex h-7 cursor-default items-center px-2"><span className="text-[11px] font-medium text-muted-foreground">分类与清单 · 右键管理</span></div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => setCreateTarget({ kind: "category", parentId: null })}><FolderPlus />新建分类</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className="relative mb-1"><Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索分类或清单" className="h-7 border-0 bg-sidebar-accent/45 pl-7 text-[11px] shadow-none" /></div>
        {dragError && <p className="px-2 py-1 text-[11px] text-destructive">{dragError}</p>}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div>{childCategories(null).map((category) => renderCategory(category, 0))}</div>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={cn("min-h-10 flex-1 rounded", rootDropActive && "bg-sidebar-accent/50 ring-1 ring-inset ring-primary/30")}
                onDragOver={(event) => {
                  if (dragged?.kind !== "category") return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(null);
                  setRootDropActive(true);
                }}
                onDrop={(event) => finishDrop(event, null)}
                aria-label="分类与清单空白区域"
              />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setCreateTarget({ kind: "category", parentId: null })}><FolderPlus />新建顶级分类</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </>}
      <div className="mt-auto border-t pt-2">{!collapsed && <PomodoroWidget />}<Button variant="ghost" size="sm" className={cn("h-8 w-full justify-start px-2 text-[13px] font-normal", workspacePage === "focus" && "bg-sidebar-accent font-medium")} onClick={openFocus}><ChartNoAxesCombined />{!collapsed && "专注统计"}</Button><Separator className="my-1.5" /><Button variant="ghost" size="sm" className={cn("h-8 w-full justify-start px-2 text-[13px] font-normal", workspacePage === "settings" && "bg-sidebar-accent font-medium")} onClick={openSettings}><Settings />{!collapsed && "设置与数据"}</Button></div>
      {!collapsed && <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度"
        className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none hover:bg-foreground/15"
        onPointerDown={(event) => { resizeStart.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (resizeStart.current) setSidebarWidth(resizeStart.current.width + event.clientX - resizeStart.current.x); }}
        onPointerUp={(event) => { resizeStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
        onDoubleClick={() => setSidebarWidth(224)}
      />}

      <Dialog open={Boolean(createTarget)} onOpenChange={(open) => { if (!open) { setCreateTarget(null); setName(""); } }}><DialogContent><form onSubmit={submitCreate}><DialogHeader><DialogTitle>{createTarget?.kind === "project" ? "新建清单" : createTarget?.parentId ? "新建子分类" : "新建分类"}</DialogTitle><DialogDescription>{createTarget?.kind === "project" ? "清单必须归属当前分类。" : "分类可以继续包含子分类和清单。"}</DialogDescription></DialogHeader><Input className="my-5" value={name} onChange={(event) => setName(event.target.value)} placeholder="名称" autoFocus />{create.error && <p className="text-xs text-destructive">{errorMessage(create.error)}</p>}<DialogFooter><Button type="submit" disabled={!name.trim() || create.isPending}>创建</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) { setEditTarget(null); update.reset(); } }}><DialogContent><form onSubmit={submitEdit}><DialogHeader><DialogTitle>{editTarget?.mode === "rename" ? "重命名" : "移动位置"}</DialogTitle><DialogDescription>{editTarget?.mode === "rename" ? "输入新的名称。" : editTarget?.kind === "category" ? "选择新的上级分类，不能移动到自身或子分类中。" : "选择清单要归属的分类。"}</DialogDescription></DialogHeader>{editTarget?.mode === "rename" ? <Input className="my-5" value={name} onChange={(event) => setName(event.target.value)} placeholder="名称" autoFocus /> : <Select value={destinationId} onValueChange={setDestinationId}><SelectTrigger className="my-5 w-full"><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent>{editTarget?.kind === "category" && <SelectItem value="__root__">顶级分类</SelectItem>}{flattenedCategories.filter(({ item }) => !excludedMoveTargets.has(item.id)).map(({ item, depth }) => <SelectItem key={item.id} value={item.id}>{`${"　".repeat(depth)}${item.name}`}</SelectItem>)}</SelectContent></Select>}{update.error && <p className="text-xs text-destructive">{errorMessage(update.error)}</p>}<DialogFooter><Button variant="outline" type="button" onClick={() => setEditTarget(null)}>取消</Button><Button type="submit" disabled={update.isPending || (editTarget?.mode === "rename" ? !name.trim() : !destinationId)}>保存</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(deleteProjectTarget)} onOpenChange={(open) => { if (!open) setDeleteProjectTarget(null); }}><DialogContent><DialogHeader><DialogTitle>永久删除清单？</DialogTitle><DialogDescription>清单“{deleteProjectTarget?.name}”删除后不可恢复，任务会移动到收集箱。</DialogDescription></DialogHeader>{deleteProject.error && <p className="text-xs text-destructive">{errorMessage(deleteProject.error)}</p>}<DialogFooter><Button variant="outline" onClick={() => setDeleteProjectTarget(null)}>取消</Button><Button variant="destructive" disabled={!deleteProjectTarget || deleteProject.isPending} onClick={() => deleteProjectTarget && deleteProject.mutate(deleteProjectTarget.id)}>确认删除</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(deleteCategoryTarget)} onOpenChange={(open) => { if (!open) setDeleteCategoryTarget(null); }}><DialogContent><DialogHeader><DialogTitle>永久删除分类？</DialogTitle><DialogDescription>分类“{deleteCategoryTarget?.name}”及其中所有子分类、清单将被删除且不可恢复；清单内的任务会保留并移动到收集箱。</DialogDescription></DialogHeader>{deleteCategory.error && <p className="text-xs text-destructive">{errorMessage(deleteCategory.error)}</p>}<DialogFooter><Button variant="outline" onClick={() => setDeleteCategoryTarget(null)}>取消</Button><Button variant="destructive" disabled={!deleteCategoryTarget || deleteCategory.isPending} onClick={() => deleteCategoryTarget && deleteCategory.mutate(deleteCategoryTarget.id)}>确认删除</Button></DialogFooter></DialogContent></Dialog>
    </aside>
  );
}
