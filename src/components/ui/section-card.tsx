import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  borderColor?: "orange" | "violet" | "green" | "red" | "gray" | "none";
  className?: string;
  contentClassName?: string;
  hover?: boolean;
  spacious?: boolean;
};

export function SectionCard({
  title,
  description,
  actions,
  children,
  borderColor = "orange",
  className,
  contentClassName,
  hover = true,
  spacious = false,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  const borderClass = borderColor === "none" ? "border-transparent" : "border-slate-200";
  const hoverAccentClass =
    borderColor === "violet"
      ? "hover:border-violet-500 hover:shadow-[0_8px_20px_rgba(139,92,246,0.2)]"
      : borderColor === "green"
        ? "hover:border-green-500 hover:shadow-[0_8px_20px_rgba(16,185,129,0.2)]"
        : borderColor === "red"
          ? "hover:border-red-500 hover:shadow-[0_8px_20px_rgba(239,68,68,0.2)]"
          : borderColor === "gray" || borderColor === "none"
            ? "hover:border-slate-300 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
            : "hover:border-orange-500 hover:shadow-[0_8px_20px_rgba(249,115,22,0.2)]";
  const hoverClass = hover
    ? cn("transition-all duration-200 hover:-translate-y-0.5", hoverAccentClass)
    : "";

  return (
    <Card
      className={cn(
        "rounded-2xl border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
        borderClass,
        hoverClass,
        className
      )}
    >
      {hasHeader ? (
        <CardHeader className={spacious ? "p-6 pb-4" : "pb-3"}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              {title ? (
                <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
                  {title}
                </CardTitle>
              ) : null}
              {description ? <CardDescription className="text-sm text-slate-600">{description}</CardDescription> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent
        className={cn(
          spacious ? (hasHeader ? "px-6 pb-6 pt-0" : "p-6") : !hasHeader && "pt-5",
          contentClassName
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
