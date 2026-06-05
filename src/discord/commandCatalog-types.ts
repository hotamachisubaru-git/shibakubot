import { SlashCommandBuilder } from "discord.js";

export type HelpCommand = Readonly<{
  name: string;
  description: string;
}>;

export type CommandDefinition = Readonly<{
  name: string;
  description: string;
  createBuilder: () => { toJSON: SlashCommandBuilder["toJSON"] };
  helpCommands: readonly HelpCommand[];
}>;
