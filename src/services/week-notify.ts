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

export interface NotifyWeekResult {
  week: number;
  matchupCount: number;
  notifiedCount: number;
  byeCount: number;
  dmFailures: string[];
}

async function notifyWeekAndUpdate(
  client: Client,
  scheduleChannelId: string,
  week: number,
): Promise<NotifyWeekResult> {
  const matchups = getMatchupsForWeek(week);

  if (matchups.length === 0) {
    throw new Error(
      `No matchups set for Week ${week}. Use \`/schedule add\` first.`,
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

    const matchup = getTeamMatchupForWeek(team.id, week);
    const message = matchup
      ? buildMatchupDm(week, team, matchup, startMs)
      : `**Week ${week} — Bye week**\n**${team.name}** has no game scheduled this week.`;

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

  const embed = buildWeekScheduleEmbed(week, matchups, {
    deadline: scheduleDeadline,
  });
  const failedMentions = dmFailures.map((id) => `<@${id}>`).join(" ");
  const content = failedMentions
    ? `${failedMentions} — I couldn't DM you your matchup. See the schedule below.`
    : undefined;

  await channel.send({ content, embeds: [embed] });

  setCurrentWeek(week);
  setNextAdvanceAt(scheduleDeadline);
  purgeAvailabilityBeforeWeek(week);

  return {
    week,
    matchupCount: matchups.length,
    notifiedCount,
    byeCount,
    dmFailures,
  };
}

export async function advanceWeekAndNotify(
  client: Client,
  scheduleChannelId: string,
): Promise<NotifyWeekResult> {
  return notifyWeekAndUpdate(client, scheduleChannelId, getCurrentWeek() + 1);
}

export async function startSeasonAndNotify(
  client: Client,
  scheduleChannelId: string,
): Promise<NotifyWeekResult> {
  return notifyWeekAndUpdate(client, scheduleChannelId, 0);
}
