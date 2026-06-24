import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
} from "discord.js";
import {
  confirmProposal,
  declineProposal,
  getProposalById,
  getUserTimezone,
} from "./availability.js";
import { getMatchupBetweenUsersForWeek } from "./database.js";
import type { GameTimeProposal } from "../types.js";
import {
  formatDateTimeInTimezone,
  formatDiscordKickoff,
  formatLockedGameTime,
} from "../utils/timezone.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function buildProposalButtons(proposalId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`availability:accept:${proposalId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`availability:decline:${proposalId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildProposalDmContent(
  week: number,
  proposerId: string,
  recipientId: string,
  proposerTz: string,
  recipientTz: string,
  startUtc: Date,
): string {
  const kickoffLine = formatDiscordKickoff(startUtc);
  return [
    `<@${recipientId}> — <@${proposerId}> proposed a game time for **Week ${week}**:`,
    `<@${proposerId}> (${proposerTz}): ${formatDateTimeInTimezone(startUtc, proposerTz)}`,
    `<@${recipientId}> (${recipientTz}): ${formatDateTimeInTimezone(startUtc, recipientTz)}`,
    `Kickoff: ${kickoffLine}`,
    "Use the buttons below to accept or decline.",
  ].join("\n");
}

export async function deliverProposalNotification(
  client: Client,
  recipientId: string,
  proposalId: number,
  content: string,
): Promise<{ method: "dm" | "schedule"; scheduleChannelId: string | null }> {
  const components = [buildProposalButtons(proposalId)];

  try {
    const user = await client.users.fetch(recipientId);
    await user.send({ content, components });
    return { method: "dm", scheduleChannelId: null };
  } catch {
    const scheduleChannelId = requireEnv("SCHEDULE_CHANNEL_ID");
    const channel = await client.channels.fetch(scheduleChannelId);
    if (!channel?.isSendable()) {
      throw new Error(
        "Couldn't DM the recipient and the schedule channel isn't available.",
      );
    }

    await channel.send({
      content: `<@${recipientId}> — I couldn't DM you this game time proposal. Use the buttons below to accept or decline.\n\n${content}`,
      components,
    });

    return { method: "schedule", scheduleChannelId };
  }
}

export function buildLockedEmbed(
  week: number,
  proposal: GameTimeProposal,
  tzA: string,
  tzB: string,
  matchupLabel: string | null,
): EmbedBuilder {
  const timeLines = formatLockedGameTime(
    proposal.startUtc,
    proposal.proposerId,
    tzA,
    proposal.recipientId,
    tzB,
  );

  return new EmbedBuilder()
    .setTitle(`Game locked — Week ${week}`)
    .setColor(0x57f287)
    .setDescription(
      matchupLabel ? `${matchupLabel}\n\n${timeLines}` : timeLines,
    );
}

export function getMatchupLabel(
  proposerId: string,
  recipientId: string,
  week: number,
): string | null {
  const matchup = getMatchupBetweenUsersForWeek(
    proposerId,
    recipientId,
    week,
  );
  if (!matchup) return null;

  return `**${matchup.homeTeam.name}** (<@${matchup.homeTeam.discordUserId ?? "unknown"}>) vs **${matchup.awayTeam.name}** (<@${matchup.awayTeam.discordUserId ?? "unknown"}>)`;
}

export async function acceptGameProposal(
  client: Client,
  proposalId: number,
  recipientId: string,
): Promise<string> {
  const pending = getProposalById(proposalId);
  if (!pending || pending.status !== "pending") {
    throw new Error("This proposal is no longer pending.");
  }

  if (pending.recipientId !== recipientId) {
    throw new Error("Only the recipient can accept this proposal.");
  }

  const proposerTz = getUserTimezone(pending.proposerId);
  const recipientTz = getUserTimezone(pending.recipientId);
  if (!proposerTz || !recipientTz) {
    throw new Error("Both players need a timezone set before locking a game.");
  }

  const confirmed = confirmProposal(pending.id);
  const week = confirmed.week;
  const matchupLabel = getMatchupLabel(
    pending.proposerId,
    pending.recipientId,
    week,
  );
  const lockedEmbed = buildLockedEmbed(
    week,
    confirmed,
    proposerTz,
    recipientTz,
    matchupLabel,
  );

  const scheduleChannelId = requireEnv("SCHEDULE_CHANNEL_ID");
  const channel = await client.channels.fetch(scheduleChannelId);
  if (!channel?.isSendable()) {
    throw new Error("Schedule channel not found. Check `SCHEDULE_CHANNEL_ID`.");
  }

  await channel.send({
    content: `<@${pending.proposerId}> <@${pending.recipientId}>`,
    embeds: [lockedEmbed],
  });

  const dmText = [
    `**Game time locked — Week ${week}**`,
    formatLockedGameTime(
      confirmed.startUtc,
      pending.proposerId,
      proposerTz,
      pending.recipientId,
      recipientTz,
    ),
  ].join("\n");

  for (const userId of [pending.proposerId, pending.recipientId]) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(dmText);
    } catch {
      // DMs closed
    }
  }

  return `Game time locked for Week ${week} and posted to <#${scheduleChannelId}>.`;
}

export async function declineGameProposal(
  client: Client,
  proposalId: number,
  recipientId: string,
): Promise<string> {
  const pending = getProposalById(proposalId);
  if (!pending || pending.status !== "pending") {
    throw new Error("This proposal is no longer pending.");
  }

  if (pending.recipientId !== recipientId) {
    throw new Error("Only the recipient can decline this proposal.");
  }

  declineProposal(pending.proposerId, pending.recipientId, pending.week);

  try {
    const proposer = await client.users.fetch(pending.proposerId);
    await proposer.send(
      `<@${pending.recipientId}> declined your proposed game time for Week ${pending.week}.`,
    );
  } catch {
    // DMs closed
  }

  return `Declined the proposed game time for Week ${pending.week}.`;
}

export function parseProposalButtonId(customId: string): {
  action: "accept" | "decline";
  proposalId: number;
} | null {
  const match = customId.match(/^availability:(accept|decline):(\d+)$/);
  if (!match) return null;

  return {
    action: match[1] as "accept" | "decline",
    proposalId: Number.parseInt(match[2], 10),
  };
}
