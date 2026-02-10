import { z } from "zod";

const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Ora invalida. Foloseste formatul HH:mm.");

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  start: hhmmSchema,
  end: hhmmSchema,
});

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone este obligatoriu.")
  .refine(
    (timezone) => {
      try {
        Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Timezone invalid." }
  );

export const businessHoursScheduleSchema = z.object({
  mon: dayScheduleSchema,
  tue: dayScheduleSchema,
  wed: dayScheduleSchema,
  thu: dayScheduleSchema,
  fri: dayScheduleSchema,
  sat: dayScheduleSchema,
  sun: dayScheduleSchema,
});

export const updateWorkspaceSettingsSchema = z.object({
  workspaceName: z.string().trim().min(1, "Numele workspace-ului este obligatoriu.").max(120),
  businessHoursEnabled: z.boolean(),
  timezone: timezoneSchema,
  defaultFlowId: z.string().trim().min(1).nullable(),
  schedule: businessHoursScheduleSchema,
});

export type UpdateWorkspaceSettingsPayload = z.infer<typeof updateWorkspaceSettingsSchema>;
