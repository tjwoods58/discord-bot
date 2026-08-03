import { EmbedBuilder } from "discord.js";
import type { MatchupWithTeams, Team } from "../types.js";
import { formatNextAdvance } from "./deadlines.js";

export function formatTeamLabel(team: Team): string {
  if (team.discordUserId) {
    return `**${team.name}** (<@${team.discordUserId}>)`;
  }
  return `**${team.name}** (CPU)`;
}

export function formatMatchupLine(matchup: MatchupWithTeams): string {
  return `${formatTeamLabel(matchup.homeTeam)} vs ${formatTeamLabel(matchup.awayTeam)}`;
}

export function buildWeekScheduleEmbed(
  week: number,
  matchups: MatchupWithTeams[],
  options?: { deadline: Date },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Week ${week} Matchups`)
    .setColor(0x5865f2);

  if (matchups.length === 0) {
    embed.setDescription("No matchups scheduled for this week.");
  } else {
    embed.setDescription(matchups.map(formatMatchupLine).join("\n"));
  }

  if (options?.deadline) {
    embed.setFooter({ text: formatNextAdvance(options.deadline) });
  }

  return embed;
}

export function buildTeamListEmbed(teams: Team[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Dynasty Team Assignments")
    .setColor(0x57f287);

  if (teams.length === 0) {
    embed.setDescription("No teams assigned yet.");
    return embed;
  }

  const lines = teams.map((team) => {
    const owner = team.discordUserId
      ? `<@${team.discordUserId}>`
      : "Unassigned";
    return `**${team.name}** — ${owner}`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}
