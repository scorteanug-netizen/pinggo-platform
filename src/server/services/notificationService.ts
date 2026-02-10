import { Prisma } from "@prisma/client";
import { prisma } from "../db";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

async function getUserIdByEmail(tx: TxOrClient, email: string) {
  const user = await tx.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getUnreadNotificationsCount(params: {
  workspaceId: string;
  email: string;
  tx?: TxOrClient;
}) {
  const tx = params.tx ?? prisma;
  const userId = await getUserIdByEmail(tx, params.email);
  if (!userId) return 0;

  return tx.notification.count({
    where: {
      workspaceId: params.workspaceId,
      readAt: null,
      userId,
    },
  });
}

export async function listNotificationsForUser(params: {
  workspaceId: string;
  email: string;
  limit?: number;
  tx?: TxOrClient;
}) {
  const tx = params.tx ?? prisma;
  const userId = await getUserIdByEmail(tx, params.email);
  if (!userId) return [];

  return tx.notification.findMany({
    where: {
      workspaceId: params.workspaceId,
      userId,
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
  });
}

export async function markNotificationsReadForUser(params: {
  workspaceId: string;
  email: string;
  tx?: TxOrClient;
}) {
  const tx = params.tx ?? prisma;
  const userId = await getUserIdByEmail(tx, params.email);
  if (!userId) return { count: 0 };

  const now = new Date();
  const result = await tx.notification.updateMany({
    where: {
      workspaceId: params.workspaceId,
      readAt: null,
      userId,
    },
    data: {
      readAt: now,
    },
  });

  return { count: result.count };
}
