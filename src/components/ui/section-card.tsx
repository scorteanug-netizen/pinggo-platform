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
  borderColor?: "orange" | "none";
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

  const borderColorMap = {
    orange: "border-t-orange-500",
    none: "",
  };

  const borderClass = borderColor !== "none" ? `border-t-4 ${borderColorMap[borderColor]}` : "";
  const hoverClass = hover ? "hover:shadow-lg transition-shadow" : "";

  return (
    <Card className={cn("rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]", borderClass, hoverClass, className)}>
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
