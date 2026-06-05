import type { ChatInputCommandInteraction } from "discord.js";
import { handleHelp } from "../commands/system/help";
import { handleIgnore } from "../commands/sbk/ignore";
import { handleMenu } from "../commands/system/menu";
import { handlePing } from "../commands/system/ping";
import { handleSbk } from "../commands/sbk/sbk";
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
