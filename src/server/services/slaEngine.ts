import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export async function breachOverdueSlas(now = new Date()) {
  const overdueStates = await prisma.sLAState.findMany({
    where: {
      stoppedAt: null,
      breachedAt: null,
      deadlineAt: {
        lte: now,
      },
    },
    select: {
      id: true,
      leadId: true,
      deadlineAt: true,
    },
  });

  const processed = overdueStates.length;
  let breachedCount = 0;

  for (const state of overdueStates) {
    const didBreach = await prisma.$transaction(async (tx) => {
      const updated = await tx.sLAState.updateMany({
        where: {
          id: state.id,
          stoppedAt: null,
          breachedAt: null,
        },
        data: {
          breachedAt: now,
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.eventLog.create({
        data: {
          leadId: state.leadId,
          eventType: "sla_breached",
          payload: {
            deadlineAt: state.deadlineAt.toISOString(),
            breachedAt: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return true;
    });

    if (didBreach) {
      breachedCount += 1;
    }
  }

  return {
    processed,
    breached: breachedCount,
  };
}

export async function stopSlaClock(leadId: string, reason: string, proofEventId?: string) {
  const stoppedAt = new Date();

  const didStop = await prisma.$transaction(async (tx) => {
    const updated = await tx.sLAState.updateMany({
      where: {
        leadId,
        stoppedAt: null,
      },
      data: {
        stoppedAt,
        stopReason: reason,
      },
    });

    if (updated.count === 0) {
      return false;
    }

    await tx.eventLog.create({
      data: {
        leadId,
        eventType: "sla_stopped",
        payload: {
          reason,
          proofEventId: proofEventId ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return true;
  });

  if (!didStop) {
    return { alreadyStopped: true as const };
  }

  return { alreadyStopped: false as const, stoppedAt };
}
