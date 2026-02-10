export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type BusinessHoursDay = {
  enabled: boolean;
  start: string;
  end: string;
};

export type BusinessHoursSchedule = Record<WeekdayKey, BusinessHoursDay>;

export type BusinessHoursConfig = {
  businessHoursEnabled: boolean;
  timezone: string;
  schedule: BusinessHoursSchedule;
};

export const DEFAULT_BUSINESS_HOURS_TIMEZONE = "Europe/Bucharest";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAY_FROM_INTL: Record<string, WeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

const DATE_TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timezone: string) {
  if (!DATE_TIME_FORMATTERS.has(timezone)) {
    DATE_TIME_FORMATTERS.set(
      timezone,
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hour12: false,
      })
    );
  }

  return DATE_TIME_FORMATTERS.get(timezone)!;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: WeekdayKey;
};

type LocalDateParts = Pick<ZonedParts, "year" | "month" | "day">;

export function isValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function createDefaultBusinessHoursSchedule(): BusinessHoursSchedule {
  return {
    mon: { enabled: true, start: "09:00", end: "18:00" },
    tue: { enabled: true, start: "09:00", end: "18:00" },
    wed: { enabled: true, start: "09:00", end: "18:00" },
    thu: { enabled: true, start: "09:00", end: "18:00" },
    fri: { enabled: true, start: "09:00", end: "18:00" },
    sat: { enabled: false, start: "09:00", end: "18:00" },
    sun: { enabled: false, start: "09:00", end: "18:00" },
  };
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(TIME_REGEX);
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return hours * 60 + minutes;
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = getDateTimeFormatter(timezone).formatToParts(date);
  const values: Partial<ZonedParts> = {};

  for (const part of parts) {
    if (part.type === "weekday") {
      values.weekday = WEEKDAY_FROM_INTL[part.value.toLowerCase().slice(0, 3)];
      continue;
    }
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
    weekday: values.weekday ?? "mon",
  };
}

function getTimezoneOffsetMs(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0
  );
  return utcTimestamp - date.getTime();
}

function zonedDateTimeToUtcDate(
  parts: LocalDateParts & { hour: number; minute: number; second?: number },
  timezone: string
) {
  const second = parts.second ?? 0;
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second, 0);
  const firstOffset = getTimezoneOffsetMs(new Date(utcGuess), timezone);
  let timestamp = utcGuess - firstOffset;
  const secondOffset = getTimezoneOffsetMs(new Date(timestamp), timezone);
  if (secondOffset !== firstOffset) {
    timestamp = utcGuess - secondOffset;
  }
  return new Date(timestamp);
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getWeekdayForLocalDate(parts: LocalDateParts, timezone: string): WeekdayKey {
  const probe = zonedDateTimeToUtcDate({ ...parts, hour: 12, minute: 0, second: 0 }, timezone);
  return getZonedParts(probe, timezone).weekday;
}

function nextAvailableDayStart(cursor: Date, config: BusinessHoursConfig, startOffsetDays: number) {
  const cursorParts = getZonedParts(cursor, config.timezone);
  const cursorDate: LocalDateParts = {
    year: cursorParts.year,
    month: cursorParts.month,
    day: cursorParts.day,
  };

  for (let offset = startOffsetDays; offset <= 14; offset += 1) {
    const dayDate = addLocalDays(cursorDate, offset);
    const weekday = getWeekdayForLocalDate(dayDate, config.timezone);
    const dayConfig = config.schedule[weekday];
    const startMinute = parseTimeToMinutes(dayConfig.start);
    const endMinute = parseTimeToMinutes(dayConfig.end);

    if (!dayConfig.enabled || startMinute === null || endMinute === null || endMinute <= startMinute) {
      continue;
    }

    return zonedDateTimeToUtcDate(
      {
        ...dayDate,
        hour: Math.floor(startMinute / 60),
        minute: startMinute % 60,
        second: 0,
      },
      config.timezone
    );
  }

  return new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeBusinessHoursSchedule(value: unknown): BusinessHoursSchedule {
  const defaults = createDefaultBusinessHoursSchedule();
  if (!isRecord(value)) return defaults;

  const normalized: BusinessHoursSchedule = { ...defaults };

  const weekdayKeys = Object.keys(defaults) as WeekdayKey[];
  for (const key of weekdayKeys) {
    const candidate = value[key];
    if (!isRecord(candidate)) {
      continue;
    }

    const start = typeof candidate.start === "string" && TIME_REGEX.test(candidate.start) ? candidate.start : defaults[key].start;
    const end = typeof candidate.end === "string" && TIME_REGEX.test(candidate.end) ? candidate.end : defaults[key].end;
    const enabled = typeof candidate.enabled === "boolean" ? candidate.enabled : defaults[key].enabled;

    normalized[key] = { enabled, start, end };
  }

  return normalized;
}

export function normalizeBusinessHoursConfig(value: {
  businessHoursEnabled?: boolean;
  timezone?: string;
  schedule?: unknown;
}): BusinessHoursConfig {
  const timezone =
    typeof value.timezone === "string" && value.timezone.trim() && isValidTimezone(value.timezone)
      ? value.timezone
      : DEFAULT_BUSINESS_HOURS_TIMEZONE;

  return {
    businessHoursEnabled: value.businessHoursEnabled ?? true,
    timezone,
    schedule: normalizeBusinessHoursSchedule(value.schedule),
  };
}

export function computeDueAt(startAt: Date, targetMinutes: number, config: BusinessHoursConfig): Date {
  const safeMinutes = Number.isFinite(targetMinutes) ? Math.max(0, targetMinutes) : 0;
  if (safeMinutes <= 0) return new Date(startAt);

  if (!config.businessHoursEnabled) {
    return new Date(startAt.getTime() + safeMinutes * 60 * 1000);
  }

  let remainingMinutes = safeMinutes;
  let cursor = new Date(startAt);
  let safetyCounter = 0;

  while (remainingMinutes > 0 && safetyCounter < 10_000) {
    safetyCounter += 1;
    const zoned = getZonedParts(cursor, config.timezone);
    const dayConfig = config.schedule[zoned.weekday];
    const startMinute = parseTimeToMinutes(dayConfig.start);
    const endMinute = parseTimeToMinutes(dayConfig.end);

    if (!dayConfig.enabled || startMinute === null || endMinute === null || endMinute <= startMinute) {
      cursor = nextAvailableDayStart(cursor, config, 1);
      continue;
    }

    const nowMinutes = zoned.hour * 60 + zoned.minute + zoned.second / 60;

    if (nowMinutes < startMinute) {
      cursor = zonedDateTimeToUtcDate(
        {
          year: zoned.year,
          month: zoned.month,
          day: zoned.day,
          hour: Math.floor(startMinute / 60),
          minute: startMinute % 60,
          second: 0,
        },
        config.timezone
      );
      continue;
    }

    if (nowMinutes >= endMinute) {
      cursor = nextAvailableDayStart(cursor, config, 1);
      continue;
    }

    const remainingInWindow = endMinute - nowMinutes;
    const consumed = Math.min(remainingMinutes, remainingInWindow);
    cursor = new Date(cursor.getTime() + consumed * 60 * 1000);
    remainingMinutes -= consumed;

    if (remainingMinutes <= 0) {
      return cursor;
    }

    cursor = nextAvailableDayStart(cursor, config, 1);
  }

  return cursor;
}
