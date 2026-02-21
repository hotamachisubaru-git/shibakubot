import {
  type ChatInputCommandInteraction,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { setMaintenanceEnabled } from "../data";
import { hasAdminGuildOwnerOrDevPermission } from "../utils/permissions";

type MaintenanceMode = "on" | "off";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

function toMaintenanceMode(raw: string): MaintenanceMode | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "on" || normalized === "off") {
    return normalized;
  }
  return null;
}

export async function handleMaintenance(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: `⚠️ ${COMMON_MESSAGES.guildOnly}`,
      ephemeral: true,
    });
    return;
  }

  if (!hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: "⚠️ 権限がありません。（管理者のみ）",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: `⚠️ ${COMMON_MESSAGES.guildUnavailable}`,
      ephemeral: true,
    });
    return;
  }

  const mode = toMaintenanceMode(interaction.options.getString("mode", true));
  if (!mode) {
    await interaction.reply({
      content: "⚠️ mode は on / off を指定してください。",
      ephemeral: true,
    });
    return;
  }

  const enabled = mode === "on";
  setMaintenanceEnabled(guildId, enabled);

  await interaction.reply({
    content: enabled
      ? "✅ メンテナンスモードを有効化しました。"
      : "✅ メンテナンスモードを無効化しました。",
    ephemeral: true,
  });
}
