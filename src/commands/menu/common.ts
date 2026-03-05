// src/commands/menu/common.ts
import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageComponentInteraction,
} from "discord.js";
import { loadGuildStore } from "../../data";
import { getRuntimeConfig } from "../../config/runtime";
import { COMMON_MESSAGES } from "../../constants/messages";
import { SETTING_KEYS } from "../../constants/settings";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { compareBigIntDesc } from "../../utils/bigint";
import { fetchGuildMembersSafe } from "../../utils/memberFetch";
import { hasAdminOrDevPermission } from "../../utils/permissions";

export type GuildScopedInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction;
export type PanelMessage = Awaited<ReturnType<ButtonInteraction["fetchReply"]>>;

/* ===== 設定 ===== */
const runtimeConfig = getRuntimeConfig();
export const OWNER_IDS = runtimeConfig.discord.ownerIds;
const PAGE_SIZE = 10;
export const AUDIT_LIMIT = 10;
export const BACKUP_LIST_LIMIT = 5;
export const LOG_CHANNEL_KEY = SETTING_KEYS.logChannelId;
export const EMBED_DESC_LIMIT = 4096; // ← ここは自由に変更OK
export const UNKNOWN_GUILD_MESSAGE = `⚠️ ${COMMON_MESSAGES.guildUnavailable}`;


export function joinLinesWithLimitOrNull(
  lines: string[],
  limit: number,
): string | null {
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const add = lines[i].length + (i === 0 ? 0 : 1); // 改行分
    if (len + add > limit) return null;
    len += add;
  }
  return lines.join("\n");
}
function buildTooLongEmbed(title: string, actual: number, limit: number) {
  const dow = new Date().getDay(); // 0=日 ... 6=土

  const messageByDow = [
    "月曜日：ムカムカしてもしょうがないよっ！！",
    "火曜日：大阪や！！おめえら他レギオンぶっ潰すぞ！！",
    "水曜日：botぶっ壊したらDMしやがれください。",
    "木曜日：大阪や！！レギオンぶっ潰さないと追放だぞわかったか！！",
    "金曜日：二次会行く？ 終電逃すなよ？？ 飲みすぎ注意！",
    "土曜日：とりあえず課金しろ。",
    "日曜日：明日はげっつようび！げっつようび！やったねぇ！！",
  ];

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
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

export function safeSignedBigInt(value: bigint): string {
  const sign = value < 0n ? "-" : "+";
  const abs = value < 0n ? -value : value;
  return sign + safeCount(abs, 16);
}

function getGuildId(interaction: GuildScopedInteraction): string | null {
  return interaction.guildId;
}

function getGuildOrNull(interaction: GuildScopedInteraction) {
  return interaction.guild;
}

function resolveCollectorChannel(interaction: ButtonInteraction) {
  const channel = interaction.channel;
  if (!channel) {
    throw new Error("message component channel is unavailable");
  }
  return channel;
}

export async function clearPanelComponents(panel: PanelMessage): Promise<void> {
  try {
    await panel.edit({ components: [] });
  } catch {
    // noop
  }
}

export function pickUnionValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export async function guildTopEmbed(
  i: GuildScopedInteraction,
): Promise<EmbedBuilder> {
  const gid = getGuildId(i);
  if (!gid) {
    return new EmbedBuilder()
      .setTitle("しばきランキング")
      .setDescription(UNKNOWN_GUILD_MESSAGE);
  }

  const store = loadGuildStore(gid);
  const entries = Object.entries(store.counts);

  if (!entries.length) {
    return new EmbedBuilder()
      .setTitle("しばきランキング")
      .setDescription("まだ誰も しばかれていません。");
  }

  const lines = await Promise.all(
    entries
      .sort((a, b) => compareBigIntDesc(a[1], b[1]))
      .slice(0, PAGE_SIZE)
      .map(async ([uid, cnt], idx) => {
        const name = await displayNameFrom(i, uid);
        return `#${idx + 1} ${name} × **${formatCountWithReading(cnt)}**`;
      }),
  );

  const joined = lines.join("\n");
  const desc = joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT);

  if (desc === null) {
    return buildTooLongEmbed(
      "しばきランキング（エラー）",
      joined.length,
      EMBED_DESC_LIMIT,
    );
  }

  return new EmbedBuilder()
    .setTitle("しばきランキング")
    .setDescription(desc)
    .setFooter({
      text: `上位 ${PAGE_SIZE} を表示 • ${new Date().toLocaleString("ja-JP")}`,
    });
}

