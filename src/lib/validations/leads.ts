import { z } from "zod";

export const webhookIntakeSchema = z.object({
  externalId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export const proofEventSchema = z.object({
  type: z.enum([
    "message_sent",
    "reply_received",
    "meeting_created",
    "call_logged",
    "manual_proof_note",
  ]),
  payload: z.record(z.unknown()).optional(),
});

export const escalateSchema = z.object({
  level: z.enum(["REMINDER", "REASSIGN", "MANAGER_ALERT"]),
  payload: z.record(z.unknown()).optional(),
});

const leadStatusSchema = z.enum(["NEW", "OPEN", "QUALIFIED", "NOT_QUALIFIED", "SPAM", "ARCHIVED"]);
const leadSourceSchema = z.enum(["WEBHOOK", "FORM", "CRM", "WHATSAPP", "API", "MANUAL", "IMPORT", "EMAIL"]);
const leadSortSchema = z.enum(["createdAt", "updatedAt", "status", "sourceType"]);
const leadDirSchema = z.enum(["asc", "desc"]);
const nonEmptyStringSchema = z.string().trim().min(1);
const dateStringSchema = z
  .string()
  .trim()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value)),
    "Invalid date"
  );

export const listLeadsQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
    sort: leadSortSchema.optional(),
    dir: leadDirSchema.optional(),
    status: leadStatusSchema.optional(),
    ownerId: nonEmptyStringSchema.optional(),
    source: leadSourceSchema.optional(),
    breach: z.enum(["true", "false"]).optional(),
    dateFrom: dateStringSchema.optional(),
    dateTo: dateStringSchema.optional(),
    ownerUserId: nonEmptyStringSchema.optional(),
    sourceType: leadSourceSchema.optional(),
    breached: z.enum(["true", "false"]).optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    orgId: z.string().optional(),
  })
  .transform((query) => ({
    q: query.q?.trim() ? query.q.trim() : undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 25,
    sort: query.sort ?? "createdAt",
    dir: query.dir ?? "desc",
    status: query.status,
    ownerId: query.ownerId ?? query.ownerUserId,
    source: query.source ?? query.sourceType,
    breach: query.breach ?? query.breached,
    dateFrom: query.dateFrom ?? query.from,
    dateTo: query.dateTo ?? query.to,
  }));

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
