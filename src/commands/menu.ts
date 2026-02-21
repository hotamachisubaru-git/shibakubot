// src/commands/menu.ts
import fs from "fs";
import os from "os";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  MessageComponentInteraction,
} from "discord.js";
import {
  loadGuildStore,
  getSbkRange,
  setSbkRange,
  setCountGuild,
  getImmuneList,
  addImmuneId,
  removeImmuneId,
  getRecentLogs,
  getLogCount,
  getSetting,
  setSetting,
  openDb,
} from "../data";
import { LOG_CHANNEL_ID } from "../config";
import { getRuntimeConfig } from "../config/runtime";
import { BACKUP_ROOT, GUILD_DB_ROOT } from "../constants/paths";
import { COMMON_MESSAGES } from "../constants/messages";
import { SETTING_KEYS } from "../constants/settings";
import { displayNameFrom } from "../utils/displayNameUtil";
import {
  compareBigIntDesc,
  parseBigIntInput,
} from "../utils/bigint";
import { fetchGuildMembersSafe } from "../utils/memberFetch";
import { hasAdminOrDevPermission } from "../utils/permissions";
import { isBotOrSelfTarget, isOwnerTarget } from "../utils/targetGuards";

type GuildScopedInteraction = ChatInputCommandInteraction | ButtonInteraction;
type PanelMessage = Awaited<ReturnType<ButtonInteraction["fetchReply"]>>;

/* ===== 設定 ===== */
const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;
const PAGE_SIZE = 10;
const AUDIT_LIMIT = 10;
const BACKUP_LIST_LIMIT = 5;
const LOG_CHANNEL_KEY = SETTING_KEYS.logChannelId;
const EMBED_DESC_LIMIT = 4096; // ← ここは自由に変更OK
const UNKNOWN_GUILD_MESSAGE = `⚠️ ${COMMON_MESSAGES.guildUnavailable}`;


