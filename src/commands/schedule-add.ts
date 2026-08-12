import { SlashCommandBuilder } from "discord.js";
import {
  addMatchup,
  clearSeasonSchedule,
  getCurrentWeek,
  getMatchupsForWeek,
} from "../services/database.js";
import type { Command } from "../types.js";
import { requireAdmin } from "../utils/admin.js";
import { buildWeekScheduleEmbed, formatMatchupLine } from "../utils/format.js";

export const scheduleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Manage the dynasty schedule")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a matchup for a week")
        .addIntegerOption((option) =>
          option
            .setName("week")
            .setDescription("Week number")
            .setRequired(true)
            .setMinValue(0),
        )
        .addStringOption((option) =>
          option
            .setName("home")
            .setDescription("Home team name")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("away")
            .setDescription("Away team name")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("week")
        .setDescription("Show matchups for a week")
        .addIntegerOption((option) =>
          option
            .setName("week")
            .setDescription("Week number (defaults to current week)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear-season")
        .setDescription(
          "Delete all matchups and reset to Week 0 for a new season",
        )
        .addStringOption((option) =>
          option
            .setName("confirm")
            .setDescription('Type "confirm" to clear the entire season schedule')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      if (!(await requireAdmin(interaction))) return;

      const week = interaction.options.getInteger("week", true);
      const home = interaction.options.getString("home", true);
      const away = interaction.options.getString("away", true);

      try {
        const matchup = addMatchup(week, home, away);
        await interaction.reply({
          content: `Added Week ${week}: ${formatMatchupLine(matchup)}`,
          ephemeral: true,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to add matchup.";
        await interaction.reply({ content: message, ephemeral: true });
      }
      return;
    }

    if (subcommand === "clear-season") {
      if (!(await requireAdmin(interaction))) return;

      const confirm = interaction.options.getString("confirm", true);
      if (confirm.trim().toLowerCase() !== "confirm") {
        await interaction.reply({
          content:
            'To clear the season, run `/schedule clear-season` with `confirm` set to **confirm**. This deletes all matchups.',
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const result = clearSeasonSchedule();
        await interaction.editReply({
          content: [
            "Season schedule cleared.",
            `Removed **${result.matchupsRemoved}** matchup(s).`,
            `Removed **${result.availabilityRemoved}** availability window(s).`,
            `Removed **${result.proposalsRemoved}** game-time proposal(s).`,
            `Current week reset to **Week ${result.week}**.`,
            "Team assignments and timezones were kept.",
            "Add Season 2 matchups with `/schedule add`, then run `/week start-season`.",
          ].join("\n"),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to clear the season schedule.";
        await interaction.editReply({ content: message });
      }
      return;
    }

    const week =
      interaction.options.getInteger("week") ?? getCurrentWeek();
    const matchups = getMatchupsForWeek(week);

    await interaction.reply({
      embeds: [buildWeekScheduleEmbed(week, matchups)],
    });
  },
};
