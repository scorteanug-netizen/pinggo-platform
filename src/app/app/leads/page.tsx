import { LeadsTable } from "./LeadsTable";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function LeadsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Leaduri" />
      <SectionCard
        title="Lista leaduri"
        description="Toate leadurile din organizatia ta. Filtreaza dupa status sau data."
      >
        <LeadsTable />
      </SectionCard>
    </div>
  );
}
