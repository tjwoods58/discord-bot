import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type User,
} from "discord.js";
import {
  acceptGameProposal,
  buildLockedEmbed,
  buildProposalDmContent,
  declineGameProposal,
  deliverProposalNotification,
  getMatchupLabel,
} from "../services/proposal-response.js";
import {
  addSlot,
  clearSlotsForUserWeek,
  createProposal,
  getConfirmedGameTimeForPair,
  getPendingProposalFromProposer,
  getSlotsForUserWeek,
  getUserTimezone,
  setUserTimezone,
} from "../services/availability.js";
import {
  getCurrentWeek,
  getMatchupBetweenUsersForWeek,
  getTeamByDiscordUserId,
  getTeamMatchupForWeek,
} from "../services/database.js";
import {
  getTimezoneChoiceLabel,
  TIMEZONE_CHOICES,
} from "../constants/timezones.js";
import type { Command } from "../types.js";
import {
  getDateSuggestions,
  getTimeSuggestions,
  normalizeDateInput,
  normalizeTimeInput,
} from "../utils/datetime-autocomplete.js";
import {
  findOverlaps,
  formatDiscordKickoff,
  formatDiscordRange,
  formatSlotInTimezone,
  parseLocalDateTime,
  parseLocalSlot,
} from "../utils/timezone.js";

function requireTimezone(userId: string): string {
  const timezone = getUserTimezone(userId);
  if (!timezone) {
    throw new Error("Run `/availability timezone set` first.");
  }
  return timezone;
}

async function replyError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  const payload = { content: message, ephemeral: true };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

function buildCompareEmbed(
  week: number,
  userA: User,
  tzA: string,
  userB: User,
  tzB: string,
  matchupWarning: string | null,
): EmbedBuilder {
  const slotsA = getSlotsForUserWeek(userA.id, week);
  const slotsB = getSlotsForUserWeek(userB.id, week);
  const overlaps = findOverlaps(slotsA, slotsB);

  const embed = new EmbedBuilder()
    .setTitle(`Week ${week} — Availability overlap`)
    .setColor(0x5865f2);

  if (matchupWarning) {
    embed.setDescription(matchupWarning);
  }

  if (overlaps.length === 0) {
    embed.addFields({
      name: "Result",
      value:
        "No shared free time this week. Try adding more windows or propose a time manually with `/availability propose`.",
    });
    return embed;
  }

  overlaps.forEach((overlap, index) => {
    embed.addFields({
      name: `Overlap ${index + 1}`,
      value: [
        `<@${userA.id}> (${tzA}): ${formatSlotInTimezone(overlap.startUtc, overlap.endUtc, tzA)}`,
        `<@${userB.id}> (${tzB}): ${formatSlotInTimezone(overlap.startUtc, overlap.endUtc, tzB)}`,
        `Discord: ${formatDiscordRange(overlap.startUtc, overlap.endUtc)}`,
      ].join("\n"),
    });
  });

  return embed;
}

