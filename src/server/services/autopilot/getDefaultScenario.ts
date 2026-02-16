import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ensureDefaultScenario } from "./ensureDefaultScenario";

type TxOrClient = Prisma.TransactionClient | typeof prisma;

/**
 * Returns the default AutopilotScenario for a workspace,
 * creating one if necessary.
 *
 * Accepts an optional transaction client as first argument.
 *
 * Call signatures:
 *   getDefaultScenario(workspaceId)
 *   getDefaultScenario(tx, workspaceId)
 */
export async function getDefaultScenario(
  txOrWorkspaceId: TxOrClient | string,
  workspaceIdOrUndefined?: string,
) {
  if (typeof txOrWorkspaceId === "string") {
    return ensureDefaultScenario(txOrWorkspaceId);
  }
  return ensureDefaultScenario(txOrWorkspaceId, workspaceIdOrUndefined!);
}
