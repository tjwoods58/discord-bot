import type { ButtonInteraction } from "discord.js";
import {
  acceptGameProposal,
  declineGameProposal,
  parseProposalButtonId,
} from "../services/proposal-response.js";

export async function handleProposalButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseProposalButtonId(interaction.customId);
  if (!parsed) return;

  try {
    const resultMessage =
      parsed.action === "accept"
        ? await acceptGameProposal(
            interaction.client,
            parsed.proposalId,
            interaction.user.id,
          )
        : await declineGameProposal(
            interaction.client,
            parsed.proposalId,
            interaction.user.id,
          );

    const statusLine =
      parsed.action === "accept"
        ? `\n\n**Accepted.** ${resultMessage}`
        : `\n\n**Declined.** ${resultMessage}`;

    const existingContent =
      typeof interaction.message.content === "string"
        ? interaction.message.content
        : "Game time proposal";

    await interaction.update({
      content: `${existingContent}${statusLine}`,
      components: [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}
