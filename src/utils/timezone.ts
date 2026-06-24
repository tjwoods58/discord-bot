import type { AvailabilitySlot } from "../types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function validateDate(date: string): void {
  if (!DATE_PATTERN.test(date)) {
    throw new Error("Date must be in `YYYY-MM-DD` format.");
  }

  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid date.");
  }
}

export function validateTime(time: string): void {
  if (!TIME_PATTERN.test(time)) {
    throw new Error("Time must be in `HH:MM` format (24-hour).");
  }

  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error("Invalid time.");
  }
}

function readParts(parts: Intl.DateTimeFormatPart[]): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  let hour = Number(values.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour,
    minute: Number(values.minute),
  };
}

function parseLocalDateTimeParts(
  date: string,
  time: string,
  timeZone: string,
): Date {
  validateDate(date);
  validateTime(time);

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));

    const values = readParts(parts);
    const diffMinutes =
      (year - values.year) * 525_600 +
      (month - values.month) * 43_200 +
      (day - values.day) * 1_440 +
      (hour - values.hour) * 60 +
      (minute - values.minute);

    if (diffMinutes === 0) {
      return new Date(utcMs);
    }

    utcMs += diffMinutes * 60 * 1000;
  }

  throw new Error("Could not parse date/time in the given timezone.");
}

export function parseLocalSlot(
  date: string,
  start: string,
  end: string,
  timeZone: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = parseLocalDateTimeParts(date, start, timeZone);
  const endUtc = parseLocalDateTimeParts(date, end, timeZone);

  if (endUtc <= startUtc) {
    throw new Error("End time must be after start time.");
  }

  return { startUtc, endUtc };
}

export function parseLocalDateTime(
  date: string,
  time: string,
  timeZone: string,
): Date {
  return parseLocalDateTimeParts(date, time, timeZone);
}

export function formatDateTimeInTimezone(utc: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(utc);
}

export function formatSlotInTimezone(
  startUtc: Date,
  endUtc: Date,
  timeZone: string,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const start = formatter.format(startUtc);
  const endTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(endUtc);

  return `${start} – ${endTime}`;
}

export function formatDiscordRange(startUtc: Date, endUtc: Date): string {
  const startUnix = Math.floor(startUtc.getTime() / 1000);
  const endUnix = Math.floor(endUtc.getTime() / 1000);
  return `<t:${startUnix}:R> – <t:${endUnix}:t>`;
}

export function formatDiscordKickoff(startUtc: Date): string {
  const unix = Math.floor(startUtc.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

export interface TimeInterval {
  startUtc: Date;
  endUtc: Date;
}

export function findOverlaps(
  slotsA: AvailabilitySlot[],
  slotsB: AvailabilitySlot[],
): TimeInterval[] {
  const overlaps: TimeInterval[] = [];

  for (const slotA of slotsA) {
    for (const slotB of slotsB) {
      const startMs = Math.max(
        slotA.startUtc.getTime(),
        slotB.startUtc.getTime(),
      );
      const endMs = Math.min(slotA.endUtc.getTime(), slotB.endUtc.getTime());

      if (startMs < endMs) {
        overlaps.push({
          startUtc: new Date(startMs),
          endUtc: new Date(endMs),
        });
      }
    }
  }

  return overlaps.sort(
    (a, b) => a.startUtc.getTime() - b.startUtc.getTime(),
  );
}

export function formatLockedGameTime(
  startUtc: Date,
  userAId: string,
  tzA: string,
  userBId: string,
  tzB: string,
): string {
  const unix = Math.floor(startUtc.getTime() / 1000);
  return [
    `<@${userAId}> (${tzA}): ${formatDateTimeInTimezone(startUtc, tzA)}`,
    `<@${userBId}> (${tzB}): ${formatDateTimeInTimezone(startUtc, tzB)}`,
    `Kickoff: <t:${unix}:F> (<t:${unix}:R>)`,
  ].join("\n");
}
