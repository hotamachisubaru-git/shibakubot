import { SlashCommandBuilder } from "discord.js";
import { baseCommandDefinitions } from "./commandCatalog-base";
import type { HelpCommand } from "./commandCatalog-types";

const miscCommandDefinitions: readonly import("./commandCatalog-types").CommandDefinition[] = [];

const commandDefinitions: readonly import("./commandCatalog-types").CommandDefinition[] = [
  ...baseCommandDefinitions,
  ...miscCommandDefinitions,
];

export function getSlashCommandJson(): Array<
  ReturnType<SlashCommandBuilder["toJSON"]>
> {
  return commandDefinitions.map((definition) =>
    definition.createBuilder().toJSON(),
  );
}

export const HELP_COMMANDS: readonly HelpCommand[] = commandDefinitions
  .flatMap((definition) => definition.helpCommands);
