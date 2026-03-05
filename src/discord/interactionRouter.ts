import type { ChatInputCommandInteraction } from "discord.js";
import { handleAiSlashCommand, isAiSlashCommand } from "../ai/handlers";
import { isMaintenanceCommand } from "../constants/commands";
import { getMaintenanceEnabled } from "../data";
import { ROOT_SLASH_HANDLERS } from "./slashHandlers";

export async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const commandName = interaction.commandName;
  if (
    interaction.guildId &&
    getMaintenanceEnabled(interaction.guildId) &&
    !isMaintenanceCommand(commandName)
  ) {
    await interaction.reply({
      content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
      ephemeral: true,
    });
    return;
  }

  if (isAiSlashCommand(commandName)) {
    await handleAiSlashCommand(interaction);
    return;
  }

  const handler = ROOT_SLASH_HANDLERS[commandName];
  if (!handler) {
    return;
  }

  await handler(interaction);
}
