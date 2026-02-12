import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  icon?: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  className?: string;
  spacious?: boolean;
};

export function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  className,
  spacious = false,
}: StatCardProps) {
  const headerPaddingClass = spacious ? "p-6 pb-3" : "pb-2";
  const contentPaddingClass = spacious ? "px-6 pb-6 pt-0" : undefined;

  return (
    <Card
      className={cn(
        "border border-gray-200 shadow-sm transition-all duration-200",
        "hover:border-orange-500 hover:shadow-md hover:shadow-orange-100",
        className
      )}
    >
      <CardHeader className={headerPaddingClass}>
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="w-4 h-4 text-orange-600" />
          )}
          <CardTitle className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className={contentPaddingClass}>
        <div className="text-3xl font-fraunces font-bold text-slate-900">
          {value}
        </div>
        {helper && <p className="text-xs text-slate-500 mt-1">{helper}</p>}
      </CardContent>
    </Card>
  );
}
