import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function SetariPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Setari" />
      <SectionCard
        title="Configurare cont"
        description="Zona de setari va fi extinsa in iteratiile urmatoare."
      >
        <p className="text-sm text-slate-600">
          Placeholder pentru preferinte organizatie, utilizatori si notificari.
        </p>
      </SectionCard>
    </div>
  );
}
