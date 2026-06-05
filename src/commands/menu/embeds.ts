// src/commands/menu/embeds.ts
import { EmbedBuilder } from "discord.js";
import { getTopCountEntries, getAllCounts } from "../../data";
import { PAGE_SIZE, EMBED_DESC_LIMIT, UNKNOWN_GUILD_MESSAGE } from "./menuPageDefs";
import { formatBigIntJP, formatCountWithReading, safeCount } from "./format";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { compareBigIntDesc } from "../../utils/bigint";
import { fetchGuildMembersSafe } from "../../utils/memberFetch";
import type { GuildScopedInteraction } from "./types";

export function joinLinesWithLimitOrNull(lines: string[], limit: number): string | null {
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const add = lines[i].length + (i === 0 ? 0 : 1);
    if (len + add > limit) return null;
    len += add;
  }
  return lines.join("\n");
}

function buildTooLongEmbed(title: string, actual: number, limit: number): EmbedBuilder {
  const dow = new Date().getDay();
  const messageByDow = [
    "月曜日：ムカムカしてもしょうがないよっ！！",
    "火曜日：大阪や！！おめえら他レギオンぶっ潰すぞ！！",
    "水曜日：botぶっ壊したらDMしやがれください。",
    "木曜日：大阪や！！レギオンぶっ潰さないと追放だぞわかったか！！",
    "金曜日：二次会行く？ 終電逃すなよ？？ 飲みすぎ注意！",
    "土曜日：とりあえず課金しろ。",
    "日曜日：明日はげっつようび！げっつようび！やったねぇ！！",
  ];
  return new EmbedBuilder().setTitle(title).setDescription(
    [
      `⚠️ ${messageByDow[dow]}`,
      "",
      `現在の文字数: ${actual}`,
      `上限: ${limit}`,
      "",
      "PAGE_SIZE を減らすか、表示形式を短くしてください。",
    ].join("\n"),
  );
}

export async function guildTopEmbed(i: GuildScopedInteraction): Promise<EmbedBuilder> {
  const gid = i.guildId;
  if (!gid) {
    return new EmbedBuilder().setTitle("しばきランキング").setDescription(UNKNOWN_GUILD_MESSAGE);
  }
  const entries = getTopCountEntries(gid, PAGE_SIZE);
  if (!entries.length) {
    return new EmbedBuilder().setTitle("しばきランキング").setDescription("まだ誰も しばかれていません。");
  }
  const lines = await Promise.all(
    entries.map(async ([uid, cnt], idx) => {
      const name = await displayNameFrom(i, uid);
      return `#${idx + 1} ${name} × **${formatCountWithReading(cnt)}**`;
    }),
  );
  const joined = lines.join("\n");
  const desc = joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT);
  if (desc === null) {
    return buildTooLongEmbed("しばきランキング（エラー）", joined.length, EMBED_DESC_LIMIT);
  }
  return new EmbedBuilder()
    .setTitle("しばきランキング")
    .setDescription(desc)
    .setFooter({ text: `上位 ${PAGE_SIZE} を表示 • ${new Date().toLocaleString("ja-JP")}` });
}

export async function guildMembersEmbed(i: GuildScopedInteraction): Promise<EmbedBuilder> {
  const gid = i.guildId;
  const guild = i.guild;
  if (!gid || !guild) {
    return new EmbedBuilder().setTitle("メンバー一覧").setDescription(UNKNOWN_GUILD_MESSAGE);
  }
  const counts = getAllCounts(gid);
  const { members } = await fetchGuildMembersSafe(guild);
  const humans = members.filter((m) => !m.user.bot);
  const rows = await Promise.all(
    humans.map(async (m) => ({
      tag: m.displayName || m.user.tag,
      id: m.id,
      count: counts[m.id] ?? 0n,
    })),
  );
  rows.sort((a, b) => {
    const cmp = compareBigIntDesc(a.count, b.count);
    return cmp !== 0 ? cmp : a.tag.localeCompare(b.tag);
  });
  const top = rows.slice(0, 20);
  const lines = top.map((r, idx) => `#${idx + 1} \`${r.tag}\` × **${formatCountWithReading(r.count)}**`);
  const joined = lines.join("\n");
  const desc = joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT);
  if (desc === null) {
    return buildTooLongEmbed("メンバー一覧（エラー）", joined.length, EMBED_DESC_LIMIT);
  }
  return new EmbedBuilder().setTitle("メンバー一覧").setDescription(desc);
}
