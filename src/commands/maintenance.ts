import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { setMaintenanceEnabled } from "../data";

const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function handleMaintenance(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "⚠️ サーバー内でのみ使用できます。",
      ephemeral: true,
    });
    return;
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const isOwner = interaction.guild?.ownerId === interaction.user.id;
  const isDev = OWNER_IDS.includes(interaction.user.id);

  if (!isAdmin && !isOwner && !isDev) {
    await interaction.reply({
      content: "⚠️ 権限がありません。（管理者のみ）",
      ephemeral: true,
    });
    return;
  }

  const mode = interaction.options.getString("mode", true).toLowerCase();
  const enabled = mode === "on";
  setMaintenanceEnabled(interaction.guildId!, enabled);

  await interaction.reply({
    content: enabled
      ? "✅ メンテナンスモードを有効化しました。"
      : "✅ メンテナンスモードを無効化しました。",
    ephemeral: true,
  });
}
