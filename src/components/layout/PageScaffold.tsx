import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PageScaffoldProps = {
  title: string;
  subtitle: string;
  cardTitle: string;
  cardDescription: string;
  children?: React.ReactNode;
};

export function PageScaffold({
  title,
  subtitle,
  cardTitle,
  cardDescription,
  children,
}: PageScaffoldProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{cardTitle}</CardTitle>
          <CardDescription className="text-slate-600">{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {children ?? "Pagina este pregatita la nivel de layout. Logica urmeaza."}
        </CardContent>
      </Card>
    </div>
  );
}
