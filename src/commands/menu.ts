import fs from "fs";
import os from "os";
import path from "path";
import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { LOG_CHANNEL_ID } from "../config";
import { getRuntimeConfig } from "../config/runtime";
import { BACKUP_ROOT, GUILD_DB_ROOT } from "../constants/paths";
import { COMMON_MESSAGES } from "../constants/messages";
import {
  addImmuneId,
  getMaintenanceEnabled,
  getImmuneList,
  getLogCount,
  getRecentLogs,
  getSbkRange,
  getSetting,
  loadGuildStore,
  openDb,
  removeImmuneId,
  setCountGuild,
  setMaintenanceEnabled,
  setSbkRange,
  setSetting,
} from "../data";
import {
  SKY_DREAM_TYPE_A_BETS,
  describeSkyDreamResult,
  describeSkyDreamStep,
  getMedalAccountSnapshot,
  playSkyDreamTypeA,
  type SkyDreamPlayResult,
} from "../medals";
import { displayNameFrom } from "../utils/displayNameUtil";
import { parseBigIntInput } from "../utils/bigint";
import { hasAdminGuildOwnerOrDevPermission } from "../utils/permissions";
import { isBotOrSelfTarget, isOwnerTarget } from "../utils/targetGuards";
import {
  AUDIT_LIMIT,
  BACKUP_LIST_LIMIT,
  EMBED_DESC_LIMIT,
  LOG_CHANNEL_KEY,
  OWNER_IDS,
  UNKNOWN_GUILD_MESSAGE,
  bindPanelCleanup,
  buildMenuHelpEmbed,
  buildMenu,
  clearPanelComponents,
  copyDbWithWal,
  createPanelCollector,
  disabledCopyOfRows,
  formatBytes,
  formatCountWithReading,
  formatDuration,
  formatTimestamp,
  guildMembersEmbed,
  guildTopEmbed,
  joinLinesWithLimitOrNull,
  listBackupFiles,
  looksLikeSnowflake,
  MENU_PAGE_DEFINITIONS,
  type PanelMessage,
  pickUnionValue,
  requireAdminOrDev,
  safeCount,
  safeSignedBigInt,
  getMenuPageByNavCustomId,
  showModalAndAwait,
} from "./menu/common";

const runtimeConfig = getRuntimeConfig();
const TARGET_GUILD_ID = runtimeConfig.discord.guildIds[0] ?? null;
const NOT_SUNDAY_MESSAGE =
  "おまえら～ｗｗｗ曜日感覚大丈夫～～～？？？ｗｗｗ";
const MONDAY_TAUNT_MESSAGE = [
  "# 明日は月曜日♪",
  "# 月曜日♪",
  "# ルンルンルンルン月曜日♪",
  "# やったね！",
  "# 月曜日だ！",
  "# みんな元気に月曜日やっていこうね！",
  "# ムカムカしてもしょうがないよ！",
  "# だって明日は月曜日だもん！",
  "# ヤッター！",
  "# やったね！",
].join("\n");

type VoiceBatchActionConfig = Readonly<{
  actionPrefix: string;
  permissionFlag: bigint;
  noPermissionMessage: string;
  promptMessage: string;
  userPlaceholder: string;
  executeLabel: string;
  executeStyle: ButtonStyle;
  missingTargetMessage: string;
  resultHeader: string;
  successMessage: string;
  failureMessage: string;
  maxUsers?: number;
  applyAction: (member: GuildMember) => Promise<void>;
}>;

function hasVoicePermission(
  interaction: ButtonInteraction,
  permissionFlag: bigint,
): boolean {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const hasRequired =
    interaction.memberPermissions?.has(permissionFlag) ?? false;
  const isDev = OWNER_IDS.has(interaction.user.id);
  return isAdmin || hasRequired || isDev;
}

