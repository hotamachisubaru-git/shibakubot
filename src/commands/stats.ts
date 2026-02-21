// src/commands/stats.ts
import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { EMBED_COLORS } from "../constants/embedColors";
import { COMMON_MESSAGES } from "../constants/messages";
import { loadGuildStore } from "../data";
import { compareBigIntDesc } from "../utils/bigint";
import { hasAdminOrDevPermission } from "../utils/permissions";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

function formatAverage(total: bigint, members: number): string {
  if (members <= 0) return "0";
  const divisor = BigInt(members);
  const scaled = (total * 100n + divisor / 2n) / divisor;
  const integer = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0");
  return `${integer}.${fraction}`;
}

export async function handleStats(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!hasAdminOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: "権限がありません（管理者/開発者のみ）",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const store = loadGuildStore(guildId);
  const counts = Object.values(store.counts);
  const total = counts.reduce((a, b) => a + b, 0n);
  const members = counts.length;
  const average = formatAverage(total, members);

  const top =
    Object.entries(store.counts)
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
      { name: "しばかれ回数 TOP 5", value: top },
    )
    .setFooter({ text: `最終更新: ${new Date().toLocaleString("ja-JP")}` })
    .setColor(EMBED_COLORS.success);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
