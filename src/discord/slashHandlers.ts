import type { ChatInputCommandInteraction } from "discord.js";
import { handleCheck } from "../commands/check";
import { handleControl } from "../commands/control";
import { handleHelp } from "../commands/help";
import { handleImmune } from "../commands/immune";
import { handleMaintenance } from "../commands/maintenance";
import { handleMembers } from "../commands/members";
import { handleMenu } from "../commands/menu";
import { handleMonday } from "../commands/monday";
import { handlePing } from "../commands/ping";
import { handleReset } from "../commands/reset";
import { handleSbk } from "../commands/sbk";
import { handleStats } from "../commands/stats";
import { handleSuimin } from "../commands/suiminbunihaire";
import { handleTop } from "../commands/top";
import { handleVs } from "../commands/vs";
import { SLASH_COMMAND } from "../constants/commands";

export type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

export const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.ping]: handlePing,
  [SLASH_COMMAND.sbk]: handleSbk,
  [SLASH_COMMAND.check]: handleCheck,
  [SLASH_COMMAND.control]: handleControl,
  [SLASH_COMMAND.immune]: handleImmune,
  [SLASH_COMMAND.menu]: handleMenu,
  [SLASH_COMMAND.suimin]: handleSuimin,
  [SLASH_COMMAND.members]: handleMembers,
  [SLASH_COMMAND.help]: handleHelp,
  [SLASH_COMMAND.monday]: handleMonday,
  [SLASH_COMMAND.maintenance]: handleMaintenance,
  [SLASH_COMMAND.maintenanceAlias]: handleMaintenance,
  [SLASH_COMMAND.stats]: handleStats,
  [SLASH_COMMAND.reset]: handleReset,
  [SLASH_COMMAND.top]: handleTop,
  [SLASH_COMMAND.vs]: handleVs,
};
