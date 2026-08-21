import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { featureAPI } from "../tasks/api";
import { useUIStore } from "../../stores/uiStore";

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const setActiveView = useUIStore((state) => state.setActiveView);
  const selectTask = useUIStore((state) => state.selectTask);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    const openSearch = () => setOpen(true);
    window.addEventListener("localtodo:open-search", openSearch);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("localtodo:open-search", openSearch);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => featureAPI.search(debounced),
    enabled: debounced.length > 0,
  });

  const openResult = (id: string) => {
    setActiveView("all");
    selectTask(id);
    setOpen(false);
    setQuery("");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="gap-1 overflow-hidden border-0 bg-popover/95 p-2 shadow-2xl ring-0 backdrop-blur sm:max-w-xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>搜索任务</DialogTitle>
        </DialogHeader>
        <div className="flex items-center rounded-lg bg-muted/60 px-3">
          <Search className="text-muted-foreground size-4" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题与描述…"
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-96 overflow-auto px-1 pb-1 pt-1.5">
          {debounced &&
            !results.isPending &&
            (results.data ?? []).length === 0 && (
              <p className="text-muted-foreground p-8 text-center text-sm">
                没有匹配任务
              </p>
            )}
          {(results.data ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openResult(item.id)}
              className="hover:bg-accent w-full rounded-md px-3 py-2 text-left"
            >
              <div className="text-[13px] font-medium">{item.title}</div>
              <div className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
                {item.projectName ?? "收集箱"}
                {item.descriptionPlain ? ` · ${item.descriptionPlain}` : ""}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
