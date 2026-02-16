import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type StatAccent = "orange" | "violet" | "green" | "red" | "gray";

type StatCardProps = {
  icon?: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  accent?: StatAccent;
  className?: string;
  spacious?: boolean;
};

const accentClasses: Record<
  StatAccent,
  {
    icon: string;
    iconContainer: string;
    hoverBorder: string;
    hoverShadow: string;
  }
> = {
  orange: {
    icon: "text-orange-500",
    iconContainer: "bg-orange-50",
    hoverBorder: "hover:border-orange-500",
    hoverShadow: "hover:shadow-[0_8px_20px_rgba(249,115,22,0.2)]",
  },
  violet: {
    icon: "text-violet-500",
    iconContainer: "bg-violet-50",
    hoverBorder: "hover:border-violet-500",
    hoverShadow: "hover:shadow-[0_8px_20px_rgba(139,92,246,0.2)]",
  },
  green: {
    icon: "text-green-500",
    iconContainer: "bg-green-50",
    hoverBorder: "hover:border-green-500",
    hoverShadow: "hover:shadow-[0_8px_20px_rgba(16,185,129,0.2)]",
  },
  red: {
    icon: "text-red-500",
    iconContainer: "bg-red-50",
    hoverBorder: "hover:border-red-500",
    hoverShadow: "hover:shadow-[0_8px_20px_rgba(239,68,68,0.2)]",
  },
  gray: {
    icon: "text-slate-500",
    iconContainer: "bg-slate-100",
    hoverBorder: "hover:border-slate-300",
    hoverShadow: "hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
  },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  accent = "orange",
  className,
  spacious = false,
}: StatCardProps) {
  const headerPaddingClass = spacious ? "p-4 pb-2 sm:p-6 sm:pb-3" : "p-4 pb-2 sm:p-6 sm:pb-3";
  const contentPaddingClass = spacious ? "px-4 pb-4 pt-0 sm:px-6 sm:pb-6" : "px-4 pb-4 pt-0 sm:px-6 sm:pb-6";
  const colors = accentClasses[accent];

  return (
    <Card
      className={cn(
        "border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200",
        "hover:-translate-y-0.5",
        colors.hoverBorder,
        colors.hoverShadow,
        className
      )}
    >
      <CardHeader className={headerPaddingClass}>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </CardTitle>
          {Icon && (
            <span
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                colors.iconContainer
              )}
            >
              <Icon className={cn("h-5 w-5", colors.icon)} />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className={contentPaddingClass}>
        <div className="text-2xl sm:text-4xl font-fraunces font-bold leading-none text-slate-900 truncate">
          {value}
        </div>
        {helper && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
      </CardContent>
    </Card>
  );
}
