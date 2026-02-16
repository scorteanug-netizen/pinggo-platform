import { LeadsTable } from "./LeadsTable";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { getCurrentOrgId } from "@/server/authMode";

export default async function LeadsPage() {
  const workspaceId = await getCurrentOrgId();

  if (!workspaceId) {
    return (
      <div className="space-y-5">
        <PageHeader title="Leaduri" />
        <SectionCard title="Lista leaduri" description="Toate leadurile din organizatia ta.">
          <p className="text-sm text-slate-600">Nu exista workspace activ.</p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Leaduri" />
      <SectionCard
        title="Lista leaduri"
        description="Toate leadurile din organizatia ta. Filtreaza dupa status sau data."
      >
        <LeadsTable workspaceId={workspaceId} />
      </SectionCard>
    </div>
  );
}
