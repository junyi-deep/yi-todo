import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { featureAPI } from "../tasks/api";

export type AppTheme = "system" | "light" | "dark";

const themeKey = ["setting", "appearance.theme"] as const;

export function applyTheme(theme: AppTheme) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark" || (theme === "system" && systemDark),
  );
  document.documentElement.style.colorScheme =
    theme === "system" ? "light dark" : theme;
}

function normalizeTheme(value: string | undefined): AppTheme {
  return value === "light" || value === "dark" ? value : "system";
}

export function useThemeSetting() {
  return useQuery({
    queryKey: themeKey,
    queryFn: async () =>
      normalizeTheme(await featureAPI.getSetting("appearance.theme")),
    staleTime: Infinity,
  });
}

export function ThemeController() {
  const query = useThemeSetting();
  const theme = query.data ?? "system";
  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (theme === "system") applyTheme("system");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  return null;
}

export function ThemeToggle() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = useThemeSetting();
  const theme = query.data ?? "system";
  const update = useMutation({
    mutationFn: async (next: AppTheme) => {
      await featureAPI.setSetting("appearance.theme", next);
      return next;
    },
    onMutate: (next) => applyTheme(next),
    onSuccess: (next) => {
      queryClient.setQueryData(themeKey, next);
      setOpen(false);
    },
    onError: () => applyTheme(theme),
  });
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const label =
    theme === "system"
      ? "跟随系统"
      : theme === "light"
        ? "浅色主题"
        : "深色主题";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  const options: Array<{ value: AppTheme; label: string; icon: typeof Monitor }> = [
    { value: "system", label: "跟随系统", icon: Monitor },
    { value: "light", label: "浅色主题", icon: Sun },
    { value: "dark", label: "深色主题", icon: Moon },
  ];
  return (
    <div ref={rootRef} className="app-no-drag relative">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={update.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`主题：${label}`}
        aria-label="选择主题"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <Icon className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="选择主题"
          className="app-no-drag absolute right-0 top-full z-[100] mt-1 w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {options.map(({ value, label: optionLabel, icon: OptionIcon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                theme === value && "bg-accent/60",
              )}
              onClick={() => update.mutate(value)}
            >
              <OptionIcon className="size-4" />
              <span>{optionLabel}</span>
              {theme === value && <Check className="ml-auto size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
