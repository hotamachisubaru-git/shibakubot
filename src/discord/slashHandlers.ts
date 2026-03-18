import type { ChatInputCommandInteraction } from "discord.js";
import { handleHelp } from "../commands/help";
import { handlePing } from "../commands/ping";
import { SLASH_COMMAND } from "../constants/commands";

export type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

export const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.ping]: handlePing,
  [SLASH_COMMAND.help]: handleHelp,
};
