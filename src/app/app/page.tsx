import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function AppDashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Bine ai venit in Pinggo. Alege o sectiune din meniu."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Leaduri"
          description="Vizualizeaza si gestioneaza leadurile."
        >
          <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
            <Link href="/app/leads">Vezi leaduri</Link>
          </Button>
        </SectionCard>
        <SectionCard
          title="Fluxuri"
          description="Configureaza fluxurile de lucru (intrare, SLA, dovada)."
        >
          <Button
            asChild
            variant="outline"
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          >
            <Link href="/app/flows">Vezi fluxuri</Link>
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}
