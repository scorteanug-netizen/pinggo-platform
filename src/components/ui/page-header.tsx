import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  activeCompanyName?: string | null;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconBgColor = "bg-orange-100",
  iconColor = "text-orange-600",
  actions,
  breadcrumbs,
  activeCompanyName,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {item.href ? (
                <Link href={item.href} className="transition-colors hover:text-slate-700">
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-600">{item.label}</span>
              )}
              {index < breadcrumbs.length - 1 ? <span className="text-slate-400">/</span> : null}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", iconBgColor)}>
              <Icon className={cn("w-6 h-6", iconColor)} />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-fraunces font-extrabold text-slate-900">{title}</h1>
              {activeCompanyName ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                  Companie activa:
                  <span className="font-extrabold text-slate-800">{activeCompanyName}</span>
                </span>
              ) : null}
            </div>
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
