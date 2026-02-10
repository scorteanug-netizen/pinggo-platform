import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
  className?: string;
  valueClassName?: string;
};

export function StatCard({ label, value, helper, className, valueClassName }: StatCardProps) {
  return (
    <Card className={cn("rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]", className)}>
      <CardContent className="space-y-1 p-5">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className={cn("text-2xl font-semibold text-slate-900", valueClassName)}>{value}</p>
        {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

