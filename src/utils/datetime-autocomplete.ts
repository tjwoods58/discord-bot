import { getUserTimezone } from "../services/availability.js";

const DEFAULT_TIMEZONE = "America/New_York";
const DATE_SUGGESTION_DAYS = 14;

interface AutocompleteChoice {
  name: string;
  value: string;
}

function getTimezoneForUser(discordUserId: string): string {
  return getUserTimezone(discordUserId) ?? DEFAULT_TIMEZONE;
}

function formatDateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatIsoDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function getDateSuggestions(
  discordUserId: string,
  query: string,
): AutocompleteChoice[] {
  const timeZone = getTimezoneForUser(discordUserId);
  const normalizedQuery = query.trim().toLowerCase();
  const choices: AutocompleteChoice[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < DATE_SUGGESTION_DAYS; offset++) {
    const day = new Date(Date.now() + offset * 86_400_000);
    const value = formatIsoDate(day, timeZone);

    if (seen.has(value)) continue;
    seen.add(value);

    const name = formatDateLabel(day, timeZone);
    const haystack = `${name} ${value}`.toLowerCase();

    if (
      normalizedQuery === "" ||
      haystack.includes(normalizedQuery) ||
      value.startsWith(normalizedQuery)
    ) {
      choices.push({ name, value });
    }
  }

  return choices.slice(0, 25);
}

function formatTimeLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteText = minute.toString().padStart(2, "0");
  return `${hour12}:${minuteText} ${period}`;
}

export function getTimeSuggestions(
  query: string,
  minTime?: string,
): AutocompleteChoice[] {
  const normalizedQuery = query.trim().toLowerCase();
  const choices: AutocompleteChoice[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

      if (minTime && value <= minTime) continue;

      const name = formatTimeLabel(hour, minute);
      const haystack = `${name} ${value}`.toLowerCase();

      if (
        normalizedQuery === "" ||
        haystack.includes(normalizedQuery) ||
        value.startsWith(normalizedQuery)
      ) {
        choices.push({ name, value });
      }
    }
  }

  return choices.slice(0, 25);
}

export function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  return trimmed;
}

export function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/(\d{2}:\d{2})/);
  if (match) {
    return match[1];
  }

  return trimmed;
}
