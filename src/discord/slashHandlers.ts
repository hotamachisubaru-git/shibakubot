import type { ChatInputCommandInteraction } from "discord.js";
import { handleCheck } from "../commands/sbk/check";
import { handleImmune } from "../commands/sbk/immune";
import { handleIgnore } from "../commands/sbk/ignore";
import { handleMenu } from "../commands/system/menu";
import { handleReset } from "../commands/sbk/reset";
import { handleSbk } from "../commands/sbk/sbk";
import { SLASH_COMMAND } from "../constants/commands";

export type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

export const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.sbk]: handleSbk,
  [SLASH_COMMAND.check]: handleCheck,
  [SLASH_COMMAND.immune]: handleImmune,
  [SLASH_COMMAND.ignore]: handleIgnore,
  [SLASH_COMMAND.reset]: handleReset,
  [SLASH_COMMAND.menu]: handleMenu,
};