async function handleVoiceBatchAction(
  btn: ButtonInteraction,
  config: VoiceBatchActionConfig,
): Promise<void> {
  if (!hasVoicePermission(btn, config.permissionFlag)) {
    await btn.reply({
      content: config.noPermissionMessage,
      ephemeral: true,
    });
    return;
  }

  const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`${config.actionPrefix}_users`)
      .setPlaceholder(config.userPlaceholder)
      .setMinValues(1)
      .setMaxValues(config.maxUsers ?? 10),
  );
  const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${config.actionPrefix}_exec`)
      .setLabel(config.executeLabel)
      .setStyle(config.executeStyle),
    new ButtonBuilder()
      .setCustomId(`${config.actionPrefix}_cancel`)
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  await btn.reply({
    content: config.promptMessage,
    components: [rowUsers, rowExec],
    ephemeral: true,
  });

  const panel = await btn.fetchReply();
  let pickedUsers: string[] = [];
  const sub = createPanelCollector(btn, panel);

  sub.on("collect", async (i) => {
    if (i.isUserSelectMenu() && i.customId === `${config.actionPrefix}_users`) {
      pickedUsers = i.values;
      await i.deferUpdate();
      return;
    }

    if (i.isButton() && i.customId === `${config.actionPrefix}_cancel`) {
      await i.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (i.isButton() && i.customId === `${config.actionPrefix}_exec`) {
      if (!pickedUsers.length) {
        await i.reply({
          content: config.missingTargetMessage,
          ephemeral: true,
        });
        return;
      }

      await i.deferUpdate();

      const guild = i.guild;
      if (!guild) {
        await i.followUp({
          content: UNKNOWN_GUILD_MESSAGE,
          ephemeral: true,
        });
        return;
      }

      const results: string[] = [];
      for (const uid of pickedUsers) {
        const member = await guild.members.fetch(uid).catch(() => null);
        if (!member) {
          results.push(`- <@${uid}>: 見つかりません`);
          continue;
        }
        if (!member.voice?.channelId) {
          results.push(`- ${member.displayName}: VC未参加`);
          continue;
        }

        try {
          await config.applyAction(member);
          results.push(`- ${member.displayName}: ${config.successMessage}`);
        } catch {
          results.push(`- ${member.displayName}: ${config.failureMessage}`);
        }
      }

      await clearPanelComponents(panel);
      await i.followUp({
        content: `${config.resultHeader}\n${results.join("\n")}`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
}

async function requireAdminGuildOwnerOrDev(
  interaction: MessageComponentInteraction,
  message = "この操作は管理者 / サーバーオーナー / 開発者のみ利用できます。",
): Promise<boolean> {
  if (!hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: `⚠️ ${message}`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

function isSundayInJst(date: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(date);
  return weekday === "Sun";
}

function formatMedalCount(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}枚`;
}

function formatMedalDelta(value: bigint): string {
  const sign = value < 0n ? "-" : "+";
  const abs = value < 0n ? -value : value;
  return `${sign}${formatMedalCount(abs)}`;
}

async function buildSkyDreamAnnouncementMessage(
  interaction: ButtonInteraction,
  play: SkyDreamPlayResult,
): Promise<string | null> {
  const displayName = await displayNameFrom(interaction, interaction.user.id);

  if (play.resultType === "multiplier" && (play.multiplier ?? 0) >= 50) {
    return `${displayName}さんが${play.multiplier}倍を獲得しました！おめでとうございます！`;
  }
  if (play.resultType === "dream_jp") {
    return `${displayName}さんがDream JPを獲得しました！おめでとうございます！`;
  }
  if (play.resultType === "sky_jp") {
    return `${displayName}さんがSky JPを獲得しました！おめでとうございます！`;
  }

  return null;
}

