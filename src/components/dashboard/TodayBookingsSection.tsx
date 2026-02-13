import { MembershipRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { TodayBookingsCard, type TodayBookingItem } from "./TodayBookingsCard";

type TodayBookingsSectionProps = {
  workspaceId: string;
  viewerRole: MembershipRole;
  viewerUserId: string;
};

function formatProvider(provider: string) {
  if (!provider) return "Programare";
  return provider
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Bucharest",
  }).format(value);
}

function getLeadDisplayName(lead: {
  id: string;
  externalId: string | null;
  identity: { name: string | null; email: string | null; phone: string | null; company: string | null } | null;
}) {
  return (
    lead.identity?.name ||
    lead.identity?.email ||
    lead.identity?.phone ||
    lead.identity?.company ||
    lead.externalId ||
    lead.id
  );
}

export async function TodayBookingsSection({
  workspaceId,
  viewerRole,
  viewerUserId,
}: TodayBookingsSectionProps) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      startAt: {
        gte: todayStart,
        lte: todayEnd,
      },
      lead: {
        workspaceId,
        ...(viewerRole === MembershipRole.AGENT ? { ownerUserId: viewerUserId } : {}),
      },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    take: 5,
    select: {
      id: true,
      provider: true,
      eventId: true,
      meetLink: true,
      startAt: true,
      lead: {
        select: {
          id: true,
          externalId: true,
          identity: {
            select: {
              name: true,
              email: true,
              phone: true,
              company: true,
            },
          },
        },
      },
    },
  });

  const rows: TodayBookingItem[] = bookings.map((booking) => ({
    id: booking.id,
    leadId: booking.lead.id,
    time: booking.startAt ? formatTime(booking.startAt) : "—",
    leadName: getLeadDisplayName(booking.lead),
    meetingType: formatProvider(booking.provider),
    status: booking.eventId || booking.meetLink ? "confirmed" : "pending",
  }));

  return <TodayBookingsCard bookings={rows} />;
}
