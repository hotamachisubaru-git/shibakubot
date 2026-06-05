import { SlashCommandBuilder } from "discord.js";
import type { HelpCommand } from "./commandCatalog-types";

export type CommandDefinition = Readonly<{
  name: string;
  description: string;
  createBuilder: () => { toJSON: SlashCommandBuilder["toJSON"] };
  helpCommands: readonly HelpCommand[];
}>;

export function defineCommand(
  name: string,
  description: string,
  configure?: (builder: SlashCommandBuilder) => void,
  options?: { helpCommands?: readonly HelpCommand[] },
): CommandDefinition {
  return {
    name,
    description,
    helpCommands:
      options?.helpCommands ??
      [{ name: `/${name}`, description }],
    createBuilder: () => {
      const builder = new SlashCommandBuilder()
        .setName(name)
        .setDescription(description);
      configure?.(builder);
      return builder;
    },
  };
}