export const availabilityCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("availability")
    .setDescription("Coordinate game times across timezones")
    .addSubcommandGroup((group) =>
      group
        .setName("timezone")
        .setDescription("Manage your timezone")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set your timezone")
            .addStringOption((option) =>
              option
                .setName("zone")
                .setDescription("Your timezone")
                .setRequired(true)
                .addChoices(...TIMEZONE_CHOICES),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("show").setDescription("Show your saved timezone"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a free window for the current week")
        .addStringOption((option) =>
          option
            .setName("date")
            .setDescription("Pick a date from the list")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("start")
            .setDescription("Start time — pick from the list")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("end")
            .setDescription("End time — pick from the list")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List your free windows for the current week"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Remove all your free windows for the current week"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("compare")
        .setDescription("Find overlapping free time with another player")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The other player")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("propose")
        .setDescription("Propose a game kickoff time to another player")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The other player")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("date")
            .setDescription("Pick a date from the list")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription("Kickoff time — pick from the list")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("accept")
        .setDescription("Accept a pending game time proposal")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The player who proposed the time")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("decline")
        .setDescription("Decline a pending game time proposal")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The player who proposed the time")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("locked")
        .setDescription("Show the locked game time for your current-week matchup"),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (group === "timezone") {
        if (subcommand === "set") {
          const zone = interaction.options.getString("zone", true);
          setUserTimezone(interaction.user.id, zone);
          await interaction.reply({
            content: `Timezone set to **${getTimezoneChoiceLabel(zone)}**.`,
            ephemeral: true,
          });
          return;
        }

        const timezone = getUserTimezone(interaction.user.id);
        await interaction.reply({
          content: timezone
            ? `Your timezone is **${getTimezoneChoiceLabel(timezone)}**.`
            : "No timezone set. Use `/availability timezone set`.",
          ephemeral: true,
        });
        return;
      }

      const week = getCurrentWeek();

      if (subcommand === "add") {
        const timezone = requireTimezone(interaction.user.id);
        const date = normalizeDateInput(interaction.options.getString("date", true));
        const start = normalizeTimeInput(interaction.options.getString("start", true));
        const end = normalizeTimeInput(interaction.options.getString("end", true));
        const { startUtc, endUtc } = parseLocalSlot(date, start, end, timezone);
        addSlot(interaction.user.id, week, startUtc, endUtc);

        await interaction.reply({
          content: `Added free window for Week ${week}: ${formatSlotInTimezone(startUtc, endUtc, timezone)}`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "list") {
        const timezone = requireTimezone(interaction.user.id);
        const slots = getSlotsForUserWeek(interaction.user.id, week);

        if (slots.length === 0) {
          await interaction.reply({
            content: `No free windows for Week ${week}. Use \`/availability add\`.`,
            ephemeral: true,
          });
          return;
        }

        const lines = slots.map((slot, index) =>
          `${index + 1}. ${formatSlotInTimezone(slot.startUtc, slot.endUtc, timezone)}`,
        );

        await interaction.reply({
          content: `**Week ${week} — your availability**\n${lines.join("\n")}`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "clear") {
        const removed = clearSlotsForUserWeek(interaction.user.id, week);
        await interaction.reply({
          content:
            removed > 0
              ? `Cleared ${removed} free window(s) for Week ${week}.`
              : `No free windows to clear for Week ${week}.`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "compare") {
        const opponent = interaction.options.getUser("user", true);
        if (opponent.id === interaction.user.id) {
          await interaction.reply({
            content: "Pick someone other than yourself.",
            ephemeral: true,
          });
          return;
        }

        const tzA = requireTimezone(interaction.user.id);
        const tzB = getUserTimezone(opponent.id);
        if (!tzB) {
          await interaction.reply({
            content: `${opponent} hasn't set a timezone yet.`,
            ephemeral: true,
          });
          return;
        }

        const slotsA = getSlotsForUserWeek(interaction.user.id, week);
        const slotsB = getSlotsForUserWeek(opponent.id, week);

        if (slotsA.length === 0) {
          await interaction.reply({
            content: "Add free times with `/availability add` first.",
            ephemeral: true,
          });
          return;
        }

        if (slotsB.length === 0) {
          await interaction.reply({
            content: `${opponent} hasn't added any free times this week.`,
            ephemeral: true,
          });
          return;
        }

        const matchup = getMatchupBetweenUsersForWeek(
          interaction.user.id,
          opponent.id,
          week,
        );
        const matchupWarning = matchup
          ? null
          : `Note: you and ${opponent} are not scheduled to play each other in Week ${week}.`;

        await interaction.reply({
          embeds: [
            buildCompareEmbed(
              week,
              interaction.user,
              tzA,
              opponent,
              tzB,
              matchupWarning,
            ),
          ],
        });
        return;
      }

      if (subcommand === "propose") {
        const opponent = interaction.options.getUser("user", true);
        if (opponent.id === interaction.user.id) {
          await interaction.reply({
            content: "Pick someone other than yourself.",
            ephemeral: true,
          });
          return;
        }

        if (opponent.bot) {
          await interaction.reply({
            content: "You can't propose a game time to a bot.",
            ephemeral: true,
          });
          return;
        }

        const proposerTz = requireTimezone(interaction.user.id);
        const recipientTz = getUserTimezone(opponent.id);
        if (!recipientTz) {
          await interaction.reply({
            content: `${opponent} hasn't set a timezone yet.`,
            ephemeral: true,
          });
          return;
        }

        const date = normalizeDateInput(interaction.options.getString("date", true));
        const time = normalizeTimeInput(interaction.options.getString("time", true));
        const startUtc = parseLocalDateTime(date, time, proposerTz);
        const proposal = createProposal(
          interaction.user.id,
          opponent.id,
          week,
          startUtc,
        );

        const dmBody = buildProposalDmContent(
          week,
          interaction.user.id,
          opponent.id,
          proposerTz,
          recipientTz,
          startUtc,
        );

        const delivery = await deliverProposalNotification(
          interaction.client,
          opponent.id,
          proposal.id,
          dmBody,
        );

        const kickoffLine = formatDiscordKickoff(startUtc);
        const replyContent =
          delivery.method === "dm"
            ? `Proposed game time for Week ${week} sent to ${opponent}.\n${kickoffLine}`
            : `Couldn't DM ${opponent} — proposal posted to <#${delivery.scheduleChannelId}> instead.\n${kickoffLine}`;

        await interaction.reply({
          content: replyContent,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "accept") {
        const proposer = interaction.options.getUser("user", true);
        const pending = getPendingProposalFromProposer(
          proposer.id,
          interaction.user.id,
          week,
        );

        if (!pending) {
          await interaction.reply({
            content: `No pending proposal from ${proposer} for Week ${week}.`,
            ephemeral: true,
          });
          return;
        }

        const result = await acceptGameProposal(
          interaction.client,
          pending.id,
          interaction.user.id,
        );

        await interaction.reply({
          content: result,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "decline") {
        const proposer = interaction.options.getUser("user", true);
        const pending = getPendingProposalFromProposer(
          proposer.id,
          interaction.user.id,
          week,
        );

        if (!pending) {
          await interaction.reply({
            content: `No pending proposal from ${proposer} for Week ${week}.`,
            ephemeral: true,
          });
          return;
        }

        const result = await declineGameProposal(
          interaction.client,
          pending.id,
          interaction.user.id,
        );

        await interaction.reply({
          content: result,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "locked") {
        const team = getTeamByDiscordUserId(interaction.user.id);
        if (!team) {
          await interaction.reply({
            content: "You're not assigned to a team yet.",
            ephemeral: true,
          });
          return;
        }

        const matchup = getTeamMatchupForWeek(team.id, week);
        if (!matchup) {
          await interaction.reply({
            content: `No matchup scheduled for Week ${week}.`,
            ephemeral: true,
          });
          return;
        }

        const opponentTeam =
          matchup.homeTeam.id === team.id
            ? matchup.awayTeam
            : matchup.homeTeam;

        if (!opponentTeam.discordUserId) {
          await interaction.reply({
            content: `Your Week ${week} opponent is CPU — no game time to lock.`,
            ephemeral: true,
          });
          return;
        }

        const confirmed = getConfirmedGameTimeForPair(
          interaction.user.id,
          opponentTeam.discordUserId,
          week,
        );

        if (!confirmed) {
          await interaction.reply({
            content: `No game time locked yet for Week ${week}.`,
            ephemeral: true,
          });
          return;
        }

        const myTz = requireTimezone(interaction.user.id);
        const opponentTz = getUserTimezone(opponentTeam.discordUserId);
        if (!opponentTz) {
          await interaction.reply({
            content: "Your opponent hasn't set a timezone.",
            ephemeral: true,
          });
          return;
        }

        const userA = confirmed.proposerId;
        const userB = confirmed.recipientId;
        const tzA = getUserTimezone(userA) ?? myTz;
        const tzB = getUserTimezone(userB) ?? opponentTz;

        await interaction.reply({
          embeds: [
            buildLockedEmbed(
              week,
              confirmed,
              tzA,
              tzB,
              getMatchupLabel(userA, userB, week),
            ),
          ],
        });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);

    if (subcommand === "add") {
      if (focused.name === "date") {
        await interaction.respond(
          getDateSuggestions(interaction.user.id, focused.value),
        );
        return;
      }

      if (focused.name === "start") {
        await interaction.respond(getTimeSuggestions(focused.value));
        return;
      }

      if (focused.name === "end") {
        const start = interaction.options.getString("start");
        const minTime = start ? normalizeTimeInput(start) : undefined;
        await interaction.respond(getTimeSuggestions(focused.value, minTime));
        return;
      }
    }

    if (subcommand === "propose") {
      if (focused.name === "date") {
        await interaction.respond(
          getDateSuggestions(interaction.user.id, focused.value),
        );
        return;
      }

      if (focused.name === "time") {
        await interaction.respond(getTimeSuggestions(focused.value));
      }
    }
  },
};
