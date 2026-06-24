import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface Team {
  id: number;
  name: string;
  discordUserId: string | null;
}

export interface Matchup {
  id: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
}

export interface MatchupWithTeams {
  id: number;
  week: number;
  homeTeam: Team;
  awayTeam: Team;
}

export interface AvailabilitySlot {
  id: number;
  discordUserId: string;
  week: number;
  startUtc: Date;
  endUtc: Date;
}

export interface GameTimeProposal {
  id: number;
  week: number;
  proposerId: string;
  recipientId: string;
  startUtc: Date;
  status: "pending" | "confirmed" | "declined";
  createdAt: Date;
}

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

declare module "discord.js" {
  interface Client {
    commands: import("discord.js").Collection<string, Command>;
  }
}
