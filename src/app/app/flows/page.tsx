import { prisma } from "@/server/db";
import { getCurrentOrgId } from "@/server/authMode";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default async function FlowsPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;

  const flows = await prisma.flow.findMany({
    where: { orgId },
    include: { nodes: true, edges: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Fluxuri" />
      <SectionCard
        title="Lista fluxuri"
        description="Configureaza fluxurile de intrare, rutare, SLA, escaladare si dovada."
      >
        {flows.length === 0 ? (
          <p className="text-slate-600">Niciun flux. Creeaza un flux din API (POST /api/flows).</p>
        ) : (
          <ul className="space-y-2">
            {flows.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
              >
                <div>
                  <span className="font-medium">{f.name}</span>
                  {f.isActive && (
                    <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      Activ
                    </span>
                  )}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {f.nodes.length} noduri, {f.edges.length} muchii
                  </span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/app/flows/${f.id}`}>Deschide</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
