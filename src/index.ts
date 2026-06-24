import "dotenv/config";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { commands } from "./commands/index.js";
import { onReady } from "./events/ready.js";
import { handleProposalButton } from "./handlers/proposal-buttons.js";
import { initDatabase } from "./services/database.js";
import type { Command } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection<string, Command>();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  onReady(readyClient);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(
        `Error autocompleting /${interaction.commandName}:`,
        error,
      );
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("availability:")) {
      try {
        await handleProposalButton(interaction);
      } catch (error) {
        console.error("Error handling proposal button:", error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);

    const reply = {
      content: "There was an error executing this command.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

requireEnv("DISCORD_TOKEN");
initDatabase();
client.login(process.env.DISCORD_TOKEN);
