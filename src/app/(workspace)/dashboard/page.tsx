import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Users, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";

export default async function DashboardPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  const permissions = context.permissions;

  // DUMMY DATA - Task-uri viitoare vor aduce date reale
  const stats = {
    totalLeads: 247,
    newToday: 18,
    qualified: 89,
    avgResponseTime: "8m",
  };

  return (
    <div className="space-y-12">
      {/* Header cu icon */}
      <PageHeader
        title="Dashboard"
        subtitle="Control tower pentru monitorizare si executie."
        icon={LayoutDashboard}
      />

      {/* Stat Cards - DUMMY DATA */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Leaduri"
          value={stats.totalLeads}
          spacious
        />

        <StatCard
          icon={TrendingUp}
          label="Leaduri Noi Azi"
          value={stats.newToday}
          helper="+12% vs ieri"
          spacious
        />

        <StatCard
          icon={CheckCircle}
          label="Calificate"
          value={stats.qualified}
          helper="36% conversion"
          spacious
        />

        <StatCard
          icon={Clock}
          label="Timp Mediu Răspuns"
          value={stats.avgResponseTime}
          helper="Target: <15m"
          spacious
        />
      </div>

      {/* Navigation Section Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {permissions?.canViewLeads ? (
          <SectionCard
            title="Leaduri"
            description="Vezi lista de leaduri si statusul operational."
            borderColor="orange"
            spacious
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
            borderColor="orange"
            spacious
          >
            <Button
              asChild
              variant="outline"
              className="border-orange-200 text-orange-700 font-extrabold hover:bg-orange-50 hover:text-orange-800"
            >
              <Link href="/flows">Deschide fluxuri</Link>
            </Button>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
