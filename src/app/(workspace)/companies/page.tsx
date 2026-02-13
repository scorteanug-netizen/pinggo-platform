import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { CreateCompanyForm } from "./CreateCompanyForm";
import { CompanyStatusButton } from "./DeleteCompanyButton";

type SearchParams = Record<string, string | string[] | undefined>;

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("ro-RO");
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ro-RO");
}

function getLatestDate(a: Date | null | undefined, b: Date | null | undefined) {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewCompanies) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const showDisabled = getParamValue(params.showDisabled) === "1";
  const canManageCompanyStatus = context.globalRole === "SUPER_ADMIN";
  const includeDisabled = canManageCompanyStatus && showDisabled;

  const companies = await prisma.workspace.findMany({
    where: includeDisabled ? undefined : { disabledAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      disabledAt: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const companyIds = companies.map((company) => company.id);
  const [leadCounts, leadUpdates, leadEventUpdates] =
    companyIds.length > 0
      ? await Promise.all([
          prisma.lead.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: companyIds } },
            _count: { _all: true },
          }),
          prisma.lead.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: companyIds } },
            _max: { updatedAt: true },
          }),
          prisma.leadEvent.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: companyIds } },
            _max: { createdAt: true },
          }),
        ])
      : [[], [], []];

  const leadCountByWorkspaceId = new Map(leadCounts.map((item) => [item.workspaceId, item._count._all]));
  const leadUpdatedAtByWorkspaceId = new Map(
    leadUpdates.map((item) => [item.workspaceId, item._max.updatedAt])
  );
  const leadEventUpdatedAtByWorkspaceId = new Map(
    leadEventUpdates.map((item) => [item.workspaceId, item._max.createdAt])
  );

  // Calculate stats from real data
  const stats = {
    totalCompanies: companies.length,
    totalUsers: companies.reduce((sum, company) => sum + company._count.memberships, 0),
    activeCompanies: companies.filter((company) => !company.disabledAt).length,
  };

  return (
    <div className="space-y-12">
      {/* Header cu icon */}
      <PageHeader
        title="Companii"
        subtitle="Creeaza compania prima data, apoi invita userii in compania potrivita."
        icon={Building2}
        iconBgColor="bg-orange-50"
        iconColor="text-orange-600"
        actions={
          canManageCompanyStatus ? (
            <Button asChild variant={showDisabled ? "default" : "outline"} size="sm">
              <Link href={showDisabled ? "/companies" : "/companies?showDisabled=1"}>
                {showDisabled ? "Ascunde dezactivate" : "Arata dezactivate"}
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Stat Cards - REAL DATA */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          icon={Building2}
          label="Total Companii"
          value={stats.totalCompanies}
          accent="orange"
        />

        <StatCard
          icon={Users}
          label="Total Useri"
          value={stats.totalUsers}
          accent="violet"
        />

        <StatCard
          icon={TrendingUp}
          label="Companii Active"
          value={stats.activeCompanies}
          helper={`${stats.totalCompanies - stats.activeCompanies} dezactivate`}
          accent="green"
        />
      </div>

      <SectionCard
        title="Creeaza companie"
        description="Doar SUPER_ADMIN poate crea companii noi."
        borderColor="orange"
      >
        <CreateCompanyForm />
      </SectionCard>

      <SectionCard
        title="Lista companii"
        description={
          includeDisabled
            ? "Vizualizare completa: companii active si dezactivate."
            : "Companiile active din platforma."
        }
        borderColor="orange"
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Companie</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Useri</th>
                <th className="px-3 py-2">Leaduri</th>
                <th className="px-3 py-2">Ultima activitate</th>
                <th className="px-3 py-2">Creata</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Actiuni</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-sm text-slate-500">
                    {includeDisabled ? "Nu exista companii." : "Nu exista companii active."}
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const lastLeadUpdatedAt = leadUpdatedAtByWorkspaceId.get(company.id) ?? null;
                  const lastLeadEventUpdatedAt = leadEventUpdatedAtByWorkspaceId.get(company.id) ?? null;
                  const lastActivity = getLatestDate(lastLeadUpdatedAt, lastLeadEventUpdatedAt);
                  const isDisabled = Boolean(company.disabledAt);

                  return (
                    <tr
                      key={company.id}
                      className="border-t border-slate-200 transition-colors duration-200 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 text-slate-800">{company.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant={isDisabled ? "gray" : "green"}>
                          {isDisabled ? "Dezactivata" : "Activa"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{company._count.memberships}</td>
                      <td className="px-3 py-2 text-slate-700">{leadCountByWorkspaceId.get(company.id) ?? 0}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDateTime(lastActivity)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(company.createdAt)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{company.id}</td>
                      <td className="px-3 py-2">
                        <CompanyStatusButton
                          workspaceId={company.id}
                          workspaceName={company.name}
                          isDisabled={isDisabled}
                          canManage={canManageCompanyStatus}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
