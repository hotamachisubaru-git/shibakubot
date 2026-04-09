import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { getAiSlashHandler } from "../ai/handlers";
import { getRuntimeConfig } from "../config/runtime";
import { SLASH_COMMAND } from "../constants/commands";
import { getMaintenanceEnabled, isIgnoredUser } from "../data";
import {
  hasAdminGuildOwnerOrDevPermission,
  hasAdminOrDevPermission,
} from "../utils/permissions";
import { ROOT_SLASH_HANDLERS } from "./slashHandlers";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

export async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const commandName = interaction.commandName;
  const canManageIgnore =
    interaction.guildId !== null &&
    commandName === SLASH_COMMAND.ignore &&
    hasAdminOrDevPermission(interaction, OWNER_IDS);

  if (
    interaction.guildId &&
    getMaintenanceEnabled(interaction.guildId) &&
    !(
      canManageIgnore ||
      (commandName === SLASH_COMMAND.menu &&
        hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS))
    )
  ) {
    await interaction.reply({
      content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
      flags: "Ephemeral",
    });
    return;
  }

  if (
    interaction.guildId &&
    isIgnoredUser(interaction.guildId, interaction.user.id) &&
    !canManageIgnore
  ) {
    await interaction.reply({
      content: "このサーバーではあなたは ignore 対象のため、この BOT はコマンドを処理しません。",
      flags: "Ephemeral",
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

export async function handleAutocompleteInteraction(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (
    interaction.guildId &&
    isIgnoredUser(interaction.guildId, interaction.user.id)
  ) {
    await interaction.respond([]);
    return;
  }

  await interaction.respond([]);
}
