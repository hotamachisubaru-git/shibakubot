import type { ChatInputCommandInteraction } from "discord.js";
import { getAiSlashHandler } from "../ai/handlers";
import { getMaintenanceEnabled } from "../data";
import { ROOT_SLASH_HANDLERS } from "./slashHandlers";

export async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.guildId && getMaintenanceEnabled(interaction.guildId)) {
    await interaction.reply({
      content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
      ephemeral: true,
    });
    return;
  }

  const commandName = interaction.commandName;
  const handler =
    getAiSlashHandler(commandName) ?? ROOT_SLASH_HANDLERS[commandName];
  if (!handler) {
    return;
  }

  await handler(interaction);
}
