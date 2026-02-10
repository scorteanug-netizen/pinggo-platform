import { z } from "zod";

export const createFlowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  workspaceId: z.string().trim().min(1).optional(),
});
