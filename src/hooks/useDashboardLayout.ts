"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  canRoleUseWidget,
  getRoleDefaultWidgets,
  getWidgetMeta,
  type DashboardWidgetId,
  type DashboardWidgetLayoutItem,
} from "@/config/dashboard-widgets";
import type { AppRole } from "@/lib/rbac";

type UseDashboardLayoutOptions = {
  userRole: AppRole;
  availableWidgetIds: DashboardWidgetId[];
};

type PersistedLayoutPayload = {
  widgets: DashboardWidgetId[];
  layout: DashboardWidgetLayoutItem[];
};

type HydratedLayoutPayload = {
  widgets: DashboardWidgetId[];
  layout: unknown;
  isLegacy: boolean;
};

const GRID_COLS = 12;
const STORAGE_VERSION = "v3";
const LEGACY_STORAGE_VERSIONS = ["v2"] as const;
const LEGACY_HEIGHT_SCALE_FACTOR = 0.65;

function getStorageKey(role: AppRole, version = STORAGE_VERSION) {
  return `pinggo_dashboard_layout_${version}_${role}`;
}

function uniqueWidgetIds(ids: DashboardWidgetId[]) {
  return [...new Set(ids)];
}

function toSafeLayoutItem(input: unknown): DashboardWidgetLayoutItem | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Partial<DashboardWidgetLayoutItem>;
  if (typeof candidate.i !== "string") return null;
  if (typeof candidate.x !== "number") return null;
  if (typeof candidate.y !== "number") return null;
  if (typeof candidate.w !== "number") return null;
  if (typeof candidate.h !== "number") return null;

  return {
    i: candidate.i as DashboardWidgetId,
    x: Math.max(0, Math.floor(candidate.x)),
    y: Math.max(0, Math.floor(candidate.y)),
    w: Math.max(1, Math.floor(candidate.w)),
    h: Math.max(1, Math.floor(candidate.h)),
    minW: typeof candidate.minW === "number" ? Math.max(1, Math.floor(candidate.minW)) : undefined,
    minH: typeof candidate.minH === "number" ? Math.max(1, Math.floor(candidate.minH)) : undefined,
  };
}

function sortByPosition(left: DashboardWidgetLayoutItem, right: DashboardWidgetLayoutItem) {
  if (left.y !== right.y) return left.y - right.y;
  if (left.x !== right.x) return left.x - right.x;
  return left.i.localeCompare(right.i);
}

function buildLayoutFromWidgets(widgetIds: DashboardWidgetId[]) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  const layout: DashboardWidgetLayoutItem[] = [];

  for (const widgetId of widgetIds) {
    const meta = getWidgetMeta(widgetId);
    const width = Math.min(GRID_COLS, meta.defaultSize.w);
    const height = Math.max(1, meta.defaultSize.h);

    if (cursorX + width > GRID_COLS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    layout.push({
      i: widgetId,
      x: cursorX,
      y: cursorY,
      w: width,
      h: height,
      minW: meta.minSize?.w,
      minH: meta.minSize?.h,
    });

    cursorX += width;
    rowHeight = Math.max(rowHeight, height);
  }

  return layout;
}

function normalizeWidgets(params: {
  role: AppRole;
  availableWidgetIds: DashboardWidgetId[];
  storedWidgetIds?: DashboardWidgetId[];
}) {
  const allowedSet = new Set(
    params.availableWidgetIds.filter((id) => canRoleUseWidget(id, params.role))
  );

  const defaults = getRoleDefaultWidgets(params.role).filter((id) => allowedSet.has(id));

  const fromStorage = uniqueWidgetIds(params.storedWidgetIds ?? []).filter((id) =>
    allowedSet.has(id)
  );

  if (fromStorage.length > 0) {
    return {
      widgetIds: fromStorage,
      allowedSet,
      defaults,
    };
  }

  if (defaults.length > 0) {
    return {
      widgetIds: defaults,
      allowedSet,
      defaults,
    };
  }

  return {
    widgetIds: params.availableWidgetIds.filter((id) => allowedSet.has(id)),
    allowedSet,
    defaults,
  };
}

