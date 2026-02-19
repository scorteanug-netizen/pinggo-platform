import Link from "next/link";
import { LeadSourceType, LeadStatus, MembershipRole, MembershipStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { Users, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { listLeadsQuerySchema, type ListLeadsQuery } from "@/lib/validations/leads";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { prisma } from "@/server/db";
import { detectEscalations } from "@/server/services/escalationService";
import { queryLeads } from "@/server/services/leadService";
import { detectBreaches } from "@/server/services/slaService";
import { LeadsTable, type LeadsTableRow } from "./LeadsTable";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "NEW", label: "Nou" },
  { value: "OPEN", label: "Deschis" },
  { value: "QUALIFIED", label: "Calificat" },
  { value: "NOT_QUALIFIED", label: "Neeligibil" },
  { value: "SPAM", label: "Spam" },
  { value: "ARCHIVED", label: "Arhivat" },
];

const STAGE_OPTIONS = [
  { value: "new", label: "Nou" },
  { value: "contacted", label: "Contactate" },
  { value: "qualified", label: "Calificate" },
  { value: "booked", label: "Programate" },
  { value: "closing", label: "Closing" },
] as const;

const SOURCE_OPTIONS: Array<{ value: LeadSourceType; label: string }> = [
  { value: "WEBHOOK", label: "Webhook" },
  { value: "FORM", label: "Formular" },
  { value: "CRM", label: "CRM" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MANUAL", label: "Manual" },
  { value: "API", label: "API" },
  { value: "IMPORT", label: "Import" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nou",
  OPEN: "Deschis",
  QUALIFIED: "Calificat",
  NOT_QUALIFIED: "Neeligibil",
  SPAM: "Spam",
  ARCHIVED: "Arhivat",
  WON: "Câștigat",
  LOST: "Pierdut",
  INCOMPLETE: "Incomplet",
};

const SOURCE_LABEL: Record<LeadSourceType, string> = {
  WEBHOOK: "Webhook",
  FORM: "Formular",
  CRM: "CRM",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MANUAL: "Manual",
  API: "API",
  IMPORT: "Import",
  FACEBOOK: "Facebook",
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDateFilter(value: string | undefined, mode: "from" | "to") {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return mode === "from"
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(`${value}T23:59:59.999Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function buildLeadsHref(query: ListLeadsQuery, overrides: Partial<ListLeadsQuery> = {}) {
  const nextQuery = {
    ...query,
    ...overrides,
  };
  const urlQuery = new URLSearchParams();

  if (nextQuery.q) urlQuery.set("q", nextQuery.q);
  if (nextQuery.stage) urlQuery.set("stage", nextQuery.stage);
  if (nextQuery.status) urlQuery.set("status", nextQuery.status);
  if (nextQuery.ownerId) urlQuery.set("ownerId", nextQuery.ownerId);
  if (nextQuery.source) urlQuery.set("source", nextQuery.source);
  if (nextQuery.breach) urlQuery.set("breach", nextQuery.breach);
  if (nextQuery.dateFrom) urlQuery.set("dateFrom", nextQuery.dateFrom);
  if (nextQuery.dateTo) urlQuery.set("dateTo", nextQuery.dateTo);
  if (nextQuery.page > 1) urlQuery.set("page", `${nextQuery.page}`);
  if (nextQuery.pageSize !== 25) urlQuery.set("pageSize", `${nextQuery.pageSize}`);
  if (nextQuery.sort !== "createdAt") urlQuery.set("sort", nextQuery.sort);
  if (nextQuery.dir !== "desc") urlQuery.set("dir", nextQuery.dir);

  return `/leads${urlQuery.toString() ? `?${urlQuery.toString()}` : ""}`;
}

function getVisiblePages(currentPage: number, totalPages: number) {
  const unique = new Set<number>([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  return [...unique].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  if (!context.permissions.canViewLeads) {
    redirect("/dashboard");
  }
  const { workspaceId, membershipRole, userId } = context;

  const params = await searchParams;
  const parsedQuery = listLeadsQuerySchema.safeParse({
    q: getParamValue(params.q),
    page: getParamValue(params.page),
    pageSize: getParamValue(params.pageSize),
    sort: getParamValue(params.sort),
    dir: getParamValue(params.dir),
    stage: getParamValue(params.stage),
    status: getParamValue(params.status),
    ownerId: getParamValue(params.ownerId),
    source: getParamValue(params.source),
    breach: getParamValue(params.breach),
    dateFrom: getParamValue(params.dateFrom),
    dateTo: getParamValue(params.dateTo),
    ownerUserId: getParamValue(params.ownerUserId),
    sourceType: getParamValue(params.sourceType),
    breached: getParamValue(params.breached),
    from: getParamValue(params.from),
    to: getParamValue(params.to),
  });

  const baseQuery = parsedQuery.success ? parsedQuery.data : listLeadsQuerySchema.parse({});
  const pageSize = PAGE_SIZE_OPTIONS.includes(baseQuery.pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? baseQuery.pageSize
    : 25;
  const ownerId = membershipRole === MembershipRole.AGENT ? userId : baseQuery.ownerId;

  const activeQuery: ListLeadsQuery = {
    ...baseQuery,
    ownerId,
    pageSize,
  };

  await detectEscalations({ workspaceId });
  await detectBreaches({ workspaceId });

  const [owners, leadsResult] = await Promise.all([
    prisma.membership.findMany({
      where: {
        workspaceId,
        status: MembershipStatus.ACTIVE,
        role: {
          in: [MembershipRole.AGENT, MembershipRole.MANAGER, MembershipRole.ADMIN, MembershipRole.OWNER],
        },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    queryLeads({
      workspaceId,
      viewerUserId: userId,
      viewerRole: membershipRole,
      q: activeQuery.q,
      page: activeQuery.page,
      pageSize: activeQuery.pageSize,
      sort: activeQuery.sort,
      dir: activeQuery.dir,
      stage: activeQuery.stage,
      status: activeQuery.status,
      ownerId: activeQuery.ownerId,
      source: activeQuery.source,
      breach: activeQuery.breach === "true" ? true : activeQuery.breach === "false" ? false : undefined,
      dateFrom: parseDateFilter(activeQuery.dateFrom, "from"),
      dateTo: parseDateFilter(activeQuery.dateTo, "to"),
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(leadsResult.totalCount / leadsResult.pageSize));
  if (leadsResult.totalCount > 0 && leadsResult.items.length === 0 && leadsResult.page > totalPages) {
    redirect(buildLeadsHref(activeQuery, { page: totalPages }));
  }

  const flowIds = [
    ...new Set(
      leadsResult.items.flatMap((lead) =>
        lead.slaStageInstances.map((instance) => instance.flowId)
      )
    ),
  ];
  const stageKeys = [
    ...new Set(
      leadsResult.items.flatMap((lead) =>
        lead.slaStageInstances.map((instance) => instance.stageKey)
      )
    ),
  ];
  const stageDefinitions =
    flowIds.length > 0 && stageKeys.length > 0
      ? await prisma.sLAStageDefinition.findMany({
          where: {
            flowId: { in: flowIds },
            key: { in: stageKeys },
          },
          select: {
            flowId: true,
            key: true,
            name: true,
          },
        })
      : [];

  const stageMap = new Map(
    stageDefinitions.map((definition) => [
      `${definition.flowId}:${definition.key}`,
      definition.name,
    ])
  );

  const tableRows: LeadsTableRow[] = leadsResult.items.map((lead) => {
    const runningStage = lead.slaStageInstances.find((stage) => stage.status === "RUNNING");
    const hasBreachedStage = lead.slaStageInstances.some((stage) => stage.status === "BREACHED");

    const leadLabel =
      lead.identity?.name ||
      lead.identity?.email ||
      lead.identity?.phone ||
      lead.identity?.company ||
      lead.externalId ||
      lead.id;

    const currentStageLabel = runningStage
      ? stageMap.get(`${runningStage.flowId}:${runningStage.stageKey}`) ?? runningStage.stageKey
      : "-";

    return {
      id: lead.id,
      lead: leadLabel,
      company: lead.identity?.company || "-",
      sourceType: SOURCE_LABEL[lead.sourceType],
      owner: lead.ownerUser?.name || lead.ownerUser?.email || "-",
      currentStage: currentStageLabel,
      nextDueAt: runningStage ? formatDateTime(runningStage.dueAt) : "-",
      status: STATUS_LABEL[lead.status],
      breached: hasBreachedStage,
    };
  });

  const ownerOptions = owners
    .filter((membership) =>
      membershipRole === MembershipRole.AGENT ? membership.user.id === userId : true
    )
    .map((membership) => ({
      id: membership.user.id,
      label: membership.user.name?.trim() || membership.user.email,
      email: membership.user.email,
    }));

  const exportQuery = new URLSearchParams();
  if (activeQuery.q) exportQuery.set("q", activeQuery.q);
  if (activeQuery.stage) exportQuery.set("stage", activeQuery.stage);
  if (activeQuery.status) exportQuery.set("status", activeQuery.status);
  if (activeQuery.ownerId) exportQuery.set("ownerId", activeQuery.ownerId);
  if (activeQuery.source) exportQuery.set("source", activeQuery.source);
  if (activeQuery.breach) exportQuery.set("breach", activeQuery.breach);
  if (activeQuery.dateFrom) exportQuery.set("dateFrom", activeQuery.dateFrom);
  if (activeQuery.dateTo) exportQuery.set("dateTo", activeQuery.dateTo);
  if (activeQuery.sort !== "createdAt") exportQuery.set("sort", activeQuery.sort);
  if (activeQuery.dir !== "desc") exportQuery.set("dir", activeQuery.dir);
  const exportHref = `/api/leads/export.csv${
    exportQuery.toString() ? `?${exportQuery.toString()}` : ""
  }`;

  const startRow = leadsResult.totalCount === 0 ? 0 : (leadsResult.page - 1) * leadsResult.pageSize + 1;
  const endRow =
    leadsResult.totalCount === 0
      ? 0
      : Math.min(leadsResult.page * leadsResult.pageSize, leadsResult.totalCount);
  const visiblePages = getVisiblePages(leadsResult.page, totalPages);

  // DUMMY DATA - Task-uri viitoare vor aduce date reale
  const stats = {
    totalLeads: leadsResult.totalCount,
    newToday: 18,
    avgTTFT: "8m 32s",
    activeBreaches: tableRows.filter((row) => row.breached).length,
  };

  return (
    <div className="space-y-12">
      {/* Header cu icon */}
      <PageHeader
        title="Leaduri"
        subtitle="Tabel operational cu cautare globala, filtre, paginare si export CSV."
        icon={Users}
        iconBgColor="bg-orange-50"
        iconColor="text-orange-600"
      />

      {/* Stat Cards - DUMMY DATA */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <StatCard
          icon={Users}
          label="Total Leaduri"
          value={stats.totalLeads}
          accent="orange"
        />

        <StatCard
          icon={TrendingUp}
          label="Noi Azi"
          value={stats.newToday}
          helper="+12% vs ieri"
          accent="orange"
        />

        <StatCard
          icon={Clock}
          label="TTFT Mediu"
          value={stats.avgTTFT}
          helper="Target: <15m"
          accent="orange"
        />

        <StatCard
          icon={AlertCircle}
          label="Breach-uri Active"
          value={stats.activeBreaches}
          helper="Necesită atenție"
          accent="red"
        />
      </div>

      <SectionCard
        title="Filtre"
        description="Ajusteaza criteriile si aplica pentru a rafina lista de leaduri."
        borderColor="orange"
      >
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <input type="hidden" name="page" value="1" />
          {activeQuery.sort !== "createdAt" ? <input type="hidden" name="sort" value={activeQuery.sort} /> : null}
          {activeQuery.dir !== "desc" ? <input type="hidden" name="dir" value={activeQuery.dir} /> : null}

          <label className="space-y-1 text-xs text-slate-600 md:col-span-2 xl:col-span-8">
            <span>Cautare globala</span>
            <Input
              type="search"
              name="q"
              defaultValue={activeQuery.q ?? ""}
              placeholder="Nume, email, telefon, companie sau externalId"
              className="h-10"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Etapa</span>
            <select
              name="stage"
              defaultValue={activeQuery.stage ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              <option value="">Toate</option>
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Status</span>
            <select
              name="status"
              defaultValue={activeQuery.status ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              <option value="">Toate</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Owner</span>
            <select
              name="ownerId"
              defaultValue={activeQuery.ownerId ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              <option value="">Toti</option>
              {ownerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Sursa</span>
            <select
              name="source"
              defaultValue={activeQuery.source ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              <option value="">Toate</option>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Breach</span>
            <select
              name="breach"
              defaultValue={activeQuery.breach ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              <option value="">Toate</option>
              <option value="true">Da</option>
              <option value="false">Nu</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>De la</span>
            <input
              type="date"
              name="dateFrom"
              defaultValue={activeQuery.dateFrom ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Pana la</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={activeQuery.dateTo ?? ""}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            />
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>Randuri / pagina</span>
            <select
              name="pageSize"
              defaultValue={`${activeQuery.pageSize}`}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-8">
            <Button type="submit" className="bg-orange-500 text-white hover:bg-orange-600">
              Aplica filtre
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/leads">Reset</Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href={exportHref}>Export CSV</a>
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Lista leaduri"
        description="Click pe rand pentru detalii lead si timeline complet."
        borderColor="orange"
      >
        {tableRows.length === 0 ? (
          <p className="text-sm text-slate-600">Nu exista leaduri pentru filtrele selectate.</p>
        ) : (
          <>
            <LeadsTable rows={tableRows} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                Afisare {startRow}-{endRow} din {leadsResult.totalCount} leaduri
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {leadsResult.page > 1 ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={buildLeadsHref(activeQuery, { page: leadsResult.page - 1 })}>
                      Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                )}

                {visiblePages.map((pageNumber) =>
                  pageNumber === leadsResult.page ? (
                    <span
                      key={pageNumber}
                      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-extrabold text-orange-700"
                    >
                      {pageNumber}
                    </span>
                  ) : (
                    <Button key={pageNumber} type="button" variant="outline" size="sm" asChild>
                      <Link href={buildLeadsHref(activeQuery, { page: pageNumber })}>{pageNumber}</Link>
                    </Button>
                  )
                )}

                {leadsResult.page < totalPages ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href={buildLeadsHref(activeQuery, { page: leadsResult.page + 1 })}>
                      Urmator
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    Urmator
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
