import { SlashCommandBuilder } from "discord.js";
import {
  assignTeamToUser,
  getTeamsWithDiscordUsers,
  unassignTeamByName,
  unassignTeamByUserId,
} from "../services/database.js";
import type { Command } from "../types.js";
import { requireAdmin } from "../utils/admin.js";
import { buildTeamListEmbed } from "../utils/format.js";

export const teamCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Manage dynasty team assignments")
    .addSubcommand((sub) =>
      sub
        .setName("assign")
        .setDescription("Link a Discord user to their dynasty team")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The Discord user")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Team name (e.g. Georgia)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Show assigned team and user mappings"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unassign")
        .setDescription("Remove a Discord user from a team")
        .addUserOption((option) =>
          option.setName("user").setDescription("The Discord user to unassign"),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Team name to unassign (e.g. Georgia)"),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "assign") {
      if (!(await requireAdmin(interaction))) return;

      await interaction.deferReply({ ephemeral: true });

      const user = interaction.options.getUser("user", true);
      const name = interaction.options.getString("name", true);
      const team = assignTeamToUser(name, user.id);

      await interaction.editReply({
        content: `Assigned **${team.name}** to ${user}.`,
      });
      return;
    }

    if (subcommand === "unassign") {
      if (!(await requireAdmin(interaction))) return;

      const user = interaction.options.getUser("user");
      const name = interaction.options.getString("name");

      if (!user && !name) {
        await interaction.reply({
          content: "Provide a `user` or `name` to unassign.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      console.log(
        `[team unassign] by=${interaction.user.id} user=${user?.id ?? "none"} name=${name ?? "none"}`,
      );

      try {
        const team = user
          ? unassignTeamByUserId(user.id)
          : unassignTeamByName(name!);

        console.log(`[team unassign] success team=${team.name}`);
        await interaction.editReply({
          content: `Removed the assignment for **${team.name}**.`,
        });
      } catch (error) {
        console.error("[team unassign] failed:", error);
        const message =
          error instanceof Error ? error.message : "Failed to unassign team.";
        await interaction.editReply({ content: message });
      }
      return;
    }

    const teams = getTeamsWithDiscordUsers();
    await interaction.reply({
      embeds: [buildTeamListEmbed(teams)],
    });
  },
};
