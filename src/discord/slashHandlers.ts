import type { ChatInputCommandInteraction } from "discord.js";
import { handleHelp } from "../commands/help";
import { handleIgnore } from "../commands/ignore";
import { handleMenu } from "../commands/menu";
import { handlePing } from "../commands/ping";
import { handleSbk } from "../commands/sbk";
import { SLASH_COMMAND } from "../constants/commands";

export type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

export const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.ping]: handlePing,
  [SLASH_COMMAND.sbk]: handleSbk,
  [SLASH_COMMAND.ignore]: handleIgnore,
  [SLASH_COMMAND.menu]: handleMenu,
  [SLASH_COMMAND.help]: handleHelp,
};
