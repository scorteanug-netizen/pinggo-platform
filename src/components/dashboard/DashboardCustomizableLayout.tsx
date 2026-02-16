"use client";

import { useMemo, useState } from "react";
import GridLayout, {
  type Layout,
  type LayoutItem,
  WidthProvider,
} from "react-grid-layout/legacy";
import { GripVertical, Plus, RotateCcw, Save, Settings, X } from "lucide-react";

import { getWidgetMeta, type DashboardWidgetId, type DashboardWidgetLayoutItem } from "@/config/dashboard-widgets";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import type { AppRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { WidgetCatalogModal } from "./WidgetCatalogModal";

const AutoWidthGridLayout = WidthProvider(GridLayout);

type DashboardWidgetRenderItem = {
  id: DashboardWidgetId;
  node: React.ReactNode;
};

type DashboardCustomizableLayoutProps = {
  userRole: AppRole;
  widgets: DashboardWidgetRenderItem[];
};

function toGridLayoutItems(items: DashboardWidgetLayoutItem[]): Layout {
  return items.map((item): LayoutItem => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
  }));
}

function fromGridLayoutItems(items: Layout): DashboardWidgetLayoutItem[] {
  return items.map((item) => ({
    i: item.i as DashboardWidgetId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
  }));
}

export function DashboardCustomizableLayout({
  userRole,
  widgets,
}: DashboardCustomizableLayoutProps) {
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  const widgetNodeById = useMemo(
    () => new Map(widgets.map((item) => [item.id, item.node])),
    [widgets]
  );
  const availableWidgetIds = useMemo(
    () => widgets.map((item) => item.id),
    [widgets]
  );

  const {
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
  } = useDashboardLayout({
    userRole,
    availableWidgetIds,
  });

  const visibleLayout = useMemo(() => {
    const activeSet = new Set(activeWidgets);
    return layout.filter((item) => activeSet.has(item.i));
  }, [activeWidgets, layout]);

  const handleLayoutChange = (nextLayout: Layout) => {
    if (!isEditMode) return;
    updateLayout(fromGridLayoutItems(nextLayout));
  };

  if (!isReady) {
    return (
      <div className="space-y-6">
        {widgets.map((widget) => (
          <div key={widget.id}>{widget.node}</div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        {isEditMode ? (
          <>
            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add Widget
            </button>

            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>

            <button
              type="button"
              onClick={saveEdit}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-orange-600"
            >
              <Save className="h-4 w-4" />
              Save Layout
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4" />
            Customize Dashboard
          </button>
        )}
      </div>

      {isEditMode ? (
        <div className="mb-6 rounded-lg border-l-4 border-orange-500 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <Settings className="mt-0.5 h-5 w-5 text-orange-600" />
            <div>
              <p className="text-sm font-semibold text-orange-900">Edit Mode Active</p>
              <p className="mt-1 text-xs text-orange-700">
                Drag widgets pentru reordonare, resize din coltul din dreapta jos si foloseste "x" pentru a le elimina.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activeWidgets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <p className="text-sm text-slate-600">Niciun widget activ pe dashboard.</p>
          <button
            type="button"
            onClick={startEdit}
            className="mt-3 text-sm font-semibold text-orange-600 transition-colors duration-200 hover:text-orange-700"
          >
            Customize Dashboard
          </button>
        </div>
      ) : (
        <AutoWidthGridLayout
          className={cn("dashboard-grid-layout", isEditMode ? "dashboard-grid-editing" : null)}
          layout={toGridLayoutItems(visibleLayout)}
          cols={12}
          rowHeight={80}
          margin={[24, 16]}
          containerPadding={[0, 0]}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".widget-drag-handle"
          compactType="vertical"
          preventCollision={false}
          useCSSTransforms={true}
          transformScale={1}
        >
          {activeWidgets.map((widgetId) => {
            const widgetNode = widgetNodeById.get(widgetId);
            if (!widgetNode) {
              return null;
            }

            const widgetMeta = getWidgetMeta(widgetId);

            return (
              <div key={widgetId} className="relative h-full">
                <div
                  className={cn(
                    "relative h-full rounded-xl",
                    isEditMode ? "ring-2 ring-orange-300/70 ring-offset-2" : null
                  )}
                >
                  {isEditMode ? (
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                      <div
                        className="widget-drag-handle inline-flex cursor-move items-center gap-1 rounded-lg bg-white px-2 py-1 shadow"
                        title="Drag"
                      >
                        <GripVertical className="h-4 w-4 text-slate-600" />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeWidget(widgetId)}
                        className="rounded-lg bg-white p-1.5 shadow transition-colors duration-200 hover:bg-red-50"
                        aria-label={`Remove ${widgetMeta.name}`}
                        title="Remove"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  ) : null}

                  <div className="h-full overflow-auto rounded-xl">{widgetNode}</div>
                </div>
              </div>
            );
          })}
        </AutoWidthGridLayout>
      )}

      <WidgetCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        activeWidgetIds={activeWidgets}
        availableWidgetIds={availableWidgetIds}
        onAddWidget={(widgetId) => {
          addWidget(widgetId);
          setIsCatalogOpen(false);
        }}
      />
    </>
  );
}

export type { DashboardWidgetRenderItem };