function buildMedalCornerPanel(gid: string, userId: string) {
  const snapshot = getMedalAccountSnapshot(gid, userId);
  const jackpotLines = snapshot.jackpots.map(
    ({ bet, dream, sky }) =>
      `- ${bet}BET | Dream JP ${formatMedalCount(dream)} / Sky JP ${formatMedalCount(sky)}`,
  );

  const rowPrimary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SKY_DREAM_TYPE_A_BETS.slice(0, 5).map((bet) =>
      new ButtonBuilder()
        .setCustomId(`medal_bet_${bet}`)
        .setLabel(`${bet}BET`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(snapshot.balance < BigInt(bet)),
    ),
  );

  const rowSecondary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("medal_bet_500")
      .setLabel("500BET")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(snapshot.balance < 500n),
    new ButtonBuilder()
      .setCustomId("medal_refresh")
      .setLabel("更新")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("medal_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setTitle("メダルコーナー | SkyDream Type-A")
    .setDescription(
      [
        "内部抽選で進行する完全ランダム仕様です。",
        `所持メダル: **${formatMedalCount(snapshot.balance)}**`,
        "JPC到達: 6段目 / JP到達: 12段目",
        "",
        "現在のJP",
        ...jackpotLines,
      ].join("\n"),
    );

  return {
    embed,
    rows: [rowPrimary, rowSecondary],
    balance: snapshot.balance,
  };
}

function buildMedalResultRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("medal_result_continue")
        .setLabel("続ける")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("medal_result_end")
        .setLabel("終わる")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function buildSkyDreamResultEmbed(
  interaction: ButtonInteraction,
  play: SkyDreamPlayResult,
  currentSessionNet: bigint,
): Promise<EmbedBuilder> {
  const displayName = await displayNameFrom(interaction, interaction.user.id);
  const outcome = describeSkyDreamResult(play);
  const progress = play.steps.map(describeSkyDreamStep).join("\n");
  const color =
    play.resultType === "dream_jp"
      ? 0xf1c40f
      : play.resultType === "sky_jp"
        ? 0x5dade2
        : play.payout === 0n
          ? 0xe74c3c
          : play.net >= 0n
            ? 0x2ecc71
            : 0x3498db;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("SkyDream Type-A")
    .setDescription(
      `${displayName} が **${play.bet}BET** でメダル抽選に挑戦しました。`,
    )
    .addFields(
      { name: "結果", value: outcome, inline: true },
      { name: "獲得", value: formatMedalCount(play.payout), inline: true },
      {
        name: "現在の収支",
        value: formatMedalDelta(currentSessionNet),
        inline: true,
      },
      {
        name: "所持メダル",
        value: `${formatMedalCount(play.balanceBefore)} -> ${formatMedalCount(play.balanceAfter)}`,
      },
      {
        name: "進行ログ",
        value: progress,
      },
      {
        name: "現在のJP",
        value: `Dream JP ${formatMedalCount(play.dreamJackpotAfter)} / Sky JP ${formatMedalCount(play.skyJackpotAfter)}`,
      },
    );
}

function bindPanelCleanupUnless(
  collector: ReturnType<typeof createPanelCollector>,
  panel: PanelMessage,
  skippedReasons: readonly string[],
): void {
  collector.on("end", async (_, reason) => {
    if (skippedReasons.includes(reason)) {
      return;
    }
    await clearPanelComponents(panel);
  });
}

function startMedalResultSession(
  interaction: ButtonInteraction,
  panel: PanelMessage,
  gid: string,
  sessionStartBalance: bigint,
  returnToMenuTop: () => Promise<void>,
): void {
  const sub = createPanelCollector(interaction, panel, 300_000);

  sub.on("collect", async (i) => {
    if (!i.isButton()) return;

    if (i.customId === "medal_result_continue") {
      const nextPanel = buildMedalCornerPanel(gid, i.user.id);
      await i.update({
        embeds: [nextPanel.embed],
        components: nextPanel.rows,
      });
      sub.stop("continue");
      startMedalPanelSession(i, panel, gid, sessionStartBalance, returnToMenuTop);
      return;
    }

    if (i.customId === "medal_result_end") {
      await returnToMenuTop().catch(() => {});
      await i.update({
        content: "\u200b",
        embeds: [],
        components: [],
      });
      sub.stop("end");
    }
  });

  bindPanelCleanupUnless(sub, panel, ["continue", "end"]);
}

function startMedalPanelSession(
  interaction: ButtonInteraction,
  panel: PanelMessage,
  gid: string,
  sessionStartBalance: bigint,
  returnToMenuTop: () => Promise<void>,
): void {
  const sub = createPanelCollector(interaction, panel, 300_000);

  sub.on("collect", async (i) => {
    if (!i.isButton()) return;

    if (i.customId === "medal_refresh") {
      const refreshed = buildMedalCornerPanel(gid, i.user.id);
      await i.update({
        embeds: [refreshed.embed],
        components: refreshed.rows,
      });
      return;
    }

    if (i.customId === "medal_close") {
      await i.update({
        content: "メダルコーナーを閉じました。",
        embeds: [],
        components: [],
      });
      sub.stop("close");
      return;
    }

    if (!i.customId.startsWith("medal_bet_")) {
      return;
    }

    const bet = Number(i.customId.replace("medal_bet_", ""));
    const attempt = playSkyDreamTypeA(gid, i.user.id, bet);

    if (!attempt.ok) {
      const refreshed = buildMedalCornerPanel(gid, i.user.id);
      try {
        await panel.edit({
          embeds: [refreshed.embed],
          components: refreshed.rows,
        });
      } catch {
        // noop
      }

      await i.reply({
        content:
          attempt.reason === "insufficient_medals"
            ? `メダルが足りません。現在 **${formatMedalCount(attempt.balance)}** です。`
            : "BET値が不正です。",
        ephemeral: true,
      });
      return;
    }

    await i.deferReply({
      flags: MessageFlags.Ephemeral,
    });
    sub.stop("played");
    await clearPanelComponents(panel);

    const resultEmbed = await buildSkyDreamResultEmbed(
      i,
      attempt.play,
      attempt.play.balanceAfter - sessionStartBalance,
    );
    await i.editReply({
      embeds: [resultEmbed],
      components: buildMedalResultRows(),
    });

    const resultPanel = await i.fetchReply();
    startMedalResultSession(
      i,
      resultPanel,
      gid,
      sessionStartBalance,
      returnToMenuTop,
    );

    const announcement = await buildSkyDreamAnnouncementMessage(i, attempt.play);
    if (announcement && i.channel && "send" in i.channel) {
      await i.channel.send({
        content: announcement,
        allowedMentions: { parse: [] },
      });
    }
  });

  bindPanelCleanupUnless(sub, panel, ["close", "played"]);
}

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
    time: 300_000,
    filter: (i) =>
      i.user.id === interaction.user.id && i.message.id === msg.id,
  });

  collector.on("collect", async (btn) => {
    try {
      switch (btn.customId) {
        /* --- ページ切り替え --- */
        case "menu_page_prev":
        case "menu_page_next":
        case "menu_page_basic":
        case "menu_page_vc":
        case "menu_page_admin":
        case "menu_page_admin2":
        case "menu_page_tools": {
          await btn.deferUpdate();
          const nextPage = getMenuPageByNavCustomId(btn.customId);
          if (btn.customId === "menu_page_prev") {
            currentPage = Math.max(1, currentPage - 1);
          } else if (btn.customId === "menu_page_next") {
            currentPage = Math.min(MENU_PAGE_DEFINITIONS.length, currentPage + 1);
          } else {
            if (!nextPage) {
              break;
            }
            currentPage = nextPage.page;
          }

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
          if (!hasVoicePermission(btn, PermissionFlagsBits.MoveMembers)) {
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
          await handleVoiceBatchAction(btn, {
            actionPrefix: "discvc",
            permissionFlag: PermissionFlagsBits.MoveMembers,
            noPermissionMessage:
              "⚠️ VC切断は管理者/MoveMembers権限/開発者のみ使えます。",
            promptMessage: "🔇 VCから切断するメンバーを選んでください。",
            userPlaceholder: "切断するメンバーを選択（最大10人）",
            executeLabel: "切断を実行",
            executeStyle: ButtonStyle.Danger,
            missingTargetMessage: "切断するメンバーを選んでください。",
            resultHeader: "🪓 VC切断結果",
            successMessage: "✅ 切断しました",
            failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
            maxUsers: 10,
            applyAction: async (member) => {
              await member.voice.setChannel(null);
            },
          });
          break;
        }

        /* --- VCミュート --- */
        case "menu_vcmute": {
          await handleVoiceBatchAction(btn, {
            actionPrefix: "mutevc",
            permissionFlag: PermissionFlagsBits.MuteMembers,
            noPermissionMessage:
              "⚠️ VCミュートは管理者/MuteMembers権限/開発者のみ使えます。",
            promptMessage: "🔇 VCでミュートするメンバーを選んでください。",
            userPlaceholder: "ミュートするメンバーを選択（最大10人）",
            executeLabel: "ミュートを実行",
            executeStyle: ButtonStyle.Danger,
            missingTargetMessage: "ミュートするメンバーを選んでください。",
            resultHeader: "🔇 VCミュート結果",
            successMessage: "✅ ミュートしました",
            failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
            maxUsers: 10,
            applyAction: async (member) => {
              await member.voice.setMute(true);
            },
          });
          break;
        }

        /* --- VCミュート解除 --- */
        case "menu_vcunmute": {
          await handleVoiceBatchAction(btn, {
            actionPrefix: "unmutevc",
            permissionFlag: PermissionFlagsBits.MuteMembers,
            noPermissionMessage:
              "⚠️ VCミュート解除は管理者/MuteMembers権限/開発者のみ使えます。",
            promptMessage: "🔈 VCでミュート解除するメンバーを選んでください。",
            userPlaceholder: "ミュート解除するメンバーを選択（最大10人）",
            executeLabel: "ミュート解除を実行",
            executeStyle: ButtonStyle.Success,
            missingTargetMessage:
              "ミュート解除するメンバーを選んでください。",
            resultHeader: "🔈 VCミュート解除結果",
            successMessage: "✅ ミュート解除しました",
            failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
            maxUsers: 10,
            applyAction: async (member) => {
              await member.voice.setMute(false);
            },
          });
          break;
        }

        /* --- 回数確認 --- */
        case "menu_check": {
          const rowUser =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("check_user")
                .setPlaceholder("回数を確認するユーザー")
                .setMaxValues(1),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("check_exec")
              .setLabel("確認")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("check_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "回数を確認するユーザーを選んでください。",
            components: [rowUser, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let targetUserId: string | null = null;
          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "check_user") {
              targetUserId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "check_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "check_exec") {
              if (!targetUserId) {
                await i.reply({
                  content: "対象ユーザーを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              const store = loadGuildStore(gid);
              const count = store.counts[targetUserId] ?? 0n;
              const displayName = await displayNameFrom(i, targetUserId);
              await i.update({
                content: `**${displayName}** は今までに ${formatCountWithReading(count)} しばかれました。`,
                components: [],
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- 月曜煽り --- */
        case "menu_monday": {
          await btn.deferUpdate();
          await btn.followUp({
            content: isSundayInJst()
              ? MONDAY_TAUNT_MESSAGE
              : NOT_SUNDAY_MESSAGE,
          });
          break;
        }

        /* --- リセット --- */
        case "menu_reset": {
          if (!(await requireAdminOrDev(btn, "リセットは管理者/開発者のみ。")))
            break;

          const rowUser =
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
              new UserSelectMenuBuilder()
                .setCustomId("reset_user")
                .setPlaceholder("個別リセットするユーザー")
                .setMaxValues(1),
            );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("reset_exec_one")
              .setLabel("選択ユーザーを0にする")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("reset_exec_all")
              .setLabel("全員を0にする")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("reset_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: "個別リセットか全員リセットを選んでください。",
            components: [rowUser, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let resetTargetUserId: string | null = null;
          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (i.isUserSelectMenu() && i.customId === "reset_user") {
              resetTargetUserId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === "reset_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (i.isButton() && i.customId === "reset_exec_all") {
              const store = loadGuildStore(gid);
              for (const userId of Object.keys(store.counts)) {
                setCountGuild(gid, userId, 0n);
              }
              await i.update({
                content: "全員のしばき回数を0にリセットしました。",
                components: [],
              });
              sub.stop("done");
              return;
            }

            if (i.isButton() && i.customId === "reset_exec_one") {
              if (!resetTargetUserId) {
                await i.reply({
                  content: "対象ユーザーを選んでください。",
                  ephemeral: true,
                });
                return;
              }

              setCountGuild(gid, resetTargetUserId, 0n);
              const displayName = await displayNameFrom(i, resetTargetUserId);
              await i.update({
                content: `**${displayName}** のしばき回数を0にリセットしました。`,
                components: [],
                allowedMentions: { parse: [] },
              });
              sub.stop("done");
            }
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- メンテ切替 --- */
        case "menu_maintenance": {
          if (
            !(await requireAdminGuildOwnerOrDev(
              btn,
              "メンテナンス切替は管理者 / サーバーオーナー / 開発者のみ利用できます。",
            ))
          )
            break;

          const enabled = getMaintenanceEnabled(gid);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("maintenance_on")
              .setLabel("ON")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(enabled),
            new ButtonBuilder()
              .setCustomId("maintenance_off")
              .setLabel("OFF")
              .setStyle(ButtonStyle.Success)
              .setDisabled(!enabled),
            new ButtonBuilder()
              .setCustomId("maintenance_cancel")
              .setLabel("キャンセル")
              .setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: `現在のメンテナンスモード: **${enabled ? "ON" : "OFF"}**`,
            components: [row],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          const sub = createPanelCollector(btn, panel);

          sub.on("collect", async (i) => {
            if (!i.isButton()) return;

            if (i.customId === "maintenance_cancel") {
              await i.update({
                content: "キャンセルしました。",
                components: [],
              });
              sub.stop("cancel");
              return;
            }

            if (
              i.customId !== "maintenance_on" &&
              i.customId !== "maintenance_off"
            ) {
              return;
            }

            const nextEnabled = i.customId === "maintenance_on";
            setMaintenanceEnabled(gid, nextEnabled);
            await i.update({
              content: nextEnabled
                ? "✅ メンテナンスモードを有効化しました。"
                : "✅ メンテナンスモードを無効化しました。",
              components: [],
            });
            sub.stop("done");
          });

          bindPanelCleanup(sub, panel);
          break;
        }

        /* --- 投票 --- */
        case "menu_vs": {
          if (!TARGET_GUILD_ID || gid !== TARGET_GUILD_ID) {
            await btn.reply({
              content: "この機能は対象サーバーでのみ利用できます。",
              ephemeral: true,
            });
            break;
          }

          const modal = new ModalBuilder()
            .setCustomId("vs_modal")
            .setTitle("2択投票を作成");
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("question")
                .setLabel("質問")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("option1")
                .setLabel("項目1")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(80),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("option2")
                .setLabel("項目2")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(80),
            ),
          );

          const submitted = await showModalAndAwait(btn, modal);
          if (!submitted) break;

          const question = submitted.fields
            .getTextInputValue("question")
            .trim();
          const option1 = submitted.fields.getTextInputValue("option1").trim();
          const option2 = submitted.fields.getTextInputValue("option2").trim();

          if (option1 === option2) {
            await submitted.reply({
              content: "項目1と項目2は別の内容を指定してください。",
              ephemeral: true,
            });
            break;
          }

          const channelForPoll = submitted.channel;
          if (!channelForPoll || !("send" in channelForPoll)) {
            await submitted.reply({
              content: "投票の送信先チャンネルを取得できませんでした。",
              ephemeral: true,
            });
            break;
          }

          const pollEmbed = new EmbedBuilder()
            .setTitle(`🗳️ ${question}`)
            .setDescription(`1️⃣ ${option1}\n2️⃣ ${option2}`)
            .setFooter({ text: `作成者: ${submitted.user.tag}` });

          const pollMessage = await channelForPoll.send({
            embeds: [pollEmbed],
            allowedMentions: { parse: [] },
          });

          try {
            await pollMessage.react("1️⃣");
            await pollMessage.react("2️⃣");
          } catch {
            await submitted.reply({
              content:
                "⚠️ 投票は作成しましたが、リアクション追加に失敗しました。権限を確認してください。",
              ephemeral: true,
            });
            break;
          }

          await submitted.reply({
            content: "✅ 投票を作成しました。",
            ephemeral: true,
          });
          break;
        }

        /* --- ヘルプ --- */
        case "menu_help": {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [buildMenuHelpEmbed(sbkMin, sbkMax)],
            ephemeral: true,
          });
          break;
        }

        /* --- メダルコーナー --- */
        case "menu_medals": {
          const panelState = buildMedalCornerPanel(gid, btn.user.id);
          const returnToMenuTop = async () => {
            currentPage = 1;
            built = buildMenu(sbkMin, sbkMax, currentPage);
            await interaction.editReply({
              embeds: [built.embed],
              components: built.rows,
            });
          };
          await btn.reply({
            embeds: [panelState.embed],
            components: panelState.rows,
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          startMedalPanelSession(
            btn,
            panel,
            gid,
            panelState.balance,
            returnToMenuTop,
          );
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

