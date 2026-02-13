import { MembershipRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { LeadsTrendChart, type LeadsTrendPoint } from "./LeadsTrendChart";

const WEEKDAY_LABELS = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sam"] as const;

type LeadsTrendChartSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

function toDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfUtcDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfUtcDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function isQualifiedStatusChange(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const status = (payload as { toStatus?: unknown }).toStatus;
  return status === "QUALIFIED";
}

function buildSeedPoints(totalDays: number) {
  const todayEnd = endOfUtcDay(new Date());
  const start = startOfUtcDay(
    new Date(todayEnd.getTime() - (totalDays - 1) * 24 * 60 * 60 * 1000)
  );

  const points: LeadsTrendPoint[] = [];
  const map = new Map<string, LeadsTrendPoint>();

  for (let offset = 0; offset < totalDays; offset += 1) {
    const day = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const key = toDateKey(day);
    const point: LeadsTrendPoint = {
      date: WEEKDAY_LABELS[day.getUTCDay()],
      newLeads: 0,
      qualified: 0,
      booked: 0,
    };
    points.push(point);
    map.set(key, point);
  }

  return {
    from: start,
    to: todayEnd,
    points,
    map,
  };
}

export async function LeadsTrendChartSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: LeadsTrendChartSectionProps) {
  const { from, to, points, map } = buildSeedPoints(7);

  const leadOwnerScope =
    viewerRole === MembershipRole.AGENT ? { ownerUserId: viewerUserId } : {};
  const eventLeadScope =
    viewerRole === MembershipRole.AGENT ? { lead: { ownerUserId: viewerUserId } } : {};

  const [newLeads, statusChanges, bookedEvents] = await Promise.all([
    prisma.lead.findMany({
      where: {
        workspaceId,
        createdAt: { gte: from, lte: to },
        ...leadOwnerScope,
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: "status_changed",
        createdAt: { gte: from, lte: to },
        ...eventLeadScope,
      },
      select: {
        createdAt: true,
        payload: true,
      },
    }),
    prisma.leadEvent.findMany({
      where: {
        workspaceId,
        type: "meeting_created",
        createdAt: { gte: from, lte: to },
        ...eventLeadScope,
      },
      select: {
        createdAt: true,
      },
    }),
  ]);

  for (const lead of newLeads) {
    const point = map.get(toDateKey(lead.createdAt));
    if (point) {
      point.newLeads += 1;
    }
  }

  for (const event of statusChanges) {
    if (!isQualifiedStatusChange(event.payload)) {
      continue;
    }
    const point = map.get(toDateKey(event.createdAt));
    if (point) {
      point.qualified += 1;
    }
  }

  for (const event of bookedEvents) {
    const point = map.get(toDateKey(event.createdAt));
    if (point) {
      point.booked += 1;
    }
  }

  return <LeadsTrendChart data={points} />;
}
