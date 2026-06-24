import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { initAvailabilityDatabase } from "./availability.js";
import type { MatchupWithTeams, Team } from "../types.js";

const DB_PATH = path.join(process.cwd(), "data", "dynasty.db");

let db: Database.Database;

interface TeamRow {
  id: number;
  name: string;
  discord_user_id: string | null;
}

interface MatchupWithTeamsRow {
  id: number;
  week: number;
  home_id: number;
  home_name: string;
  home_discord_user_id: string | null;
  away_id: number;
  away_name: string;
  away_discord_user_id: string | null;
}

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    discordUserId: row.discord_user_id,
  };
}

function mapMatchupWithTeams(row: MatchupWithTeamsRow): MatchupWithTeams {
  return {
    id: row.id,
    week: row.week,
    homeTeam: {
      id: row.home_id,
      name: row.home_name,
      discordUserId: row.home_discord_user_id,
    },
    awayTeam: {
      id: row.away_id,
      name: row.away_name,
      discordUserId: row.away_discord_user_id,
    },
  };
}

export function initDatabase(): void {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      discord_user_id TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS matchups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week INTEGER NOT NULL,
      home_team_id INTEGER NOT NULL REFERENCES teams(id),
      away_team_id INTEGER NOT NULL REFERENCES teams(id),
      UNIQUE(week, home_team_id, away_team_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_timezones (
      discord_user_id TEXT PRIMARY KEY,
      timezone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      week INTEGER NOT NULL,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      CHECK (start_utc < end_utc)
    );

    CREATE INDEX IF NOT EXISTS idx_availability_user_week
      ON availability_slots (discord_user_id, week);

    CREATE TABLE IF NOT EXISTS game_time_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week INTEGER NOT NULL,
      proposer_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      start_utc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      UNIQUE(week, proposer_id, recipient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_recipient
      ON game_time_proposals (recipient_id, week, status);
  `);

  const currentWeek = db
    .prepare("SELECT value FROM settings WHERE key = 'current_week'")
    .get() as { value: string } | undefined;

  if (!currentWeek) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('current_week', '1')",
    ).run();
  }

  initAvailabilityDatabase(db);
}

export function getTeamByName(name: string): Team | null {
  const row = db
    .prepare(
      "SELECT id, name, discord_user_id FROM teams WHERE name = ? COLLATE NOCASE",
    )
    .get(name.trim()) as TeamRow | undefined;

  return row ? mapTeam(row) : null;
}

export function getOrCreateTeam(name: string): Team {
  const trimmed = name.trim();
  const existing = getTeamByName(trimmed);
  if (existing) return existing;

  const result = db
    .prepare("INSERT INTO teams (name) VALUES (?)")
    .run(trimmed);

  return {
    id: Number(result.lastInsertRowid),
    name: trimmed,
    discordUserId: null,
  };
}

export function assignTeamToUser(
  teamName: string,
  discordUserId: string,
): Team {
  const team = getOrCreateTeam(teamName);

  db.prepare("UPDATE teams SET discord_user_id = NULL WHERE discord_user_id = ?").run(
    discordUserId,
  );

  db.prepare("UPDATE teams SET discord_user_id = ? WHERE id = ?").run(
    discordUserId,
    team.id,
  );

  return { ...team, discordUserId };
}

export function unassignTeamByName(teamName: string): Team {
  const team = getTeamByName(teamName);
  if (!team) {
    throw new Error(`Team "${teamName.trim()}" not found.`);
  }
  if (!team.discordUserId) {
    throw new Error(`**${team.name}** is not assigned to anyone.`);
  }

  db.prepare("UPDATE teams SET discord_user_id = NULL WHERE id = ?").run(
    team.id,
  );

  return { ...team, discordUserId: null };
}

export function unassignTeamByUserId(discordUserId: string): Team {
  const row = db
    .prepare(
      "SELECT id, name, discord_user_id FROM teams WHERE discord_user_id = ?",
    )
    .get(discordUserId) as TeamRow | undefined;

  if (!row) {
    throw new Error("That user is not assigned to a team.");
  }

  db.prepare("UPDATE teams SET discord_user_id = NULL WHERE id = ?").run(
    row.id,
  );

  return mapTeam(row);
}

export function getAllTeams(): Team[] {
  const rows = db
    .prepare(
      "SELECT id, name, discord_user_id FROM teams ORDER BY name COLLATE NOCASE",
    )
    .all() as TeamRow[];

  return rows.map(mapTeam);
}

export function addMatchup(
  week: number,
  homeTeamName: string,
  awayTeamName: string,
): MatchupWithTeams {
  const home = homeTeamName.trim();
  const away = awayTeamName.trim();

  if (home.toLowerCase() === away.toLowerCase()) {
    throw new Error("Home and away teams must be different.");
  }

  const homeTeam = getOrCreateTeam(home);
  const awayTeam = getOrCreateTeam(away);

  try {
    const result = db
      .prepare(
        "INSERT INTO matchups (week, home_team_id, away_team_id) VALUES (?, ?, ?)",
      )
      .run(week, homeTeam.id, awayTeam.id);

    return {
      id: Number(result.lastInsertRowid),
      week,
      homeTeam,
      awayTeam,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new Error(
        `A matchup for Week ${week} between ${homeTeam.name} and ${awayTeam.name} already exists.`,
      );
    }
    throw error;
  }
}

export function getMatchupsForWeek(week: number): MatchupWithTeams[] {
  const rows = db
    .prepare(
      `
      SELECT
        m.id,
        m.week,
        ht.id AS home_id,
        ht.name AS home_name,
        ht.discord_user_id AS home_discord_user_id,
        at.id AS away_id,
        at.name AS away_name,
        at.discord_user_id AS away_discord_user_id
      FROM matchups m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.week = ?
      ORDER BY m.id
      `,
    )
    .all(week) as MatchupWithTeamsRow[];

  return rows.map(mapMatchupWithTeams);
}

export function getTeamMatchupForWeek(
  teamId: number,
  week: number,
): MatchupWithTeams | null {
  const row = db
    .prepare(
      `
      SELECT
        m.id,
        m.week,
        ht.id AS home_id,
        ht.name AS home_name,
        ht.discord_user_id AS home_discord_user_id,
        at.id AS away_id,
        at.name AS away_name,
        at.discord_user_id AS away_discord_user_id
      FROM matchups m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.week = ? AND (m.home_team_id = ? OR m.away_team_id = ?)
      LIMIT 1
      `,
    )
    .get(week, teamId, teamId) as MatchupWithTeamsRow | undefined;

  return row ? mapMatchupWithTeams(row) : null;
}

export function getCurrentWeek(): number {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'current_week'")
    .get() as { value: string };

  return Number.parseInt(row.value, 10);
}

export function setCurrentWeek(week: number): number {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('current_week', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(week));

  return week;
}

export function getNextAdvanceAt(): Date | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'next_advance_at'")
    .get() as { value: string } | undefined;

  if (!row) return null;

  const parsed = Date.parse(row.value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function setNextAdvanceAt(deadline: Date): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('next_advance_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(deadline.toISOString());
}

export function clearNextAdvanceAt(): void {
  db.prepare("DELETE FROM settings WHERE key = 'next_advance_at'").run();
}

export function incrementCurrentWeek(): number {
  const nextWeek = getCurrentWeek() + 1;
  return setCurrentWeek(nextWeek);
}

export function getTeamByDiscordUserId(discordUserId: string): Team | null {
  const row = db
    .prepare(
      "SELECT id, name, discord_user_id FROM teams WHERE discord_user_id = ?",
    )
    .get(discordUserId) as TeamRow | undefined;

  return row ? mapTeam(row) : null;
}

export function getMatchupBetweenUsersForWeek(
  userIdA: string,
  userIdB: string,
  week: number,
): MatchupWithTeams | null {
  const teamA = getTeamByDiscordUserId(userIdA);
  const teamB = getTeamByDiscordUserId(userIdB);
  if (!teamA || !teamB) return null;

  const matchupA = getTeamMatchupForWeek(teamA.id, week);
  if (!matchupA) return null;

  const opponentId =
    matchupA.homeTeam.id === teamA.id
      ? matchupA.awayTeam.discordUserId
      : matchupA.homeTeam.discordUserId;

  return opponentId === userIdB ? matchupA : null;
}

export function getTeamsWithDiscordUsers(): Team[] {
  const rows = db
    .prepare(
      "SELECT id, name, discord_user_id FROM teams WHERE discord_user_id IS NOT NULL ORDER BY name COLLATE NOCASE",
    )
    .all() as TeamRow[];

  return rows.map(mapTeam);
}
