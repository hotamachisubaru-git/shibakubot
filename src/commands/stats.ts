// src/commands/stats.ts
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { loadGuildStore } from "../data";
import { compareBigIntDesc } from "../utils/bigint";

// .env の OWNER_IDS=id1,id2,... を許可
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function formatAverage(total: bigint, members: number): string {
  if (members <= 0) return "0";
  const divisor = BigInt(members);
  const scaled = (total * 100n + divisor / 2n) / divisor;
  const integer = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

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
  const total = counts.reduce((a, b) => a + b, 0n);
  const members = counts.length;
  const average = formatAverage(total, members);

  const top = Object.entries(store.counts)
    .sort((a, b) => compareBigIntDesc(a[1], b[1]))
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
