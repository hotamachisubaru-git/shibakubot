import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { setMaintenanceEnabled } from "../data";

type MaintenanceMode = "on" | "off";

const OWNER_IDS = new Set(
  (process.env.OWNER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0),
);

function toMaintenanceMode(raw: string): MaintenanceMode | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "on" || normalized === "off") {
    return normalized;
  }
  return null;
}

function canToggleMaintenance(
  interaction: ChatInputCommandInteraction,
): boolean {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const isGuildOwner = interaction.guild?.ownerId === interaction.user.id;
  const isDevOwner = OWNER_IDS.has(interaction.user.id);
  return isAdmin || isGuildOwner || isDevOwner;
}

export async function handleMaintenance(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "⚠️ サーバー内でのみ使用できます。",
      ephemeral: true,
    });
    return;
  }

  if (!canToggleMaintenance(interaction)) {
    await interaction.reply({
      content: "⚠️ 権限がありません。（管理者のみ）",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "⚠️ サーバー情報を取得できませんでした。",
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
