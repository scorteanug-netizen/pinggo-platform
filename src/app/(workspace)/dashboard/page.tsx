import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle, Clock, LayoutDashboard, TrendingUp, Users } from "lucide-react";

import {
  DashboardCustomizableLayout,
  type DashboardWidgetRenderItem,
} from "@/components/dashboard/DashboardCustomizableLayout";
import { ActivityFeedSection } from "@/components/dashboard/ActivityFeedSection";
import { ActivityFeedSkeleton } from "@/components/dashboard/ActivityFeed";
import { AutopilotStatusCard, AutopilotStatusCardSkeleton } from "@/components/dashboard/AutopilotStatusCard";
import { BreachAlertsSection } from "@/components/dashboard/BreachAlertsSection";
import { ConversionFunnelSection } from "@/components/dashboard/ConversionFunnelSection";
import { ConversionFunnelSkeleton } from "@/components/dashboard/ConversionFunnel";
import { LeadsTrendChartSection } from "@/components/dashboard/LeadsTrendChartSection";
import { LeadsTrendChartSkeleton } from "@/components/dashboard/LeadsTrendChart";
import { QuickActionsPanel } from "@/components/dashboard/QuickActionsPanel";
import { RecentLeadsSection } from "@/components/dashboard/RecentLeadsSection";
import { RecentLeadsTableSkeleton } from "@/components/dashboard/RecentLeadsTable";
import {
  TeamPerformanceSection,
  TeamPerformanceSectionSkeleton,
} from "@/components/dashboard/TeamPerformanceSection";
import { TodayBookingsSection } from "@/components/dashboard/TodayBookingsSection";
import { TodayBookingsCardSkeleton } from "@/components/dashboard/TodayBookingsCard";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";

export default async function DashboardPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }

  const permissions = context.permissions;
  const canViewLeads = Boolean(permissions?.canViewLeads);
  const canViewTeamPerformance = canViewLeads && context.appRole !== "AGENT";

  // DUMMY DATA - Task-uri viitoare vor aduce date reale
  const stats = {
    totalLeads: 247,
    newToday: 18,
    qualified: 89,
    avgResponseTime: "8m",
  };

  const widgets: DashboardWidgetRenderItem[] = [
    {
      id: "stats_cards",
      node: (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <StatCard icon={Users} label="Total Leaduri" value={stats.totalLeads} accent="orange" spacious />

          <StatCard
            icon={TrendingUp}
            label="Leaduri Noi Azi"
            value={stats.newToday}
            helper="+12% vs ieri"
            accent="orange"
            spacious
          />

          <StatCard
            icon={CheckCircle}
            label="Calificate"
            value={stats.qualified}
            helper="36% conversion"
            accent="violet"
            spacious
          />

          <StatCard
            icon={Clock}
            label="Timp Mediu Răspuns"
            value={stats.avgResponseTime}
            helper="Target: <15m"
            accent="orange"
            spacious
          />
        </div>
      ),
    },
    {
      id: "quick_actions",
      node: <QuickActionsPanel permissions={permissions} />,
    },
  ];

  if (canViewLeads) {
    widgets.push({
      id: "breach_alerts",
      node: (
        <BreachAlertsSection
          workspaceId={context.workspaceId}
          viewerRole={context.membershipRole}
          viewerUserId={context.userId}
        />
      ),
    });

    widgets.push({
      id: "leads_trend",
      node: (
        <Suspense fallback={<LeadsTrendChartSkeleton />}>
          <LeadsTrendChartSection
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });

    if (canViewTeamPerformance) {
      widgets.push({
        id: "team_performance",
        node: (
          <Suspense fallback={<TeamPerformanceSectionSkeleton />}>
            <TeamPerformanceSection
              workspaceId={context.workspaceId}
              viewerRole={context.membershipRole}
              viewerUserId={context.userId}
            />
          </Suspense>
        ),
      });
    }

    widgets.push({
      id: "conversion_funnel",
      node: (
        <Suspense fallback={<ConversionFunnelSkeleton />}>
          <ConversionFunnelSection
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });

    widgets.push({
      id: "recent_leads",
      node: (
        <Suspense fallback={<RecentLeadsTableSkeleton />}>
          <RecentLeadsSection
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });

    widgets.push({
      id: "activity_feed",
      node: (
        <Suspense fallback={<ActivityFeedSkeleton />}>
          <ActivityFeedSection
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });

    widgets.push({
      id: "autopilot_status",
      node: (
        <Suspense fallback={<AutopilotStatusCardSkeleton />}>
          <AutopilotStatusCard
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });

    widgets.push({
      id: "today_bookings",
      node: (
        <Suspense fallback={<TodayBookingsCardSkeleton />}>
          <TodayBookingsSection
            workspaceId={context.workspaceId}
            viewerRole={context.membershipRole}
            viewerUserId={context.userId}
          />
        </Suspense>
      ),
    });
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title="Dashboard"
        subtitle="Control tower pentru monitorizare si executie."
        icon={LayoutDashboard}
        iconBgColor="bg-orange-50"
        iconColor="text-orange-600"
      />

      <DashboardCustomizableLayout userRole={context.appRole} widgets={widgets} />
    </div>
  );
}