export async function guildMembersEmbed(
  i: GuildScopedInteraction,
): Promise<EmbedBuilder> {
  const gid = getGuildId(i);
  const guild = getGuildOrNull(i);
  if (!gid || !guild) {
    return new EmbedBuilder()
      .setTitle("メンバー一覧")
      .setDescription(UNKNOWN_GUILD_MESSAGE);
  }

  const store = loadGuildStore(gid);
  const { members } = await fetchGuildMembersSafe(guild);
  const humans = members.filter((m) => !m.user.bot);

  const rows = await Promise.all(
    humans.map(async (m) => ({
      tag: m.displayName || m.user.tag,
      id: m.id,
      count: store.counts[m.id] ?? 0n,
    })),
  );

  rows.sort((a, b) => {
    const cmp = compareBigIntDesc(a.count, b.count);
    return cmp !== 0 ? cmp : a.tag.localeCompare(b.tag);
  });

  const top = rows.slice(0, 20);

  const lines = top.map(
    (r, idx) =>
      `#${idx + 1} \`${r.tag}\` × **${formatCountWithReading(r.count)}**`,
  );

  const joined = lines.join("\n");
  const desc = joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT);

  if (desc === null) {
    return buildTooLongEmbed(
      "メンバー一覧（エラー）",
      joined.length,
      EMBED_DESC_LIMIT,
    );
  }

  return new EmbedBuilder().setTitle("メンバー一覧").setDescription(desc);
}

export function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
  return rows.map((r) => {
    const cloned = new ActionRowBuilder<ButtonBuilder>();
    const comps = r.components.map((c) =>
      ButtonBuilder.from(c).setDisabled(true),
    );
    cloned.addComponents(comps);
    return cloned;
  });
}

/* ===== ヘルパー ===== */
// ===== 数値フォーマット（BigInt -> 日本語単位） =====
const JP_UNITS = [
  { value: 10n ** 28n, label: "穣" },
  { value: 10n ** 24n, label: "秭" },
  { value: 10n ** 20n, label: "垓" },
  { value: 10n ** 16n, label: "京" },
  { value: 10n ** 12n, label: "兆" },
  { value: 10n ** 8n, label: "億" },
  { value: 10n ** 4n, label: "万" },
] as const;

function formatBigIntJP(n: bigint, maxParts = 3): string {
  if (n < 10_000n) return n.toString();

  let rest = n;
  const parts: string[] = [];

  for (const { value, label } of JP_UNITS) {
    if (rest >= value) {
      const q = rest / value;
      rest %= value;
      parts.push(`${q}${label}`);
      if (parts.length >= maxParts) break;
    }
  }
  return parts.join("");
}