function normalizeLayout(params: {
  widgetIds: DashboardWidgetId[];
  allowedSet: Set<DashboardWidgetId>;
  rawLayout?: unknown;
}) {
  const parsedItems = Array.isArray(params.rawLayout)
    ? params.rawLayout
        .map((item) => toSafeLayoutItem(item))
        .filter((item): item is DashboardWidgetLayoutItem => Boolean(item))
    : [];

  const filtered = parsedItems
    .filter((item) => params.allowedSet.has(item.i))
    .filter((item) => params.widgetIds.includes(item.i));

  if (filtered.length === 0) {
    return buildLayoutFromWidgets(params.widgetIds);
  }

  const normalizedKnown = filtered.map((item) => {
    const meta = getWidgetMeta(item.i);
    return {
      ...item,
      w: Math.min(GRID_COLS, Math.max(meta.minSize?.w ?? 1, item.w)),
      h: Math.max(meta.minSize?.h ?? 1, item.h),
      minW: meta.minSize?.w,
      minH: meta.minSize?.h,
    };
  });

  const knownIds = new Set(normalizedKnown.map((item) => item.i));
  const missing = params.widgetIds.filter((widgetId) => !knownIds.has(widgetId));

  const maxY = normalizedKnown.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  const missingLayout = buildLayoutFromWidgets(missing).map((item) => ({
    ...item,
    y: item.y + maxY,
  }));

  const byId = new Map([...normalizedKnown, ...missingLayout].map((item) => [item.i, item]));
  const merged = params.widgetIds
    .map((widgetId) => byId.get(widgetId))
    .filter((item): item is DashboardWidgetLayoutItem => Boolean(item));

  return merged.sort(sortByPosition);
}

function parsePersistedPayload(raw: string | null) {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<PersistedLayoutPayload>;

  if (!parsed || typeof parsed !== "object") return null;

  const widgets = Array.isArray(parsed.widgets)
    ? parsed.widgets.filter((id): id is DashboardWidgetId => typeof id === "string")
    : [];

  return {
    widgets,
    layout: parsed.layout,
  };
}

function rescaleLayout(layout: DashboardWidgetLayoutItem[]) {
  return layout.map((item) => {
    const minHeight = getWidgetMeta(item.i).minSize?.h ?? 1;
    return {
      ...item,
      h: Math.max(minHeight, Math.ceil(item.h * LEGACY_HEIGHT_SCALE_FACTOR)),
    };
  });
}

