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

type MenuActionDefinition = Readonly<{
  customId: string;
  label: string;
  style: ButtonStyle;
  summary: string;
}>;

export type MenuPageDefinition = Readonly<{
  page: number;
  navCustomId: string;
  navLabel: string;
  title: string;
  summary: string;
  permissionNote: string;
  actions: readonly MenuActionDefinition[];
}>;

export const MENU_PAGE_DEFINITIONS: readonly MenuPageDefinition[] = [
  {
    page: 1,
    navCustomId: "menu_page_basic",
    navLabel: "基本",
    title: "基本メニュー",
    summary: "ランキング確認やサーバー状況の確認に使います。",
    permissionNote: "誰でも利用できます。",
    actions: [
      {
        customId: "menu_top",
        label: "ランキング",
        style: ButtonStyle.Primary,
        summary: "しばかれ回数の上位を確認します。",
      },
      {
        customId: "menu_members",
        label: "メンバー一覧",
        style: ButtonStyle.Secondary,
        summary: "対象メンバーと回数をまとめて確認します。",
      },
      {
        customId: "menu_stats",
        label: "サーバー統計",
        style: ButtonStyle.Secondary,
        summary: "総回数や対象人数を確認します。",
      },
      {
        customId: "menu_help",
        label: "使い方",
        style: ButtonStyle.Secondary,
        summary: "カテゴリ別の使い分けを確認します。",
      },
    ],
  },
  {
    page: 2,
    navCustomId: "menu_page_vc",
    navLabel: "VC操作",
    title: "VC操作",
    summary: "ボイスチャンネル参加者を一括で操作します。",
    permissionNote:
      "管理者 / VC権限保持者 / 開発者が利用できます。",
    actions: [
      {
        customId: "menu_movevc",
        label: "VC移動",
        style: ButtonStyle.Primary,
        summary: "選択したメンバーを別のVCへ移動します。",
      },
      {
        customId: "menu_vcdisconnect",
        label: "VC切断",
        style: ButtonStyle.Danger,
        summary: "選択したメンバーをVCから切断します。",
      },
      {
        customId: "menu_vcmute",
        label: "VCミュート",
        style: ButtonStyle.Secondary,
        summary: "選択したメンバーをサーバーミュートします。",
      },
      {
        customId: "menu_vcunmute",
        label: "ミュート解除",
        style: ButtonStyle.Secondary,
        summary: "サーバーミュートを解除します。",
      },
    ],
  },
  {
    page: 3,
    navCustomId: "menu_page_admin",
    navLabel: "管理設定",
    title: "管理設定",
    summary: "しばき回数のルールと対象者を管理します。",
    permissionNote: "管理者 / 開発者が利用できます。",
    actions: [
      {
        customId: "menu_limit",
        label: "回数レンジ",
        style: ButtonStyle.Secondary,
        summary: "ランダム回数の最小値と最大値を設定します。",
      },
      {
        customId: "menu_immune",
        label: "免除管理",
        style: ButtonStyle.Secondary,
        summary: "免除ユーザーの追加・削除・一覧確認を行います。",
      },
      {
        customId: "menu_control",
        label: "回数を設定",
        style: ButtonStyle.Secondary,
        summary: "特定ユーザーの回数を直接変更します。",
      },
    ],
  },
  {
    page: 4,
    navCustomId: "menu_page_admin2",
    navLabel: "ログ/保守",
    title: "ログと保守",
    summary: "監査、設定、バックアップなどの運用作業を行います。",
    permissionNote:
      "監査ログ / ログ設定 / システム統計 / バックアップは管理者または開発者、開発者ツールは開発者のみ利用できます。",
    actions: [
      {
        customId: "menu_audit",
        label: "監査ログ",
        style: ButtonStyle.Secondary,
        summary: "最近のしばき操作履歴を確認します。",
      },
      {
        customId: "menu_settings",
        label: "ログ設定",
        style: ButtonStyle.Secondary,
        summary: "ログ送信チャンネルを設定します。",
      },
      {
        customId: "menu_devtools",
        label: "開発者専用",
        style: ButtonStyle.Secondary,
        summary: "DBチェックや最適化を実行します。",
      },
      {
        customId: "menu_sysstats",
        label: "システム統計",
        style: ButtonStyle.Secondary,
        summary: "Bot稼働状況とサーバー負荷を確認します。",
      },
      {
        customId: "menu_backup",
        label: "バックアップ",
        style: ButtonStyle.Secondary,
        summary: "ギルドDBの保存と一覧確認を行います。",
      },
    ],
  },
] as const;

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
export function getMenuPageDefinition(page: number): MenuPageDefinition {
  return (
    MENU_PAGE_DEFINITIONS.find((definition) => definition.page === page) ??
    MENU_PAGE_DEFINITIONS[0]
  );
}