export function safeCount(n: bigint, maxLen = 20): string {
  const s = formatBigIntJP(n);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export function formatCountWithReading(n: bigint): string {
  const short = safeCount(n);
  const full = formatWithComma(n);
  if (full === short) return `${short}回`;
  return `${short}回（${full}回）`;
}

function formatWithComma(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  const fixed = idx === 0 ? size.toFixed(0) : size.toFixed(size >= 10 ? 0 : 1);
  return `${fixed} ${units[idx]}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  if (minutes || parts.length) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatTimestamp(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("") +
    "-" +
    [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join("")
  );
}

export function listBackupFiles(dir: string, limit: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse();
  return files.slice(0, limit).map((name) => {
    const full = path.join(dir, name);
    const size = fs.existsSync(full)
      ? formatBytes(fs.statSync(full).size)
      : "0 B";
    return `${name} (${size})`;
  });
}

export function copyDbWithWal(src: string, dest: string): string[] {
  if (!fs.existsSync(src)) return [];
  ensureDir(path.dirname(dest));
  const copied: string[] = [];
  fs.copyFileSync(src, dest);
  copied.push(dest);
  for (const suffix of ["-wal", "-shm"]) {
    const walSrc = `${src}${suffix}`;
    if (fs.existsSync(walSrc)) {
      const walDest = `${dest}${suffix}`;
      fs.copyFileSync(walSrc, walDest);
      copied.push(walDest);
    }
  }
  return copied;
}

export function looksLikeSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

export async function requireAdminOrDev(
  i: MessageComponentInteraction,
  message = "この操作は管理者/開発者のみ利用できます。",
): Promise<boolean> {
  if (!hasAdminOrDevPermission(i, OWNER_IDS)) {
    await i.reply({ content: `⚠️ ${message}`, ephemeral: true });
    return false;
  }
  return true;
}

export async function showModalAndAwait(
  interactor: MessageComponentInteraction,
  modal: ModalBuilder,
  time = 60_000,
): Promise<ModalSubmitInteraction | null> {
  await interactor.showModal(modal);
  return interactor
    .awaitModalSubmit({
      time,
      filter: (m: ModalSubmitInteraction) => m.user.id === interactor.user.id,
    })
    .catch(() => null);
}

export function createPanelCollector(
  interaction: ButtonInteraction,
  panel: PanelMessage,
  time = 120_000,
) {
  return resolveCollectorChannel(interaction).createMessageComponentCollector({
    time,
    filter: (i) =>
      i.user.id === interaction.user.id && i.message.id === panel.id,
  });
}

export function bindPanelCleanup(
  collector: ReturnType<typeof createPanelCollector>,
  panel: PanelMessage,
) {
  collector.on("end", async () => {
    await clearPanelComponents(panel);
  });
}

/* ===== メニューUI ===== */
export function buildMenu(min: number, max: number, page: number = 1) {
  const maxPage = 4;
  const pageName =
    page === 1
      ? "基本"
      : page === 2
        ? "VC"
        : page === 3
          ? "管理者"
          : "管理者（2）";

  const embed = new EmbedBuilder()
    .setTitle("しばくbot メニュー")
    .setDescription(
      `下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。\n` +
        `現在のしばく回数: **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回**\n` +
        `表示カテゴリ: **${pageName} (${page}/${maxPage})**`,
    );

  // 基本操作
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_top")
      .setLabel("ランキング")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("menu_members")
      .setLabel("メンバー一覧")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_stats")
      .setLabel("統計")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_help")
      .setLabel("ヘルプ")
      .setStyle(ButtonStyle.Secondary),
  );

  // 管理者（設定系）
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_limit")
      .setLabel("上限設定")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_immune")
      .setLabel("免除管理")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_control")
      .setLabel("値を直接設定")
      .setStyle(ButtonStyle.Secondary),
  );

  // VC 関連
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_movevc")
      .setLabel("VC移動")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("menu_vcdisconnect")
      .setLabel("VC切断")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("menu_vcmute")
      .setLabel("VCミュート")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_vcunmute")
      .setLabel("VCアンミュート")
      .setStyle(ButtonStyle.Secondary),
  );

  // 管理者（2）向け（監査ログなど）
  const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_audit")
      .setLabel("監査ログ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_settings")
      .setLabel("サーバー設定")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_devtools")
      .setLabel("開発者ツール")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_sysstats")
      .setLabel("システム統計")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_backup")
      .setLabel("バックアップ作業")
      .setStyle(ButtonStyle.Secondary),
  );

  // ページごとに出す行を切り替える
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (page === 1) {
    rows.push(row1); // 基本
  } else if (page === 2) {
    rows.push(row4); // VC
  } else if (page === 3) {
    rows.push(row2); // 管理者
  } else if (page === 4) {
    rows.push(row5); // 管理者（2）
  }

  // 下部ページナビ
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_page_basic")
      .setLabel("基本")
      .setStyle(page === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_page_vc")
      .setLabel("VC")
      .setStyle(page === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_page_admin")
      .setLabel("管理者")
      .setStyle(page === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_page_admin2")
      .setLabel("管理者（2）")
      .setStyle(page === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger),
  );
  rows.push(navRow);

  return { embed, rows };
}
