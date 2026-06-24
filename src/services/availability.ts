import type Database from "better-sqlite3";
import type { AvailabilitySlot, GameTimeProposal } from "../types.js";

let db: Database.Database;

interface SlotRow {
  id: number;
  discord_user_id: string;
  week: number;
  start_utc: string;
  end_utc: string;
}

interface ProposalRow {
  id: number;
  week: number;
  proposer_id: string;
  recipient_id: string;
  start_utc: string;
  status: string;
  created_at: string;
}

export function initAvailabilityDatabase(database: Database.Database): void {
  db = database;
}

function mapSlot(row: SlotRow): AvailabilitySlot {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    week: row.week,
    startUtc: new Date(row.start_utc),
    endUtc: new Date(row.end_utc),
  };
}

function mapProposal(row: ProposalRow): GameTimeProposal {
  return {
    id: row.id,
    week: row.week,
    proposerId: row.proposer_id,
    recipientId: row.recipient_id,
    startUtc: new Date(row.start_utc),
    status: row.status as GameTimeProposal["status"],
    createdAt: new Date(row.created_at),
  };
}

export function getUserTimezone(discordUserId: string): string | null {
  const row = db
    .prepare("SELECT timezone FROM user_timezones WHERE discord_user_id = ?")
    .get(discordUserId) as { timezone: string } | undefined;

  return row?.timezone ?? null;
}

export function setUserTimezone(discordUserId: string, timezone: string): void {
  db.prepare(
    "INSERT INTO user_timezones (discord_user_id, timezone) VALUES (?, ?) ON CONFLICT(discord_user_id) DO UPDATE SET timezone = excluded.timezone",
  ).run(discordUserId, timezone);
}

export function addSlot(
  discordUserId: string,
  week: number,
  startUtc: Date,
  endUtc: Date,
): AvailabilitySlot {
  const result = db
    .prepare(
      "INSERT INTO availability_slots (discord_user_id, week, start_utc, end_utc) VALUES (?, ?, ?, ?)",
    )
    .run(
      discordUserId,
      week,
      startUtc.toISOString(),
      endUtc.toISOString(),
    );

  return {
    id: Number(result.lastInsertRowid),
    discordUserId,
    week,
    startUtc,
    endUtc,
  };
}

export function getSlotsForUserWeek(
  discordUserId: string,
  week: number,
): AvailabilitySlot[] {
  const rows = db
    .prepare(
      "SELECT id, discord_user_id, week, start_utc, end_utc FROM availability_slots WHERE discord_user_id = ? AND week = ? ORDER BY start_utc",
    )
    .all(discordUserId, week) as SlotRow[];

  return rows.map(mapSlot);
}

export function clearSlotsForUserWeek(
  discordUserId: string,
  week: number,
): number {
  const result = db
    .prepare(
      "DELETE FROM availability_slots WHERE discord_user_id = ? AND week = ?",
    )
    .run(discordUserId, week);

  return result.changes;
}

export function purgeAvailabilityBeforeWeek(week: number): void {
  db.prepare("DELETE FROM availability_slots WHERE week < ?").run(week);
  db.prepare("DELETE FROM game_time_proposals WHERE week < ?").run(week);
}

export function getConfirmedGameTimeForPair(
  userIdA: string,
  userIdB: string,
  week: number,
): GameTimeProposal | null {
  const row = db
    .prepare(
      `
      SELECT id, week, proposer_id, recipient_id, start_utc, status, created_at
      FROM game_time_proposals
      WHERE week = ? AND status = 'confirmed'
        AND (
          (proposer_id = ? AND recipient_id = ?)
          OR (proposer_id = ? AND recipient_id = ?)
        )
      LIMIT 1
      `,
    )
    .get(week, userIdA, userIdB, userIdB, userIdA) as ProposalRow | undefined;

  return row ? mapProposal(row) : null;
}

export function createProposal(
  proposerId: string,
  recipientId: string,
  week: number,
  startUtc: Date,
): GameTimeProposal {
  const existingConfirmed = getConfirmedGameTimeForPair(
    proposerId,
    recipientId,
    week,
  );
  if (existingConfirmed) {
    throw new Error(
      "A game time is already locked for this matchup this week.",
    );
  }

  db.prepare(
    "DELETE FROM game_time_proposals WHERE week = ? AND proposer_id = ? AND recipient_id = ? AND status = 'pending'",
  ).run(week, proposerId, recipientId);

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO game_time_proposals (week, proposer_id, recipient_id, start_utc, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
    ON CONFLICT(week, proposer_id, recipient_id) DO UPDATE SET
      start_utc = excluded.start_utc,
      status = 'pending',
      created_at = excluded.created_at
    `,
  ).run(week, proposerId, recipientId, startUtc.toISOString(), now);

  const row = db
    .prepare(
      `
      SELECT id, week, proposer_id, recipient_id, start_utc, status, created_at
      FROM game_time_proposals
      WHERE week = ? AND proposer_id = ? AND recipient_id = ?
      `,
    )
    .get(week, proposerId, recipientId) as ProposalRow;

  return mapProposal(row);
}

export function getProposalById(id: number): GameTimeProposal | null {
  const row = db
    .prepare(
      `
      SELECT id, week, proposer_id, recipient_id, start_utc, status, created_at
      FROM game_time_proposals
      WHERE id = ?
      `,
    )
    .get(id) as ProposalRow | undefined;

  return row ? mapProposal(row) : null;
}

export function getPendingProposalFromProposer(
  proposerId: string,
  recipientId: string,
  week: number,
): GameTimeProposal | null {
  const row = db
    .prepare(
      `
      SELECT id, week, proposer_id, recipient_id, start_utc, status, created_at
      FROM game_time_proposals
      WHERE week = ? AND proposer_id = ? AND recipient_id = ? AND status = 'pending'
      `,
    )
    .get(week, proposerId, recipientId) as ProposalRow | undefined;

  return row ? mapProposal(row) : null;
}

export function confirmProposal(proposalId: number): GameTimeProposal {
  db.prepare(
    "UPDATE game_time_proposals SET status = 'confirmed' WHERE id = ?",
  ).run(proposalId);

  const row = db
    .prepare(
      "SELECT id, week, proposer_id, recipient_id, start_utc, status, created_at FROM game_time_proposals WHERE id = ?",
    )
    .get(proposalId) as ProposalRow;

  return mapProposal(row);
}

export function declineProposal(
  proposerId: string,
  recipientId: string,
  week: number,
): GameTimeProposal | null {
  const existing = getPendingProposalFromProposer(proposerId, recipientId, week);
  if (!existing) return null;

  db.prepare("DELETE FROM game_time_proposals WHERE id = ?").run(existing.id);
  return existing;
}
