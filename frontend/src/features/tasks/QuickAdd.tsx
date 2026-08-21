import { FormEvent, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zhCN } from "../../i18n/zh-CN";

type Props = {
  pending: boolean;
  onCreate: (title: string) => Promise<void>;
};

export function QuickAdd({ pending, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    await onCreate(trimmed);
    setTitle("");
    inputRef.current?.focus();
  };

  return (
    <form
      onSubmit={submit}
      className="group flex h-9 items-center gap-2 border-b bg-background px-4 transition-colors focus-within:bg-accent/30"
    >
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-primary/60 text-primary">
        <Plus className="size-3" aria-hidden="true" />
      </span>
      <Input
        id="quick-add-task"
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={zhCN.addPlaceholder}
        aria-label={zhCN.addPlaceholder}
        maxLength={500}
        className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
      />
      <kbd className="text-muted-foreground hidden text-[10px] opacity-60 sm:block">
        ⌘ N
      </kbd>
      <Button
        type="submit"
        disabled={pending || !title.trim()}
        size="xs"
        className="h-6 opacity-0 transition-opacity group-focus-within:opacity-100"
      >
        {pending ? "…" : zhCN.add}
      </Button>
    </form>
  );
}
