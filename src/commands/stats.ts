// src/commands/stats.ts
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { loadGuildStore } from "../data";

// .env の OWNER_IDS=id1,id2,... を許可
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function handleStats(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内でのみ使用できます。",
      ephemeral: true,
    });
    return;
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const isOwner = OWNER_IDS.includes(interaction.user.id);

  if (!isAdmin && !isOwner) {
    await interaction.reply({
      content: "権限がありません（管理者/開発者のみ）",
      ephemeral: true,
    });
    return;
  }

  const store = loadGuildStore(interaction.guildId!);
  const counts = Object.values(store.counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const members = counts.length;
  const average = members > 0 ? (total / members).toFixed(2) : "0";

  const top = Object.entries(store.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uid, cnt], i) => `#${i + 1} <@${uid}> — **${cnt} 回**`)
    .join("\n") || "データなし";

  const embed = new EmbedBuilder()
    .setTitle("📊 しばき統計情報")
    .setDescription("現在のサーバー全体のしばかれ回数の統計です。")
    .addFields(
      { name: "総しばき回数", value: `${total} 回`, inline: true },
      { name: "登録メンバー数", value: `${members} 人`, inline: true },
      { name: "平均しばかれ回数", value: `${average} 回/人`, inline: true },
      { name: "しばかれ回数 TOP 5", value: top }
    )
    .setFooter({ text: `最終更新: ${new Date().toLocaleString("ja-JP")}` })
    .setColor(0x00ff7f);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}