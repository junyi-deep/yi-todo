import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Moon, Sun } from "lucide-react";

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
  const queryClient = useQueryClient();
  const query = useThemeSetting();
  const theme = query.data ?? "system";
  const update = useMutation({
    mutationFn: async (next: AppTheme) => {
      await featureAPI.setSetting("appearance.theme", next);
      return next;
    },
    onMutate: (next) => applyTheme(next),
    onSuccess: (next) => queryClient.setQueryData(themeKey, next),
    onError: () => applyTheme(theme),
  });
  const label =
    theme === "system"
      ? "跟随系统"
      : theme === "light"
        ? "浅色主题"
        : "深色主题";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <label
      className="app-no-drag hover:bg-accent hover:text-accent-foreground relative grid size-8 place-items-center rounded-md"
      title={`主题：${label}`}
      aria-label="选择主题"
    >
      <Icon className="size-4" />
      <select
        className="absolute inset-0 cursor-pointer opacity-0"
        value={theme}
        disabled={update.isPending}
        onChange={(event) => update.mutate(event.target.value as AppTheme)}
        aria-label="选择主题"
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>
  );
}
