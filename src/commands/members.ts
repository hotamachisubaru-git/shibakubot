// src/commands/members.ts
import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { loadGuildStore } from "../data";
import { compareBigIntDesc } from "../utils/bigint";
import { fetchGuildMembersSafe } from "../utils/memberFetch";

type MemberRow = Readonly<{
  tag: string;
  id: string;
  count: bigint;
}>;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function handleMembers(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const guildId = interaction.guildId;
    if (!guild || !guildId) {
      await interaction.editReply({
        content: "サーバー情報を取得できませんでした。",
      });
      return;
    }

    const store = loadGuildStore(guildId);
    const { members, fromCache } = await fetchGuildMembersSafe(guild);
    const humans = members.filter((m) => !m.user.bot);

    const rows: MemberRow[] = humans
      .map((m) => ({
        tag: m.displayName || m.user.tag,
        id: m.id,
        count: store.counts[m.id] ?? 0n,
      }))
      .sort((a, b) => {
        const byCount = compareBigIntDesc(a.count, b.count);
        return byCount !== 0 ? byCount : a.tag.localeCompare(b.tag, "ja");
      });

    const top = rows.slice(0, 20);
    const lines = top.map(
      (row, index) =>
        `#${index + 1} \`${row.tag}\` × **${row.count.toString()}**`,
    );

    const embed = new EmbedBuilder()
      .setTitle("全メンバーのしばかれ回数（BOT除外）")
      .setDescription(lines.join("\n") || "メンバーがいません（または全員 0）")
      .setFooter({
        text: `合計 ${rows.length} 名${fromCache ? "（キャッシュのみ）" : ""} • ${new Date().toLocaleString("ja-JP")}`,
      });

    const header = "rank,tag,id,count";
    const csv = [
      header,
      ...rows.map(
        (row, index) =>
          `${index + 1},${csvEscape(row.tag)},${row.id},${row.count.toString()}`,
      ),
    ].join("\n");
    const file = new AttachmentBuilder(Buffer.from(csv, "utf8"), {
      name: "members.csv",
    });

    await interaction.editReply({
      embeds: [embed],
      files: [file],
    });
  } catch (e) {
    console.error("[members] error", e);
    await interaction.editReply({ content: "エラーが発生しました。" });
  }
}
