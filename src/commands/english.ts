import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { isEnglishBanExemptGuild, setEnglishBanEnabled } from "../data";

const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function handleEnglish(interaction: ChatInputCommandInteraction) {
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

  if (isEnglishBanExemptGuild(interaction.guildId!)) {
    await interaction.reply({
      content:
        "⚠️ このサーバーは英語禁止の免除対象です。解除されるまで切り替えできません。",
      ephemeral: true,
    });
    return;
  }

  const mode = interaction.options.getString("mode", true).toLowerCase();
  const enabled = mode === "on";
  setEnglishBanEnabled(interaction.guildId!, enabled);

  await interaction.reply({
    content: enabled
      ? "✅ 英語禁止モードを有効化しました。"
      : "✅ 英語禁止モードを無効化しました。",
    ephemeral: true,
  });
}
