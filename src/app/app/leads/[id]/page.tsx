import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentOrgId } from "@/server/authMode";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) notFound();
  const { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, orgId },
    include: {
      identity: true,
      slaClocks: true,
      proofEvents: { orderBy: { createdAt: "desc" } },
      escalationEvents: { orderBy: { createdAt: "desc" } },
      assignment: { include: { user: true } },
    },
  });
  if (!lead) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Lead: {lead.identity?.name ?? lead.identity?.email ?? lead.id.slice(0, 8)}
        </h1>
        <Button variant="outline" asChild>
          <Link href="/app/leads">Inapoi la lista</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Identitate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Nume: {lead.identity?.name ?? "-"}</p>
            <p>Email: {lead.identity?.email ?? "-"}</p>
            <p>Telefon: {lead.identity?.phone ?? "-"}</p>
            <p>Companie: {lead.identity?.company ?? "-"}</p>
            <p>Status: {lead.status}</p>
            <p>Sursa: {lead.sourceType}</p>
            <p>Creat: {new Date(lead.createdAt).toLocaleString("ro-RO")}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader>
            <CardTitle className="text-xl">Cronometre SLA</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.slaClocks.length === 0 ? (
              <p className="text-muted-foreground text-sm">Niciun cronometru.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lead.slaClocks.map((c) => (
                  <li key={c.id}>
                    {c.status} - termen: {new Date(c.deadlineAt).toLocaleString("ro-RO")}
                    {c.stoppedAt && ` - oprit: ${new Date(c.stoppedAt).toLocaleString("ro-RO")}`}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle className="text-xl">Timeline (dovezi si escaladari)</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.proofEvents.length === 0 && lead.escalationEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Niciun eveniment.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[
                ...lead.proofEvents.map((e) => ({
                  type: "Dovada",
                  label: e.type,
                  at: e.createdAt,
                })),
                ...lead.escalationEvents.map((e) => ({
                  type: "Escaladare",
                  label: e.level,
                  at: e.createdAt,
                })),
              ]
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .map((e, i) => (
                  <li key={i}>
                    <strong>{e.type}</strong>: {e.label} - {new Date(e.at).toLocaleString("ro-RO")}
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
