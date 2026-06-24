import type { ChatInputCommandInteraction, GuildMemberRoleManager } from "discord.js";

function getAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function hasCommissionerRole(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return false;

  const roleName = process.env.COMMISSIONER_ROLE_NAME ?? "Commissioner";
  const member = interaction.member;

  if (!member || !("roles" in member)) return false;

  const roles = member.roles as GuildMemberRoleManager;
  if ("cache" in roles) {
    return roles.cache.some((role) => role.name === roleName);
  }

  return false;
}

export function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  if (getAdminUserIds().has(interaction.user.id)) return true;
  return hasCommissionerRole(interaction);
}

export async function requireAdmin(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (isAdmin(interaction)) return true;

  await interaction.reply({
    content:
      "You don't have permission to run this command. Ask a commissioner to run it, or add your user ID to `ADMIN_USER_IDS`.",
    ephemeral: true,
  });

  return false;
}