function hydratePayload(role: AppRole): HydratedLayoutPayload | null {
  try {
    const currentPayload = parsePersistedPayload(localStorage.getItem(getStorageKey(role)));
    if (currentPayload) {
      return {
        ...currentPayload,
        isLegacy: false,
      };
    }

    for (const legacyVersion of LEGACY_STORAGE_VERSIONS) {
      const legacyPayload = parsePersistedPayload(localStorage.getItem(getStorageKey(role, legacyVersion)));
      if (!legacyPayload) continue;

      return {
        ...legacyPayload,
        isLegacy: true,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function persistPayload(role: AppRole, payload: PersistedLayoutPayload) {
  localStorage.setItem(getStorageKey(role), JSON.stringify(payload));
}

function reconcileWithActiveWidgets(
  layout: DashboardWidgetLayoutItem[],
  activeWidgets: DashboardWidgetId[]
) {
  const activeSet = new Set(activeWidgets);
  const known = layout.filter((item) => activeSet.has(item.i));
  const knownIds = new Set(known.map((item) => item.i));
  const missing = activeWidgets.filter((id) => !knownIds.has(id));

  if (missing.length === 0) {
    return known.sort(sortByPosition);
  }

  const extra = buildLayoutFromWidgets(missing);
  const maxY = known.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);

  const appended = extra.map((item) => ({
    ...item,
    y: item.y + maxY,
  }));

  return [...known, ...appended].sort(sortByPosition);
}

export function useDashboardLayout(options: UseDashboardLayoutOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [savedWidgets, setSavedWidgets] = useState<DashboardWidgetId[]>([]);
  const [savedLayout, setSavedLayout] = useState<DashboardWidgetLayoutItem[]>([]);

  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetId[]>([]);
  const [draftLayout, setDraftLayout] = useState<DashboardWidgetLayoutItem[]>([]);

  const availableKey = useMemo(
    () => [...options.availableWidgetIds].sort().join(","),
    [options.availableWidgetIds]
  );

  useEffect(() => {
    const persisted = hydratePayload(options.userRole);
    const normalizedWidgets = normalizeWidgets({
      role: options.userRole,
      availableWidgetIds: options.availableWidgetIds,
      storedWidgetIds: persisted?.widgets,
    });

    const normalizedLayout = normalizeLayout({
      widgetIds: normalizedWidgets.widgetIds,
      allowedSet: normalizedWidgets.allowedSet,
      rawLayout: persisted?.layout,
    });

    const completeLayout = reconcileWithActiveWidgets(normalizedLayout, normalizedWidgets.widgetIds);
    const migratedLayout = persisted?.isLegacy ? rescaleLayout(completeLayout) : completeLayout;
    const finalLayout = reconcileWithActiveWidgets(migratedLayout, normalizedWidgets.widgetIds);

    setSavedWidgets(normalizedWidgets.widgetIds);
    setSavedLayout(finalLayout);
    setDraftWidgets(normalizedWidgets.widgetIds);
    setDraftLayout(finalLayout);
    setIsEditMode(false);
    setIsReady(true);

    if (persisted?.isLegacy) {
      persistPayload(options.userRole, {
        widgets: normalizedWidgets.widgetIds,
        layout: finalLayout,
      });
    }
  }, [options.userRole, availableKey, options.availableWidgetIds]);

  const startEdit = useCallback(() => {
    setDraftWidgets(savedWidgets);
    setDraftLayout(savedLayout);
    setIsEditMode(true);
  }, [savedLayout, savedWidgets]);

  const cancelEdit = useCallback(() => {
    setDraftWidgets(savedWidgets);
    setDraftLayout(savedLayout);
    setIsEditMode(false);
    // Force re-compaction by triggering a layout identity change
    setSavedLayout((prev) => [...prev]);
  }, [savedLayout, savedWidgets]);

  const saveEdit = useCallback(() => {
    const completeLayout = reconcileWithActiveWidgets(draftLayout, draftWidgets);

    setSavedWidgets(draftWidgets);
    // Spread to force re-compaction on mode switch
    setSavedLayout([...completeLayout]);
    persistPayload(options.userRole, {
      widgets: draftWidgets,
      layout: completeLayout,
    });
    setIsEditMode(false);
  }, [draftLayout, draftWidgets, options.userRole]);

  const resetLayout = useCallback(() => {
    const normalized = normalizeWidgets({
      role: options.userRole,
      availableWidgetIds: options.availableWidgetIds,
      storedWidgetIds: undefined,
    });

    const defaultLayout = buildLayoutFromWidgets(normalized.widgetIds);

    if (isEditMode) {
      setDraftWidgets(normalized.widgetIds);
      setDraftLayout(defaultLayout);
      return;
    }

    setSavedWidgets(normalized.widgetIds);
    setSavedLayout(defaultLayout);
    setDraftWidgets(normalized.widgetIds);
    setDraftLayout(defaultLayout);
    persistPayload(options.userRole, {
      widgets: normalized.widgetIds,
      layout: defaultLayout,
    });
  }, [isEditMode, options.availableWidgetIds, options.userRole]);

  const addWidget = useCallback((widgetId: DashboardWidgetId) => {
    setDraftWidgets((current) => {
      if (current.includes(widgetId)) return current;
      return [...current, widgetId];
    });

    setDraftLayout((current) => {
      if (current.some((item) => item.i === widgetId)) return current;

      const meta = getWidgetMeta(widgetId);
      const maxY = current.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);

      return [
        ...current,
        {
          i: widgetId,
          x: 0,
          y: maxY,
          w: Math.min(GRID_COLS, meta.defaultSize.w),
          h: meta.defaultSize.h,
          minW: meta.minSize?.w,
          minH: meta.minSize?.h,
        },
      ];
    });
  }, []);

  const removeWidget = useCallback((widgetId: DashboardWidgetId) => {
    setDraftWidgets((current) => current.filter((id) => id !== widgetId));
    setDraftLayout((current) => current.filter((item) => item.i !== widgetId));
  }, []);

  const updateLayout = useCallback((items: DashboardWidgetLayoutItem[]) => {
    setDraftLayout((current) => {
      const currentById = new Map(current.map((item) => [item.i, item]));

      const next = items.map((item) => {
        const meta = getWidgetMeta(item.i);
        const prev = currentById.get(item.i);

        return {
          i: item.i,
          x: Math.max(0, Math.floor(item.x)),
          y: Math.max(0, Math.floor(item.y)),
          w: Math.min(
            GRID_COLS,
            Math.max(meta.minSize?.w ?? 1, Math.floor(item.w))
          ),
          h: Math.max(meta.minSize?.h ?? 1, Math.floor(item.h)),
          minW: meta.minSize?.w ?? prev?.minW,
          minH: meta.minSize?.h ?? prev?.minH,
        };
      });

      return reconcileWithActiveWidgets(next, draftWidgets);
    });
  }, [draftWidgets]);

  const activeWidgets = isEditMode ? draftWidgets : savedWidgets;
  const layout = isEditMode ? draftLayout : savedLayout;

  return {
    isReady,
    isEditMode,
    activeWidgets,
    layout,
    startEdit,
    cancelEdit,
    saveEdit,
    resetLayout,
    addWidget,
    removeWidget,
    updateLayout,
  };
}
