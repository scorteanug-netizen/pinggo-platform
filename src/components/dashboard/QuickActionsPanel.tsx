import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  FileText,
  Settings,
  UserPlus,
  Workflow,
  Zap,
} from "lucide-react";
import type { PermissionKey, PermissionSet } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type ActionColor = "orange" | "violet" | "green" | "gray";

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  color: ActionColor;
  permission?: PermissionKey;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "+ Lead Manual",
    icon: UserPlus,
    href: "/leads",
    color: "orange",
    permission: "canViewLeads",
  },
  {
    label: "+ Scenariu",
    icon: Zap,
    href: "/autopilot",
    color: "violet",
    permission: "canViewLeads",
  },
  {
    label: "Fluxuri",
    icon: Workflow,
    href: "/flows",
    color: "violet",
    permission: "canViewFlows",
  },
  {
    label: "Raport Zilnic",
    icon: FileText,
    href: "/reports",
    color: "violet",
    permission: "canViewReports",
  },
  {
    label: "Notificari",
    icon: Bell,
    href: "/notifications",
    color: "green",
    permission: "canViewNotifications",
  },
  {
    label: "Setari SLA",
    icon: Settings,
    href: "/settings",
    color: "gray",
    permission: "canViewSettings",
  },
];

const hoverClassesByColor: Record<ActionColor, string> = {
  orange: "hover:border-orange-500 hover:bg-orange-50",
  violet: "hover:border-violet-500 hover:bg-violet-50",
  green: "hover:border-green-500 hover:bg-green-50",
  gray: "hover:border-slate-400 hover:bg-slate-50",
};

const iconClassesByColor: Record<ActionColor, string> = {
  orange: "text-orange-500",
  violet: "text-violet-500",
  green: "text-green-500",
  gray: "text-slate-500",
};

type QuickActionsPanelProps = {
  permissions: PermissionSet;
};

export function QuickActionsPanel({ permissions }: QuickActionsPanelProps) {
  const actions = QUICK_ACTIONS.filter((action) =>
    action.permission ? permissions[action.permission] : true
  );

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <h2 className="mb-3 shrink-0 text-lg font-fraunces font-bold text-slate-900">Actiuni Rapide</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-slate-200 p-4",
                "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
                hoverClassesByColor[action.color]
              )}
            >
              <Icon className={cn("h-5 w-5", iconClassesByColor[action.color])} />
              <span className="text-sm font-semibold text-slate-700">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
