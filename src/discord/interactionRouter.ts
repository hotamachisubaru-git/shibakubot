import type { ChatInputCommandInteraction } from "discord.js";
import { getAiSlashHandler } from "../ai/handlers";
import { getRuntimeConfig } from "../config/runtime";
import { SLASH_COMMAND } from "../constants/commands";
import { getMaintenanceEnabled } from "../data";
import { hasAdminGuildOwnerOrDevPermission } from "../utils/permissions";
import { ROOT_SLASH_HANDLERS } from "./slashHandlers";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

export async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const commandName = interaction.commandName;
  if (
    interaction.guildId &&
    getMaintenanceEnabled(interaction.guildId) &&
    !(
      commandName === SLASH_COMMAND.menu &&
      hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS)
    )
  ) {
    await interaction.reply({
      content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
      ephemeral: true,
    });
    return;
  }

  const handler =
    getAiSlashHandler(commandName) ?? ROOT_SLASH_HANDLERS[commandName];
  if (!handler) {
    return;
  }

  await handler(interaction);
}
