import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishFlowButton } from "./PublishFlowButton";
import { getCurrentOrgId } from "@/server/authMode";

export default async function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) notFound();
  const { id } = await params;
  const flow = await prisma.flow.findFirst({
    where: { id, orgId },
    include: { nodes: true, edges: true },
  });
  if (!flow) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{flow.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/flows">Inapoi la lista</Link>
          </Button>
          {!flow.isActive && <PublishFlowButton flowId={flow.id} />}
        </div>
      </div>

      {flow.isActive && (
        <p className="rounded bg-green-50 p-2 text-sm text-green-800">Acest flux este activ.</p>
      )}

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle className="text-xl">Noduri</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Editor vizual (drag-and-drop) va fi adaugat ulterior. Momentan nodurile se gestioneaza prin API.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {flow.nodes.map((n) => (
              <li key={n.id}>
                {n.type} (id: {n.id.slice(0, 8)})
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle className="text-xl">Muchii</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {flow.edges.length === 0 ? (
              <li className="text-muted-foreground">Niciuna.</li>
            ) : (
              flow.edges.map((e) => (
                <li key={e.id}>
                  {e.fromNodeId.slice(0, 8)} -&gt; {e.toNodeId.slice(0, 8)}
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
