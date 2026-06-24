import type { Client } from "discord.js";
import {
  getCurrentWeek,
  getMatchupsForWeek,
  getTeamMatchupForWeek,
  getTeamsWithDiscordUsers,
  setCurrentWeek,
  setNextAdvanceAt,
} from "./database.js";
import { purgeAvailabilityBeforeWeek } from "./availability.js";
import {
  buildMatchupDm,
  computeDeadline,
  getWeekScheduleDeadlineHours,
} from "../utils/deadlines.js";
import { buildWeekScheduleEmbed } from "../utils/format.js";

export interface AdvanceWeekResult {
  newWeek: number;
  matchupCount: number;
  notifiedCount: number;
  byeCount: number;
  dmFailures: string[];
}

export async function advanceWeekAndNotify(
  client: Client,
  scheduleChannelId: string,
): Promise<AdvanceWeekResult> {
  const newWeek = getCurrentWeek() + 1;
  const matchups = getMatchupsForWeek(newWeek);

  if (matchups.length === 0) {
    throw new Error(
      `No matchups set for Week ${newWeek}. Use \`/schedule add\` first.`,
    );
  }

  const startMs = Date.now();
  const scheduleDeadline = computeDeadline(
    startMs,
    getWeekScheduleDeadlineHours(matchups),
  );

  const dmFailures: string[] = [];
  let notifiedCount = 0;
  let byeCount = 0;

  for (const team of getTeamsWithDiscordUsers()) {
    if (!team.discordUserId) continue;

    const matchup = getTeamMatchupForWeek(team.id, newWeek);
    const message = matchup
      ? buildMatchupDm(newWeek, team, matchup, startMs)
      : `**Week ${newWeek} — Bye week**\n**${team.name}** has no game scheduled this week.`;

    if (!matchup) byeCount++;

    try {
      const user = await client.users.fetch(team.discordUserId);
      await user.send(message);
      if (matchup) notifiedCount++;
    } catch {
      dmFailures.push(team.discordUserId);
    }
  }

  const channel = await client.channels.fetch(scheduleChannelId);
  if (!channel?.isSendable()) {
    throw new Error(
      "Schedule channel not found. Check `SCHEDULE_CHANNEL_ID` in your `.env`.",
    );
  }

  const embed = buildWeekScheduleEmbed(newWeek, matchups, {
    deadline: scheduleDeadline,
  });
  const failedMentions = dmFailures.map((id) => `<@${id}>`).join(" ");
  const content = failedMentions
    ? `${failedMentions} — I couldn't DM you your matchup. See the schedule below.`
    : undefined;

  await channel.send({ content, embeds: [embed] });

  setCurrentWeek(newWeek);
  setNextAdvanceAt(scheduleDeadline);
  purgeAvailabilityBeforeWeek(newWeek);

  return {
    newWeek,
    matchupCount: matchups.length,
    notifiedCount,
    byeCount,
    dmFailures,
  };
}
