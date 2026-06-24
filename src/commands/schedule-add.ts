import { SlashCommandBuilder } from "discord.js";
import {
  addMatchup,
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
            .setMinValue(1),
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

    const week =
      interaction.options.getInteger("week") ?? getCurrentWeek();
    const matchups = getMatchupsForWeek(week);

    await interaction.reply({
      embeds: [buildWeekScheduleEmbed(week, matchups)],
    });
  },
};
