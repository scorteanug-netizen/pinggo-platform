"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  Building2,
  LayoutDashboard,
  PlugZap,
  Settings,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import type { PermissionKey, PermissionSet } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey;
  activeColor: "orange" | "violet" | "gray";
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "canViewDashboard", activeColor: "orange" },
  { href: "/leads", label: "Leaduri", icon: Users, permission: "canViewLeads", activeColor: "orange" },
  { href: "/autopilot", label: "Autopilot", icon: Bot, permission: "canViewLeads", activeColor: "violet", badge: "NOU" },
  { href: "/companies", label: "Companii", icon: Building2, permission: "canViewCompanies", activeColor: "orange" },
  { href: "/users", label: "Useri", icon: UserCog, permission: "canViewUsers", activeColor: "violet" },
  { href: "/flows", label: "Fluxuri", icon: Workflow, permission: "canViewFlows", activeColor: "violet" },
  { href: "/settings", label: "Setari", icon: Settings, permission: "canViewSettings", activeColor: "gray" },
  { href: "/reports", label: "Rapoarte", icon: BarChart3, permission: "canViewReports", activeColor: "violet" },
  { href: "/integrations", label: "Integrari", icon: PlugZap, permission: "canViewIntegrations", activeColor: "orange" },
];

const activeRailClasses = {
  orange: "bg-orange-500",
  violet: "bg-violet-500",
  gray: "bg-slate-500",
} as const;

const activeIconClasses = {
  orange: "border-orange-200 bg-orange-50 text-orange-600",
  violet: "border-violet-200 bg-violet-50 text-violet-600",
  gray: "border-slate-300 bg-slate-100 text-slate-700",
} as const;

const activeMobileClasses = {
  orange: "border-orange-200 bg-orange-50 text-orange-700 font-extrabold shadow-[0_6px_14px_rgba(249,115,22,0.16)]",
  violet: "border-violet-200 bg-violet-50 text-violet-700 font-extrabold shadow-[0_6px_14px_rgba(139,92,246,0.16)]",
  gray: "border-slate-300 bg-slate-100 text-slate-700 font-extrabold shadow-[0_6px_14px_rgba(15,23,42,0.1)]",
} as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({ href, label, icon: Icon, activeColor, badge }: NavItem) {
  const pathname = usePathname();
  const active = isActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-sm font-medium tracking-[0.01em] transition-all duration-200",
        active
          ? "border-slate-200 bg-white text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-[0_8px_18px_rgba(15,23,42,0.07)]"
      )}
    >
      <span
        className={cn(
          "absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full transition-colors",
          active ? activeRailClasses[activeColor] : "bg-transparent group-hover:bg-slate-300"
        )}
      />
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
          active
            ? activeIconClasses[activeColor]
            : "border-transparent bg-slate-100 text-slate-500 group-hover:border-slate-200 group-hover:bg-slate-100 group-hover:text-slate-600"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span
          className={cn(
            "text-[10px] font-extrabold px-2 py-0.5 rounded-full",
            activeColor === "violet" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

type WorkspaceSidebarProps = {
  permissions: PermissionSet;
};

export function WorkspaceSidebar({ permissions }: WorkspaceSidebarProps) {
  const visibleItems = navItems.filter((item) => permissions[item.permission]);

  return (
    <aside className="hidden min-h-screen border-r border-slate-200/90 bg-white/90 shadow-[inset_-1px_0_0_rgba(15,23,42,0.03)] backdrop-blur md:flex md:w-[260px] md:flex-col">
      <div className="border-b border-slate-200/90 px-6 py-5">
        <Link href="/dashboard" className="inline-flex items-center">
          <Image
            src="/PINGGO_LOGO.png?v=2"
            alt="Pinggo"
            width={126}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 px-3 py-5">
        {visibleItems.map((item) => (
          <SidebarItem key={item.href} {...item} />
        ))}
      </nav>
    </aside>
  );
}

type WorkspaceMobileNavProps = {
  permissions: PermissionSet;
};

export function WorkspaceMobileNav({ permissions }: WorkspaceMobileNavProps) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => permissions[item.permission]);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {visibleItems.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200",
              active
                ? activeMobileClasses[item.activeColor]
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
            {item.badge && (
              <span
                className={cn(
                  "text-[9px] font-extrabold px-1.5 py-0.5 rounded-full",
                  item.activeColor === "violet" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
