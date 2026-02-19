import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishFlowButton } from "./PublishFlowButton";
import { getCurrentOrgId } from "@/server/authMode";

export default async function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await getCurrentOrgId();
  if (!workspaceId) notFound();
  const { id } = await params;
  const flow = await prisma.flow.findFirst({
    where: { id, workspaceId },
  });
  if (!flow) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{flow.name}</h1>
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
    </div>
  );
}