export function getMenuPageByNavCustomId(
  customId: string,
): MenuPageDefinition | null {
  return (
    MENU_PAGE_DEFINITIONS.find(
      (definition) => definition.navCustomId === customId,
    ) ?? null
  );
}

function buildActionSummary(pageDefinition: MenuPageDefinition): string {
  return pageDefinition.actions
    .map((action, index) => `${index + 1}. **${action.label}**: ${action.summary}`)
    .join("\n");
}

function buildActionRow(pageDefinition: MenuPageDefinition) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...pageDefinition.actions.map((action) =>
      new ButtonBuilder()
        .setCustomId(action.customId)
        .setLabel(action.label)
        .setStyle(action.style),
    ),
  );
}

export function buildMenuHelpEmbed(min: number, max: number): EmbedBuilder {
  const maxPage = MENU_PAGE_DEFINITIONS.length;
  const embed = new EmbedBuilder()
    .setTitle("メニューガイド")
    .setDescription(
      [
        "コマンドが多いので、`/menu` は用途ごとにページを分けています。",
        "迷ったらまず `基本` を開き、必要に応じて `VC操作` や `管理設定` に移動してください。",
        `現在のしばく回数レンジ: **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回**`,
      ].join("\n"),
    )
    .setFooter({ text: "全スラッシュコマンドの一覧は /help で確認できます。" });

  embed.addFields(
    ...MENU_PAGE_DEFINITIONS.map((pageDefinition) => ({
      name: `${pageDefinition.navLabel} (${pageDefinition.page}/${maxPage})`,
      value: [
        pageDefinition.summary,
        buildActionSummary(pageDefinition),
        `権限: ${pageDefinition.permissionNote}`,
      ].join("\n"),
    })),
  );

  return embed;
}

export function buildMenu(min: number, max: number, page: number = 1) {
  const currentPage = getMenuPageDefinition(page);
  const maxPage = MENU_PAGE_DEFINITIONS.length;

  const embed = new EmbedBuilder()
    .setTitle(`しばくbot メニュー | ${currentPage.title}`)
    .setDescription(
      [
        "用途ごとにページを分けています（この表示は**あなたにだけ**見えます）。",
        currentPage.summary,
        `現在のしばく回数: **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回**`,
        `表示カテゴリ: **${currentPage.navLabel} (${currentPage.page}/${maxPage})**`,
      ].join("\n"),
    )
    .addFields(
      {
        name: "このページでできること",
        value: buildActionSummary(currentPage),
      },
      {
        name: "利用権限",
        value: currentPage.permissionNote,
      },
    );

  // ページごとに出す行を切り替える
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  rows.push(buildActionRow(currentPage));

  // 下部ページナビ
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...MENU_PAGE_DEFINITIONS.map((pageDefinition) =>
      new ButtonBuilder()
        .setCustomId(pageDefinition.navCustomId)
        .setLabel(pageDefinition.navLabel)
        .setStyle(
          currentPage.page === pageDefinition.page
            ? ButtonStyle.Primary
            : ButtonStyle.Secondary,
        ),
    ),
    new ButtonBuilder()
      .setCustomId("menu_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger),
  );
  rows.push(navRow);

  return { embed, rows };
}
