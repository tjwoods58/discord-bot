import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const token = requireEnv("DISCORD_TOKEN");
const clientId = requireEnv("CLIENT_ID");
const guildId = requireEnv("GUILD_ID");

const rest = new REST().setToken(token);

const body = commands.map((command) => command.data.toJSON());

console.log(`Registering ${body.length} slash command(s) to guild ${guildId}...`);

await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });

console.log("Slash commands registered successfully.");