function joinLinesWithLimitOrNull(
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

function safeSignedBigInt(value: bigint): string {
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

async function clearPanelComponents(panel: PanelMessage): Promise<void> {
  try {
    await panel.edit({ components: [] });
  } catch {
    // noop
  }
}

function pickUnionValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

async function guildTopEmbed(i: GuildScopedInteraction): Promise<EmbedBuilder> {
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

async function guildMembersEmbed(
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

function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
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

function safeCount(n: bigint, maxLen = 20): string {
  const s = formatBigIntJP(n);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

function formatCountWithReading(n: bigint): string {
  const short = safeCount(n);
  const full = formatWithComma(n);
  if (full === short) return `${short}回`;
  return `${short}回（${full}回）`;
}

function formatWithComma(v: bigint): string {
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const TOO_LONG_MESSAGE =
  "⚠️ ちょっとあんたたち！ランキング出せないじゃないの！\n" +
  "・少しは以下の工夫くらいしなさいよね！！\n" +
  "・数値表示をもっと簡略化とか！！\n" +
  "・あと、げっつようび！げっつようび！\n" +
  "ルンルン、ルンルン、げっつようび！";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatBytes(bytes: number): string {
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

function formatDuration(ms: number): string {
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

function formatTimestamp(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("") +
    "-" +
    [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join("")
  );
}

function listBackupFiles(dir: string, limit: number): string[] {
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

function copyDbWithWal(src: string, dest: string): string[] {
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

function looksLikeSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

async function requireAdminOrDev(
  i: MessageComponentInteraction,
  message = "この操作は管理者/開発者のみ利用できます。",
): Promise<boolean> {
  if (!hasAdminOrDevPermission(i, OWNER_IDS)) {
    await i.reply({ content: `⚠️ ${message}`, ephemeral: true });
    return false;
  }
  return true;
}

async function showModalAndAwait(
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

function createPanelCollector(
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

function bindPanelCleanup(
  collector: ReturnType<typeof createPanelCollector>,
  panel: PanelMessage,
) {
  collector.on("end", async () => {
    await clearPanelComponents(panel);
  });
}

/* ===== メニューUI ===== */
function buildMenu(min: number, max: number, page: number = 1) {
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

/* ===== /menu メイン ===== */
export async function handleMenu(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "⚠️ このコマンドはサーバー内でのみ使用できます。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gid = interaction.guildId;
  if (!gid) {
    await interaction.reply({
      content: UNKNOWN_GUILD_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let { min: sbkMin, max: sbkMax } = getSbkRange(gid);

  // 現在ページ（1 = 基本）
  let currentPage = 1;

  // ページ指定でメニュー生成
  let built = buildMenu(sbkMin, sbkMax, currentPage);

  // ★ 1回だけ返信（ephemeral は flags を使う）
  await interaction.reply({
    embeds: [built.embed],
    components: built.rows,
    flags: MessageFlags.Ephemeral,
  });

  // ★ メッセージオブジェクトは別途取得
  const msg = await interaction.fetchReply();

  const channel = interaction.channel;
  if (!channel) {
    await interaction.editReply({
      content: "⚠️ チャンネル情報を取得できませんでした。",
      components: [],
    });
    return;
  }

  const collector = channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) =>
      i.user.id === interaction.user.id && i.message.id === msg.id,
  });

  collector.on("collect", async (btn) => {
    try {
      switch (btn.customId) {
        /* --- ページ切り替え --- */
        case "menu_page_basic":
        case "menu_page_vc":
        case "menu_page_admin":
        case "menu_page_admin2": {
          await btn.deferUpdate();

          if (btn.customId === "menu_page_basic") currentPage = 1;
          if (btn.customId === "menu_page_vc") currentPage = 2;
          if (btn.customId === "menu_page_admin") currentPage = 3;
          if (btn.customId === "menu_page_admin2") currentPage = 4;

          const rebuilt = buildMenu(sbkMin, sbkMax, currentPage);
          built = rebuilt;

          await interaction.editReply({
            embeds: [rebuilt.embed],
            components: rebuilt.rows,
          });
          break;
        }

        /* --- ランキング --- */
        case "menu_top": {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [await guildTopEmbed(btn)],
            ephemeral: true,
          });
          break;
        }

        /* --- メンバー一覧 --- */
        case "menu_members": {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [await guildMembersEmbed(btn)],
            ephemeral: true,
          });
          break;
        }

        /* --- 統計 --- */
        case "menu_stats": {
          await btn.deferUpdate();
          const store = loadGuildStore(gid);
          const total = Object.values(store.counts).reduce((a, b) => a + b, 0n);
          const unique = Object.keys(store.counts).length;
          const immune = store.immune.length;
          await btn.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle("サーバー統計")
                .addFields(
                  {
                    name: "総しばき回数",
                    value: formatCountWithReading(total),
                    inline: true,
                  },
                  { name: "対象人数", value: String(unique), inline: true },
                  { name: "免除ユーザー", value: String(immune), inline: true },
                ),
            ],
            ephemeral: true,
          });
          break;
        }

        /* --- 上限設定 --- */
        case "menu_limit": {
          if (!(await requireAdminOrDev(btn, "上限設定は管理者/開発者のみ。")))
            break;

          const modal = new ModalBuilder()
            .setCustomId("limit_modal")
            .setTitle("しばく回数の上限設定");
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("min")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("1以上の整数")
                .setRequired(true)
                .setLabel(`最小（現在 ${safeCount(BigInt(sbkMin))}回）`),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("max")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("最小以上の整数")
                .setRequired(true)
                .setLabel(`最大（現在 ${safeCount(BigInt(sbkMax))}回）`),
            ),
          );

          const submitted = await showModalAndAwait(btn, modal);
          if (!submitted) break;

          const minIn = Number(submitted.fields.getTextInputValue("min"));
          const maxIn = Number(submitted.fields.getTextInputValue("max"));
          if (!Number.isFinite(minIn) || !Number.isFinite(maxIn)) {
            await submitted.reply({
              content: "数値を入力してください。",
              ephemeral: true,
            });
            break;
          }

          const { min, max } = setSbkRange(gid, minIn, maxIn);
          sbkMin = min;
          sbkMax = max;
          built = buildMenu(sbkMin, sbkMax, currentPage);
          try {
            await interaction.editReply({
              embeds: [built.embed],
              components: built.rows,
            });
          } catch {}
          await submitted.reply({
            content: `✅ しばく回数の範囲を **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回** に変更しました。`,
            ephemeral: true,
          });
          break;
        }

        /* --- 免除管理 --- */
        case "menu_immune": {
          if (!(await requireAdminOrDev(btn, "免除管理は管理者/開発者のみ。")))
            break;

          const rowAct =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("imm_act")
                .setPlaceholder("操作を選択")
                .addOptions(
                  { label: "追加", value: "add" },
                  { label: "削除", value: "remove" },
                  { label: "一覧", value: "list" },
                ),
            );
          const rowUser =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("imm_user")
                .setPlaceholder("対象ユーザー")
                .setMaxValues(1),
            );

          await btn.reply({
            content:
              "免除の操作を選んでください（追加/削除はユーザーも選択）。",
            components: [
              rowAct,
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("imm_exec")
                  .setLabel("実行")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("imm_cancel")
                  .setLabel("キャンセル")
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let act: "add" | "remove" | "list" | null = null;
          let target: string | null = null;

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isStringSelectMenu() && i.customId === "imm_act") {
              act = pickUnionValue(i.values[0], ["add", "remove", "list"]);
              await i.deferUpdate();
              return;
            }

            if (i.isUserSelectMenu() && i.customId === "imm_user") {
              target = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "imm_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "imm_exec") {
              if (!act) {
                await i.reply({
                  content: "操作を選んでください。",
                  ephemeral: true,
                });
                return;
              }
              if ((act === "add" || act === "remove") && !target) {
                await i.reply({
                  content: "対象を選んでください。",
                  ephemeral: true,
                });
                return;
              }

              if (act === "list") {
                const list = getImmuneList(gid);
                await i.reply({
                  content: list.length
                    ? list
                        .map((x, n) => `${n + 1}. <@${x}> (\`${x}\`)`)
                        .join("\n")
                    : "（なし）",
                  ephemeral: true,
                });
              } else if (act === "add") {
                const targetUserId = target;
                if (!targetUserId) {
                  await i.reply({
                    content: "対象を選んでください。",
                    ephemeral: true,
                  });
                  return;
                }

                const ok = addImmuneId(gid, targetUserId);
                const tag = await displayNameFrom(i, targetUserId);
                await i.reply({
                  content: ok
                    ? `\`${tag}\` を免除リストに追加しました。`
                    : `\`${tag}\` は既に免除リストに存在します。`,
                  ephemeral: true,
                });
              } else if (act === "remove") {
                const targetUserId = target;
                if (!targetUserId) {
                  await i.reply({
                    content: "対象を選んでください。",
                    ephemeral: true,
                  });
                  return;
                }

                const ok = removeImmuneId(gid, targetUserId);
                const tag = await displayNameFrom(i, targetUserId);
                await i.reply({
                  content: ok
                    ? `\`${tag}\` を免除リストから削除しました。`
                    : `\`${tag}\` は免除リストにありません。`,
                  ephemeral: true,
                });
              }

              await clearPanelComponents(panel);
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- 値を直接設定 --- */
        case "menu_control": {
          if (
            !(await requireAdminOrDev(btn, "値の直接設定は管理者/開発者のみ。"))
          )
            break;

          const rowUser =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("ctl_user")
                .setPlaceholder("対象ユーザー")
                .setMaxValues(1),
            );

          await btn.reply({
            content: "対象を選んで「設定」を押すと回数を入力できます。",
            components: [
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("ctl_set")
                  .setLabel("設定")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("ctl_cancel")
                  .setLabel("キャンセル")
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let target: string | null = null;

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "ctl_user") {
              target = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "ctl_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "ctl_set") {
              const targetUserId = target;
              if (!targetUserId) {
                await i.reply({
                  content: "対象を選んでください。",
                  ephemeral: true,
                });
                return;
              }

              const targetUser = await i.client.users
                .fetch(targetUserId)
                .catch(() => null);
              if (!targetUser) {
                await i.reply({
                  content: COMMON_MESSAGES.targetUserUnavailable,
                  ephemeral: true,
                });
                return;
              }

              if (isBotOrSelfTarget(targetUser, i.client.user?.id)) {
                await i.reply({
                  content: COMMON_MESSAGES.botTargetExcluded,
                  ephemeral: true,
                });
                return;
              }

              if (isOwnerTarget(targetUserId, OWNER_IDS)) {
                await i.reply({
                  content: COMMON_MESSAGES.ownerTargetExcluded,
                  ephemeral: true,
                });
                return;
              }

              const modal = new ModalBuilder()
                .setCustomId("ctl_modal")
                .setTitle("しばかれ回数を設定");
              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId("value")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setLabel("回数（0以上の整数）"),
                ),
              );
              const submitted = await showModalAndAwait(i, modal);
              if (!submitted) return;

              const value = parseBigIntInput(
                submitted.fields.getTextInputValue("value"),
              );
              if (value === null || value < 0n) {
                await submitted.reply({
                  content: "0以上の数値を入力してください。",
                  ephemeral: true,
                });
                return;
              }

              const next = setCountGuild(gid, targetUserId, value);
              const tag = await displayNameFrom(submitted, targetUserId);

              await clearPanelComponents(panel);

              await submitted.reply({
                content: `**${tag}** のしばかれ回数を **${safeCount(next)} 回** に設定しました。`,
                ephemeral: true,
              });

              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- VC移動 --- */
        case "menu_movevc": {
          const isAdmin =
            btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
            false;
          const canMove =
            btn.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ??
            false;
          const isDev = OWNER_IDS.has(btn.user.id);
          if (!isAdmin && !canMove && !isDev) {
            await btn.reply({
              content: "⚠️ VC移動は管理者/MoveMembers権限/開発者のみ使えます。",
              ephemeral: true,
            });
            break;
          }

          const rowUsers =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("movevc_users")
                .setPlaceholder("移動するメンバーを選択（複数可）")
                .setMinValues(1)
                .setMaxValues(20),
            );
          const rowDest =
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("movevc_dest")
                .setPlaceholder("移動先のボイスチャンネルを選択")
                .addChannelTypes(
                  ChannelType.GuildVoice,
                  ChannelType.GuildStageVoice,
                )
                .setMinValues(1)
                .setMaxValues(1),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("movevc_exec")
              .setLabel("移動を実行")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("movevc_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "🎧 移動するメンバーと移動先VCを選んでください。",
            components: [rowUsers, rowDest, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];
          let destChannelId: string | null = null;

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "movevc_users") {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isChannelSelectMenu() && i.customId === "movevc_dest") {
              destChannelId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "movevc_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "movevc_exec") {
              const selectedDestChannelId = destChannelId;
              if (!pickedUsers.length) {
                await i.reply({
                  content: "移動するメンバーを選んでください。",
                  ephemeral: true,
                });
                return;
              }
              if (!selectedDestChannelId) {
                await i.reply({
                  content: "移動先のVCを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              const g = i.guild;
              if (!g) {
                await i.followUp({
                  content: UNKNOWN_GUILD_MESSAGE,
                  ephemeral: true,
                });
                return;
              }

              const dest = await g.channels
                .fetch(selectedDestChannelId)
                .catch(() => null);
              if (
                !dest ||
                (dest.type !== ChannelType.GuildVoice &&
                  dest.type !== ChannelType.GuildStageVoice)
              ) {
                await i.followUp({
                  content: "❌ 移動先がボイスチャンネルではありません。",
                  ephemeral: true,
                });
                return;
              }

              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setChannel(selectedDestChannelId);
                  results.push(`- ${m.displayName}: ✅ 移動しました`);
                } catch {
                  results.push(
                    `- ${m.displayName}: ❌ 失敗（権限/接続状況を確認）`,
                  );
                }
              }

              await clearPanelComponents(panel);
              await i.followUp({
                content: `📦 VC移動結果（→ <#${selectedDestChannelId}>）\n${results.join("\n")}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- VC切断 --- */
        case "menu_vcdisconnect": {
          const isAdmin =
            btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
            false;
          const canMove =
            btn.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ??
            false;
          const isDev = OWNER_IDS.has(btn.user.id);
          if (!isAdmin && !canMove && !isDev) {
            await btn.reply({
              content: "⚠️ VC切断は管理者/MoveMembers権限/開発者のみ使えます。",
              ephemeral: true,
            });
            break;
          }

          const rowUsers =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("discvc_users")
                .setPlaceholder("切断するメンバーを選択（最大10人）")
                .setMinValues(1)
                .setMaxValues(10),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("discvc_exec")
              .setLabel("切断を実行")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("discvc_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "🔇 VCから切断するメンバーを選んでください。",
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "discvc_users") {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "discvc_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "discvc_exec") {
              if (!pickedUsers.length) {
                await i.reply({
                  content: "切断するメンバーを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              const g = i.guild;
              if (!g) {
                await i.followUp({
                  content: UNKNOWN_GUILD_MESSAGE,
                  ephemeral: true,
                });
                return;
              }

              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setChannel(null);
                  results.push(`- ${m.displayName}: ✅ 切断しました`);
                } catch {
                  results.push(
                    `- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`,
                  );
                }
              }

              await clearPanelComponents(panel);
              await i.followUp({
                content: `🪓 VC切断結果\n${results.join("\n")}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- VCミュート --- */
        case "menu_vcmute": {
          const isAdmin =
            btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
            false;
          const canMute =
            btn.memberPermissions?.has(PermissionFlagsBits.MuteMembers) ??
            false;
          const isDev = OWNER_IDS.has(btn.user.id);
          if (!isAdmin && !canMute && !isDev) {
            await btn.reply({
              content:
                "⚠️ VCミュートは管理者/MuteMembers権限/開発者のみ使えます。",
              ephemeral: true,
            });
            break;
          }

          const rowUsers =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("mutevc_users")
                .setPlaceholder("ミュートするメンバーを選択（最大10人）")
                .setMinValues(1)
                .setMaxValues(10),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("mutevc_exec")
              .setLabel("ミュートを実行")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("mutevc_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "🔇 VCでミュートするメンバーを選んでください。",
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "mutevc_users") {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "mutevc_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "mutevc_exec") {
              if (!pickedUsers.length) {
                await i.reply({
                  content: "ミュートするメンバーを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              const g = i.guild;
              if (!g) {
                await i.followUp({
                  content: UNKNOWN_GUILD_MESSAGE,
                  ephemeral: true,
                });
                return;
              }

              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setMute(true);
                  results.push(`- ${m.displayName}: ✅ ミュートしました`);
                } catch {
                  results.push(
                    `- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`,
                  );
                }
              }

              await clearPanelComponents(panel);
              await i.followUp({
                content: `🔇 VCミュート結果\n${results.join("\n")}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- VCミュート解除 --- */
        case "menu_vcunmute": {
          const isAdmin =
            btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
            false;
          const canMute =
            btn.memberPermissions?.has(PermissionFlagsBits.MuteMembers) ??
            false;
          const isDev = OWNER_IDS.has(btn.user.id);
          if (!isAdmin && !canMute && !isDev) {
            await btn.reply({
              content:
                "⚠️ VCミュート解除は管理者/MuteMembers権限/開発者のみ使えます。",
              ephemeral: true,
            });
            break;
          }

          const rowUsers =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("unmutevc_users")
                .setPlaceholder("ミュート解除するメンバーを選択（最大10人）")
                .setMinValues(1)
                .setMaxValues(10),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("unmutevc_exec")
              .setLabel("ミュート解除を実行")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("unmutevc_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "🔈 VCでミュート解除するメンバーを選んでください。",
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "unmutevc_users") {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "unmutevc_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "unmutevc_exec") {
              if (!pickedUsers.length) {
                await i.reply({
                  content: "ミュート解除するメンバーを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              const g = i.guild;
              if (!g) {
                await i.followUp({
                  content: UNKNOWN_GUILD_MESSAGE,
                  ephemeral: true,
                });
                return;
              }

              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setMute(false);
                  results.push(`- ${m.displayName}: ✅ ミュート解除しました`);
                } catch {
                  results.push(
                    `- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`,
                  );
                }
              }

              await clearPanelComponents(panel);
              await i.followUp({
                content: `🔈 VCミュート解除結果\n${results.join("\n")}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);

          break;
        }

        /* --- ヘルプ --- */
        case "menu_help": {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle("ヘルプ")
                .setDescription(
                  [
                    "このメニューから、ランキング/メンバー/統計/VC移動/VC切断/VCミュート/VCミュート解除 が使えます。",
                    "管理者ページから、上限設定/免除管理/値の直接設定 が利用できます。",
                    "管理者（2）ページから、監査ログ/サーバー設定/開発者ツール/システム統計/バックアップ作業 が利用できます。",
                    "※ 上限設定・免除管理・値の直接設定・VC移動・VC切断・VCミュート・ミュート解除は 管理者 or OWNER_IDS で利用可。",
                    "※ 開発者ツールは OWNER_IDS のみ利用可。",
                    `現在の回数レンジ: **${safeCount(BigInt(sbkMin))}〜${safeCount(BigInt(sbkMax))}回**`,
                  ].join("\n"),
                ),
            ],
            ephemeral: true,
          });
          break;
        }

        /* --- 管理者: 監査ログ --- */
        case "menu_audit": {
          if (
            !(await requireAdminOrDev(
              btn,
              "監査ログは管理者/開発者のみ利用できます。",
            ))
          )
            break;

          await btn.deferUpdate();

          const logs = getRecentLogs(gid, AUDIT_LIMIT);
          if (!logs.length) {
            await btn.followUp({
              content: "監査ログはまだありません。",
              ephemeral: true,
            });
            break;
          }

          const lines = await Promise.all(
            logs.map(async (log) => {
              const actorLabel = log.actor
                ? looksLikeSnowflake(log.actor)
                  ? await displayNameFrom(btn, log.actor)
                  : log.actor
                : "不明";
              const targetLabel = await displayNameFrom(btn, log.target);
              const delta = safeSignedBigInt(log.delta);
              const when = new Date(log.at).toLocaleString("ja-JP");

              const reasonRaw = (log.reason ?? "").replace(/\s+/g, " ").trim();
              const reason = reasonRaw
                ? reasonRaw.length > 40
                  ? `${reasonRaw.slice(0, 40)}...`
                  : reasonRaw
                : "（理由なし）";

              return `- ${when} ${actorLabel} -> ${targetLabel} (${delta}) ${reason}`;
            }),
          );

          const desc =
            joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT) ??
            "（表示できるログがありません）";

          const total = getLogCount(gid);
          const embed = new EmbedBuilder()
            .setTitle("監査ログ（しばき）")
            .setDescription(desc)
            .setFooter({ text: `最新 ${logs.length} 件 / 全 ${total} 件` });

          await btn.followUp({ embeds: [embed], ephemeral: true });
          break;
        }

        /* --- 管理者: サーバー設定 --- */
        case "menu_settings": {
          if (
            !(await requireAdminOrDev(
              btn,
              "サーバー設定は管理者/開発者のみ利用できます。",
            ))
          )
            break;
          

          const current = getSetting(gid, LOG_CHANNEL_KEY);
          const fallbackText = LOG_CHANNEL_ID
            ? `<#${LOG_CHANNEL_ID}>（env）`
            : "未設定";
          const currentText = current ? `<#${current}>` : fallbackText;

          const rowChannel =
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("settings_log_channel")
                .setPlaceholder("ログ送信チャンネルを選択")
                .addChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1),
            );

          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("settings_save")
              .setLabel("保存")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("settings_clear")
              .setLabel("クリア")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId("settings_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Danger),
          );

          await btn.reply({
            content:
              `現在のログチャンネル: ${currentText}\n` +
              "チャンネルを選択して「保存」を押してください。",
            components: [rowChannel, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedChannelId: string | null = null;

          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (
              i.isChannelSelectMenu() &&
              i.customId === "settings_log_channel"
            ) {
              pickedChannelId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "settings_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "settings_clear") {
              setSetting(gid, LOG_CHANNEL_KEY, null);
              await i.reply({
                content: `ログチャンネル設定をクリアしました。現在: ${fallbackText}`,
                ephemeral: true,
              });
              await clearPanelComponents(panel);
              sub.stop("done");
              return;
            }

            if (i.isButton() && i.customId === "settings_save") {
              if (!pickedChannelId) {
                await i.reply({
                  content: "チャンネルを選択してください。",
                  ephemeral: true,
                });
                return;
              }

              setSetting(gid, LOG_CHANNEL_KEY, pickedChannelId);
              await i.reply({
                content: `ログチャンネルを <#${pickedChannelId}> に設定しました。`,
                ephemeral: true,
              });

              await clearPanelComponents(panel);
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- 管理者: 開発者ツール --- */
        case "menu_devtools": {
          const isDev = OWNER_IDS.has(btn.user.id);
          if (!isDev) {
            await btn.reply({
              content: "開発者ツールは OWNER_IDS のみ利用できます。",
              ephemeral: true,
            });
            break;
          }

          const rowAct =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("dev_act")
                .setPlaceholder("ツールを選択")
                .addOptions(
                  { label: "デバッグ情報", value: "info" },
                  { label: "WALチェックポイント", value: "checkpoint" },
                  { label: "DB最適化（VACUUM）", value: "vacuum" },
                ),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("dev_exec")
              .setLabel("実行")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("dev_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "実行する開発者ツールを選んでください。",
            components: [rowAct, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let act: "info" | "checkpoint" | "vacuum" | null = null;
          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isStringSelectMenu() && i.customId === "dev_act") {
              act = pickUnionValue(i.values[0], [
                "info",
                "checkpoint",
                "vacuum",
              ]);
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "dev_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "dev_exec") {
              if (!act) {
                await i.reply({
                  content: "ツールを選択してください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              if (act === "info") {
                const db = openDb(gid);
                try {
                  const countRow = db
                    .prepare(`SELECT COUNT(*) AS count FROM counts`)
                    .get() as { count: number };
                  const immuneRow = db
                    .prepare(`SELECT COUNT(*) AS count FROM immune`)
                    .get() as { count: number };
                  const logRow = db
                    .prepare(`SELECT COUNT(*) AS count FROM logs`)
                    .get() as { count: number };
                  const settingsRow = db
                    .prepare(`SELECT COUNT(*) AS count FROM settings`)
                    .get() as { count: number };
                  const dbPath = path.join(GUILD_DB_ROOT, `${gid}.db`);
                  const dbSize = fs.existsSync(dbPath)
                    ? formatBytes(fs.statSync(dbPath).size)
                    : "0 B";
                  const logChannel = getSetting(gid, LOG_CHANNEL_KEY);
                  const logLabel = logChannel
                    ? `<#${logChannel}>`
                    : LOG_CHANNEL_ID
                      ? `<#${LOG_CHANNEL_ID}>（env）`
                      : "未設定";

                  const embed = new EmbedBuilder()
                    .setTitle("開発者ツール: デバッグ情報")
                    .addFields(
                      {
                        name: "ギルド",
                        value: `${i.guild?.name ?? "unknown"} (${gid})`,
                      },
                      {
                        name: "DB",
                        value: `size: ${dbSize}\ncounts: ${countRow.count}\nimmune: ${immuneRow.count}\nlogs: ${logRow.count}\nsettings: ${settingsRow.count}`,
                      },
                      { name: "ログチャンネル", value: logLabel },
                      {
                        name: "SBKレンジ",
                        value: `${safeCount(BigInt(sbkMin))}〜${safeCount(BigInt(sbkMax))}回`,
                        inline: true,
                      },
                    );

                  await i.followUp({ embeds: [embed], ephemeral: true });
                } finally {
                  db.close();
                }
              }

              if (act === "checkpoint") {
                const db = openDb(gid);
                try {
                  db.pragma("wal_checkpoint(TRUNCATE)");
                  await i.followUp({
                    content: "WALチェックポイントを実行しました。",
                    ephemeral: true,
                  });
                } catch (e) {
                  await i.followUp({
                    content: "WALチェックポイントに失敗しました。",
                    ephemeral: true,
                  });
                } finally {
                  db.close();
                }
              }

              if (act === "vacuum") {
                const db = openDb(gid);
                try {
                  db.exec("VACUUM");
                  await i.followUp({
                    content: "VACUUM を実行しました。",
                    ephemeral: true,
                  });
                } catch {
                  await i.followUp({
                    content: "VACUUM に失敗しました。",
                    ephemeral: true,
                  });
                } finally {
                  db.close();
                }
              }

              await clearPanelComponents(panel);
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- 管理者: システム統計 --- */
        case "menu_sysstats": {
          if (
            !(await requireAdminOrDev(
              btn,
              "システム統計は管理者/開発者のみ利用できます。",
            ))
          )
            break;

          await btn.deferUpdate();

          const mem = process.memoryUsage();
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const wsPing = btn.client.ws?.ping ?? -1;

          const embed = new EmbedBuilder().setTitle("システム統計").addFields(
            {
              name: "稼働時間",
              value: formatDuration(process.uptime() * 1000),
              inline: true,
            },
            { name: "Node", value: process.version, inline: true },
            {
              name: "WS Ping",
              value: wsPing >= 0 ? `${Math.round(wsPing)}ms` : "不明",
              inline: true,
            },
            {
              name: "メモリ",
              value: `RSS ${formatBytes(mem.rss)} / Heap ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`,
            },
            {
              name: "System",
              value: `${os.platform()} ${os.arch()} / CPU ${os.cpus().length} cores`,
            },
            {
              name: "RAM",
              value: `${formatBytes(totalMem - freeMem)} / ${formatBytes(totalMem)}`,
            },
            {
              name: "Bot",
              value: `Guilds ${btn.client.guilds.cache.size} / Users ${btn.client.users.cache.size} / Channels ${btn.client.channels.cache.size}`,
            },
          );

          await btn.followUp({ embeds: [embed], ephemeral: true });
          break;
        }

        /* --- 管理者: バックアップ作業 --- */
        case "menu_backup": {
          if (
            !(await requireAdminOrDev(
              btn,
              "バックアップ作業は管理者/開発者のみ利用できます。",
            ))
          )
            break;

          const rowAct =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("backup_act")
                .setPlaceholder("操作を選択")
                .addOptions(
                  { label: "ギルドDBをバックアップ", value: "guild" },
                  { label: "バックアップ一覧", value: "list" },
                ),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("backup_exec")
              .setLabel("実行")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("backup_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "バックアップ操作を選んでください。",
            components: [rowAct, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let act: "guild" | "list" | null = null;
          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isStringSelectMenu() && i.customId === "backup_act") {
              act = pickUnionValue(i.values[0], ["guild", "list"]);
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "backup_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "backup_exec") {
              if (!act) {
                await i.reply({
                  content: "操作を選択してください。",
                  ephemeral: true,
                });
                return;
              }

              await i.deferUpdate();

              if (act === "guild") {
                const src = path.join(GUILD_DB_ROOT, `${gid}.db`);
                if (!fs.existsSync(src)) {
                  await i.followUp({
                    content: "ギルドDBが見つかりません。",
                    ephemeral: true,
                  });
                } else {
                  try {
                    const db = openDb(gid);
                    try {
                      db.pragma("wal_checkpoint(TRUNCATE)");
                    } finally {
                      db.close();
                    }
                  } catch {}

                  const stamp = formatTimestamp();
                  const destDir = path.join(BACKUP_ROOT, "guilds", gid);
                  const dest = path.join(destDir, `${stamp}.db`);
                  const copied = copyDbWithWal(src, dest);
                  const list = copied
                    .map((p) => `- ${path.relative(process.cwd(), p)}`)
                    .join("\n");
                  await i.followUp({
                    content: copied.length
                      ? `バックアップを作成しました:\n${list}`
                      : "バックアップに失敗しました。",
                    ephemeral: true,
                  });
                }
              }

              if (act === "list") {
                const guildDir = path.join(BACKUP_ROOT, "guilds", gid);
                const guildList = listBackupFiles(guildDir, BACKUP_LIST_LIMIT);

                const lines = [
                  "ギルドDBバックアップ:",
                  ...(guildList.length
                    ? guildList.map((x) => `- ${x}`)
                    : ["（なし）"]),
                ];

                await i.followUp({
                  content: lines.join("\n"),
                  ephemeral: true,
                });
              }

              await clearPanelComponents(panel);
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- 閉じる --- */
        case "menu_close": {
          await btn.deferUpdate();
          try {
            await btn.message.edit({
              content: "✅ メニューを閉じました。",
              components: disabledCopyOfRows(built.rows),
            });
          } catch {}
          collector.stop("close");
          break;
        }

        default: {
          // 何もしない（とりあえず更新だけしておく）
          await btn.deferUpdate().catch(() => {});
          break;
        }
      }
    } catch (e) {
      console.error("[menu] error", e);
    }
  });

  collector.on("end", async () => {
    try {
      await msg.edit({ components: disabledCopyOfRows(built.rows) });
    } catch {}
  });
}

