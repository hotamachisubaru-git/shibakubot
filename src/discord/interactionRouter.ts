import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
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

async function routeChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const commandName = interaction.commandName;
  const canManageIgnore =
    interaction.guildId !== null &&
    commandName === SLASH_COMMAND.ignore &&
    hasAdminOrDevPermission(interaction, OWNER_IDS);
  const canOpenMaintenanceMenu =
    commandName === SLASH_COMMAND.menu &&
    hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS);

  if (
    interaction.guildId &&
    getMaintenanceEnabled(interaction.guildId) &&
    !(canManageIgnore || canOpenMaintenanceMenu)
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

  const handler = ROOT_SLASH_HANDLERS[commandName];
  if (!handler) {
    return;
  }

  await handler(interaction);
}

async function respondToChatInputFailure(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const content = "⚠️ コマンド処理中にエラーが発生しました。時間をおいて再度お試しください。";
  try {
    if (interaction.deferred) {
      await interaction.editReply({ content });
      return;
    }
    if (interaction.replied) {
      await interaction.followUp({ content, flags: "Ephemeral" });
      return;
    }
    await interaction.reply({ content, flags: "Ephemeral" });
  } catch (responseError) {
    console.warn("[interaction] failed to send command error response", {
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    }, responseError);
  }
}

export async function handleChatInputInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    await routeChatInputInteraction(interaction);
  } catch (error) {
    console.error("[interaction] slash command failed", {
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      deferred: interaction.deferred,
      replied: interaction.replied,
    }, error);
    await respondToChatInputFailure(interaction);
  }
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
