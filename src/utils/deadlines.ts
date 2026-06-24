import type { MatchupWithTeams } from "../types.js";

export const USER_VS_USER_HOURS = 48;
export const USER_VS_CPU_HOURS = 24;

export function isUserVsUser(matchup: MatchupWithTeams): boolean {
  return (
    matchup.homeTeam.discordUserId !== null &&
    matchup.awayTeam.discordUserId !== null
  );
}

export function isUserVsCpu(matchup: MatchupWithTeams): boolean {
  const homeHasUser = matchup.homeTeam.discordUserId !== null;
  const awayHasUser = matchup.awayTeam.discordUserId !== null;
  return homeHasUser !== awayHasUser;
}

export function getMatchupDeadlineHours(
  matchup: MatchupWithTeams,
): 48 | 24 | null {
  if (isUserVsUser(matchup)) return USER_VS_USER_HOURS;
  if (isUserVsCpu(matchup)) return USER_VS_CPU_HOURS;
  return null;
}

export function getWeekScheduleDeadlineHours(
  matchups: MatchupWithTeams[],
): 48 | 24 {
  if (matchups.some(isUserVsUser)) return USER_VS_USER_HOURS;
  return USER_VS_CPU_HOURS;
}

export function computeDeadline(startMs: number, hours: number): Date {
  return new Date(startMs + hours * 60 * 60 * 1000);
}

export function formatNextAdvance(deadline: Date): string {
  const unix = Math.floor(deadline.getTime() / 1000);
  return `Next advance: <t:${unix}:R> (<t:${unix}:F>)`;
}

export function buildMatchupDm(
  week: number,
  team: { id: number; name: string },
  matchup: MatchupWithTeams,
  startMs: number,
): string {
  const opponent =
    matchup.homeTeam.id === team.id ? matchup.awayTeam : matchup.homeTeam;

  const hours = getMatchupDeadlineHours(matchup);
  const lines = [
    `**Week ${week} — Your matchup**`,
    `**${team.name}** vs **${opponent.name}**`,
  ];

  if (hours !== null) {
    lines.push(formatNextAdvance(computeDeadline(startMs, hours)));
  }

  return lines.join("\n");
}
