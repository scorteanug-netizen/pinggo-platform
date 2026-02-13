"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Users, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeColor: "orange" | "violet" | "gray";
};

const navItems: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, activeColor: "orange" },
  { href: "/app/leads", label: "Leaduri", icon: Users, activeColor: "orange" },
  { href: "/app/flows", label: "Fluxuri", icon: Workflow, activeColor: "violet" },
  { href: "/app/setari", label: "Setari", icon: Settings, activeColor: "gray" },
];

const activeRailClasses = {
  orange: "bg-orange-500",
  violet: "bg-violet-500",
  gray: "bg-slate-500",
} as const;

const activeIconClasses = {
  orange: "text-orange-500",
  violet: "text-violet-500",
  gray: "text-slate-600",
} as const;

const activeMobileClasses = {
  orange: "border-orange-200 bg-orange-50 text-orange-700 font-extrabold",
  violet: "border-violet-200 bg-violet-50 text-violet-700 font-extrabold",
  gray: "border-slate-300 bg-slate-100 text-slate-700 font-extrabold",
} as const;

function getItemIsActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink({ href, label, icon: Icon, activeColor }: NavItem) {
  const pathname = usePathname();
  const isActive = getItemIsActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-slate-100 text-slate-900 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <span
        className={cn(
          "absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full transition-colors",
          isActive ? activeRailClasses[activeColor] : "bg-transparent group-hover:bg-slate-300"
        )}
      />
      <Icon
        className={cn(
          "h-4 w-4",
          isActive ? activeIconClasses[activeColor] : "text-slate-500 group-hover:text-slate-700"
        )}
      />
      <span>{label}</span>
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden min-h-screen border-r border-slate-200 bg-slate-50 md:flex md:w-[260px] md:flex-col">
      <div className="border-b border-slate-200 px-6 py-5">
        <Link href="/app" className="inline-flex items-center">
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

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => (
          <SidebarLink key={item.href} {...item} />
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {navItems.map((item) => {
        const isActive = getItemIsActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? activeMobileClasses[item.activeColor]
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
