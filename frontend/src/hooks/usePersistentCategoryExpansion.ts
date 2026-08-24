import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { featureAPI, type Category } from "../features/tasks/api";

const settingKey = "sidebar.expandedCategories";

export function usePersistentCategoryExpansion(
  categories: Category[],
  categoriesReady: boolean,
) {
  const initialized = useRef(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const setting = useQuery({
    queryKey: ["setting", settingKey],
    queryFn: () => featureAPI.getSetting(settingKey),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (initialized.current || !categoriesReady || setting.isPending) return;
    const validIds = new Set(categories.map((category) => category.id));
    let saved: unknown;
    try {
      saved = setting.data ? JSON.parse(setting.data) : undefined;
    } catch {
      saved = undefined;
    }
    const initial = Array.isArray(saved)
      ? new Set(saved.filter((id): id is string => typeof id === "string" && validIds.has(id)))
      : new Set(categories.map((category) => category.id));
    initialized.current = true;
    setExpanded(initial);
  }, [categories, categoriesReady, setting.data, setting.isPending]);

  useEffect(() => {
    if (!initialized.current) return;
    const timeout = window.setTimeout(() => {
      void featureAPI.setSetting(settingKey, JSON.stringify([...expanded]));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [expanded]);

  const toggleCategory = useCallback((id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  }, [expanded]);

  const expandCategory = useCallback((id: string) => {
    if (expanded.has(id)) return;
    const next = new Set(expanded).add(id);
    setExpanded(next);
  }, [expanded]);

  return { expanded, toggleCategory, expandCategory };
}
