"use client";

import { X } from "lucide-react";

import {
  DASHBOARD_WIDGET_CATEGORY_LABELS,
  DASHBOARD_WIDGET_REGISTRY,
  type DashboardWidgetId,
} from "@/config/dashboard-widgets";
import { cn } from "@/lib/utils";

type WidgetCatalogModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeWidgetIds: DashboardWidgetId[];
  availableWidgetIds: DashboardWidgetId[];
  onAddWidget: (widgetId: DashboardWidgetId) => void;
};

export function WidgetCatalogModal({
  isOpen,
  onClose,
  activeWidgetIds,
  availableWidgetIds,
  onAddWidget,
}: WidgetCatalogModalProps) {
  if (!isOpen) {
    return null;
  }

  const activeSet = new Set(activeWidgetIds);
  const availableSet = new Set(availableWidgetIds);

  const widgets = Object.values(DASHBOARD_WIDGET_REGISTRY)
    .filter((widget) => availableSet.has(widget.id as DashboardWidgetId))
    .sort((left, right) => left.name.localeCompare(right.name, "ro"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-fraunces font-bold text-slate-900">Widget Catalog</h2>
            <p className="mt-1 text-sm text-slate-600">Adauga widget-uri in dashboard.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-600 transition-colors duration-200 hover:bg-slate-100"
            aria-label="Inchide catalog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-88px)] overflow-y-auto p-6">
          {Object.entries(DASHBOARD_WIDGET_CATEGORY_LABELS).map(([category, label]) => {
            const categoryWidgets = widgets.filter((widget) => widget.category === category);
            if (categoryWidgets.length === 0) return null;

            return (
              <section key={category} className="mb-8 last:mb-0">
                <h3 className="mb-4 text-xs font-extrabold uppercase tracking-wide text-slate-700">{label}</h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {categoryWidgets.map((widget) => {
                    const Icon = widget.icon;
                    const widgetId = widget.id as DashboardWidgetId;
                    const isActive = activeSet.has(widgetId);

                    return (
                      <button
                        key={widget.id}
                        type="button"
                        onClick={() => {
                          if (isActive) return;
                          onAddWidget(widgetId);
                        }}
                        disabled={isActive}
                        className={cn(
                          "rounded-lg border-2 p-4 text-left transition-all duration-200",
                          isActive
                            ? "cursor-not-allowed border-green-300 bg-green-50"
                            : "border-slate-200 hover:border-orange-300 hover:bg-orange-50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "rounded-lg p-2",
                              isActive ? "bg-green-100" : "bg-slate-100"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-5 w-5",
                                isActive ? "text-green-700" : "text-slate-600"
                              )}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-bold text-slate-900">{widget.name}</p>
                              {isActive ? (
                                <span className="text-xs font-semibold text-green-700">Activ</span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-600">{widget.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
