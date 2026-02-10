import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";

export default async function DashboardPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  const permissions = context.permissions;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="Control tower pentru monitorizare si executie."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {permissions?.canViewLeads ? (
          <SectionCard
            title="Leaduri"
            description="Vezi lista de leaduri si statusul operational."
          >
            <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
              <Link href="/leads">Deschide leaduri</Link>
            </Button>
          </SectionCard>
        ) : null}

        {permissions?.canViewFlows ? (
          <SectionCard
            title="Fluxuri"
            description="Configureaza si urmareste fluxurile active."
          >
            <Button
              asChild
              variant="outline"
              className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
            >
              <Link href="/flows">Deschide fluxuri</Link>
            </Button>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
