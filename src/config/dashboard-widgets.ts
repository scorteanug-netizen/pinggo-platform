import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Calendar,
  LayoutDashboard,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import type { AppRole } from "@/lib/rbac";

export type DashboardWidgetCategory = "metrics" | "activity" | "performance" | "tools";

export type DashboardWidgetSize = {
  w: number;
  h: number;
};

export type DashboardWidgetLayoutItem = {
  i: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type DashboardWidgetMeta = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  defaultSize: DashboardWidgetSize;
  minSize?: DashboardWidgetSize;
  category: DashboardWidgetCategory;
  roles?: AppRole[];
};

export const DASHBOARD_WIDGET_REGISTRY = {
  stats_cards: {
    id: "stats_cards",
    name: "Stats Cards",
    description: "Overview metrics: total leads, new today, qualified, TTFT",
    icon: LayoutDashboard,
    defaultSize: { w: 12, h: 3 },
    minSize: { w: 6, h: 2 },
    category: "metrics",
  },
  breach_alerts: {
    id: "breach_alerts",
    name: "Breach Alerts",
    description: "Critical alerts for SLA breaches",
    icon: AlertTriangle,
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    category: "metrics",
  },
  leads_trend: {
    id: "leads_trend",
    name: "Leads Trend Chart",
    description: "7-day trend for leads volume",
    icon: TrendingUp,
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 6, h: 4 },
    category: "metrics",
  },
  team_performance: {
    id: "team_performance",
    name: "Team Performance",
    description: "Agent performance today",
    icon: Users,
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 6, h: 4 },
    category: "performance",
    roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"],
  },
  recent_leads: {
    id: "recent_leads",
    name: "Recent Leads",
    description: "Last 10 leads with status",
    icon: Users,
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 6, h: 4 },
    category: "activity",
  },
  quick_actions: {
    id: "quick_actions",
    name: "Quick Actions",
    description: "Shortcut buttons for common tasks",
    icon: Zap,
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    category: "tools",
  },
  activity_feed: {
    id: "activity_feed",
    name: "Activity Feed",
    description: "Real-time activity stream",
    icon: Activity,
    defaultSize: { w: 4, h: 7 },
    minSize: { w: 3, h: 6 },
    category: "activity",
  },
  autopilot_status: {
    id: "autopilot_status",
    name: "Autopilot Status",
    description: "Active scenarios overview",
    icon: Bot,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    category: "performance",
  },
  today_bookings: {
    id: "today_bookings",
    name: "Today's Bookings",
    description: "Upcoming meetings today",
    icon: Calendar,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    category: "activity",
  },
  conversion_funnel: {
    id: "conversion_funnel",
    name: "Conversion Funnel",
    description: "Lead to booking conversion flow",
    icon: BarChart3,
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 6, h: 4 },
    category: "metrics",
  },
} as const satisfies Record<string, DashboardWidgetMeta>;

export type DashboardWidgetId = keyof typeof DASHBOARD_WIDGET_REGISTRY;

export const DASHBOARD_WIDGET_CATEGORY_LABELS: Record<DashboardWidgetCategory, string> = {
  metrics: "Metrics & Stats",
  activity: "Activity & Leads",
  performance: "Performance & Team",
  tools: "Tools & Actions",
};

export const DEFAULT_WIDGETS_BY_ROLE: Record<AppRole, DashboardWidgetId[]> = {
  SUPER_ADMIN: [
    "stats_cards",
    "breach_alerts",
    "leads_trend",
    "team_performance",
    "conversion_funnel",
    "recent_leads",
    "activity_feed",
    "autopilot_status",
    "today_bookings",
    "quick_actions",
  ],
  ADMIN: [
    "stats_cards",
    "breach_alerts",
    "leads_trend",
    "team_performance",
    "conversion_funnel",
    "recent_leads",
    "activity_feed",
    "autopilot_status",
    "today_bookings",
    "quick_actions",
  ],
  MANAGER: [
    "stats_cards",
    "breach_alerts",
    "leads_trend",
    "team_performance",
    "recent_leads",
    "activity_feed",
    "autopilot_status",
    "today_bookings",
    "quick_actions",
  ],
  AGENT: [
    "stats_cards",
    "recent_leads",
    "activity_feed",
    "today_bookings",
    "autopilot_status",
    "quick_actions",
  ],
};

export function canRoleUseWidget(widgetId: DashboardWidgetId, role: AppRole) {
  const widget: DashboardWidgetMeta = DASHBOARD_WIDGET_REGISTRY[widgetId];
  if (!widget.roles || widget.roles.length === 0) {
    return true;
  }
  return widget.roles.includes(role);
}

export function getRoleDefaultWidgets(role: AppRole) {
  return DEFAULT_WIDGETS_BY_ROLE[role] ?? DEFAULT_WIDGETS_BY_ROLE.AGENT;
}

export function getWidgetMeta(widgetId: DashboardWidgetId) {
  return DASHBOARD_WIDGET_REGISTRY[widgetId] as DashboardWidgetMeta;
}
