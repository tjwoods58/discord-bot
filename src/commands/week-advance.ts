import { SlashCommandBuilder } from "discord.js";
import {
  clearNextAdvanceAt,
  getCurrentWeek,
  getNextAdvanceAt,
  setCurrentWeek,
} from "../services/database.js";
import { advanceWeekAndNotify } from "../services/week-notify.js";
import type { Command } from "../types.js";
import { requireAdmin } from "../utils/admin.js";
import { formatNextAdvance } from "../utils/deadlines.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const weekCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("week")
    .setDescription("Manage the dynasty week")
    .addSubcommand((sub) =>
      sub
        .setName("advance")
        .setDescription(
          "Advance to the next week and notify players of their matchups",
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("current")
        .setDescription("Show the league's current week number"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("next")
        .setDescription("Show when the next week advance is scheduled"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the league's current week number")
        .addIntegerOption((option) =>
          option
            .setName("week")
            .setDescription("Week number")
            .setRequired(true)
            .setMinValue(1),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "current") {
      const week = getCurrentWeek();
      await interaction.reply({
        content: `The dynasty is currently on **Week ${week}**.`,
      });
      return;
    }

    if (subcommand === "next") {
      const deadline = getNextAdvanceAt();
      if (!deadline) {
        await interaction.reply({
          content:
            "No next advance is scheduled yet. The commissioner needs to run `/week advance` first.",
        });
        return;
      }

      await interaction.reply({
        content: formatNextAdvance(deadline),
      });
      return;
    }

    if (!(await requireAdmin(interaction))) return;

    if (subcommand === "set") {
      const week = interaction.options.getInteger("week", true);
      setCurrentWeek(week);
      clearNextAdvanceAt();
      await interaction.reply({
        content: `Current week set to **Week ${week}**.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const scheduleChannelId = requireEnv("SCHEDULE_CHANNEL_ID");
      const result = await advanceWeekAndNotify(
        interaction.client,
        scheduleChannelId,
      );

      const lines = [
        `Advanced to **Week ${result.newWeek}**.`,
        `Posted ${result.matchupCount} matchup(s) to <#${scheduleChannelId}>.`,
        `Notified ${result.notifiedCount} player(s).`,
      ];

      if (result.byeCount > 0) {
        lines.push(`${result.byeCount} player(s) notified of a bye week.`);
      }

      if (result.dmFailures.length > 0) {
        lines.push(
          `Could not DM ${result.dmFailures.length} player(s) — they were mentioned in the schedule channel instead.`,
        );
      }

      await interaction.editReply({ content: lines.join("\n") });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to advance the week.";
      await interaction.editReply({ content: message });
    }
  },
};
