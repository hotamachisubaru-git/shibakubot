import fs from "fs";
import os from "os";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { LOG_CHANNEL_ID } from "../../config";
import { BACKUP_ROOT, GUILD_DB_ROOT } from "../../constants/paths";
import {
  checkpointGuildDb,
  getGuildDbInfo,
  getLogCount,
  getRecentLogs,
  getSetting,
  setSetting,
  vacuumGuildDb,
} from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import {
  AUDIT_LIMIT,
  BACKUP_LIST_LIMIT,
  EMBED_DESC_LIMIT,
  LOG_CHANNEL_KEY,
  OWNER_IDS,
  bindPanelCleanup,
  clearPanelComponents,
  copyDbWithWal,
  createPanelCollector,
  formatBytes,
  formatDuration,
  formatTimestamp,
  joinLinesWithLimitOrNull,
  listBackupFiles,
  looksLikeSnowflake,
  pickUnionValue,
  requireAdminOrDev,
  safeCount,
  safeSignedBigInt,
} from "./common";
import type { MenuActionContext, MenuActionHandler } from "./context";

const handleAuditAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_audit") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "監査ログは管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  await button.deferUpdate();

  const logs = getRecentLogs(context.gid, AUDIT_LIMIT);
  if (!logs.length) {
    await button.followUp({
      content: "監査ログはまだありません。",
      flags: "Ephemeral",
    });
    return true;
  }

  const lines = await Promise.all(
    logs.map(async (log) => {
      const actorLabel = log.actor
        ? looksLikeSnowflake(log.actor)
          ? await displayNameFrom(button, log.actor)
          : log.actor
        : "不明";
      const targetLabel = await displayNameFrom(button, log.target);
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

  const total = getLogCount(context.gid);
  const embed = new EmbedBuilder()
    .setTitle("監査ログ（しばき）")
    .setDescription(desc)
    .setFooter({ text: `最新 ${logs.length} 件 / 全 ${total} 件` });

  await button.followUp({ embeds: [embed], flags: "Ephemeral" });
  return true;
};

const handleSettingsAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_settings") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "サーバー設定は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const current = getSetting(context.gid, LOG_CHANNEL_KEY);
  const fallbackText = LOG_CHANNEL_ID ? `<#${LOG_CHANNEL_ID}>（env）` : "未設定";
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

  await button.reply({
    content:
      `現在のログチャンネル: ${currentText}\n` +
      "チャンネルを選択して「保存」を押してください。",
    components: [rowChannel, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let pickedChannelId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (
      component.isChannelSelectMenu() &&
      component.customId === "settings_log_channel"
    ) {
      pickedChannelId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "settings_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "settings_clear") {
      setSetting(context.gid, LOG_CHANNEL_KEY, null);
      await component.reply({
        content: `ログチャンネル設定をクリアしました。現在: ${fallbackText}`,
        flags: "Ephemeral",
      });
      await clearPanelComponents(panel);
      sub.stop("done");
      return;
    }

    if (component.isButton() && component.customId === "settings_save") {
      if (!pickedChannelId) {
        await component.reply({
          content: "チャンネルを選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      setSetting(context.gid, LOG_CHANNEL_KEY, pickedChannelId);
      await component.reply({
        content: `ログチャンネルを <#${pickedChannelId}> に設定しました。`,
        flags: "Ephemeral",
      });
      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleDevtoolsAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_devtools") {
    return false;
  }

  if (!OWNER_IDS.has(button.user.id)) {
    await button.reply({
      content: "開発者ツールは OWNER_IDS のみ利用できます。",
      flags: "Ephemeral",
    });
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
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

  await button.reply({
    content: "実行する開発者ツールを選んでください。",
    components: [rowAct, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: "info" | "checkpoint" | "vacuum" | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "dev_act") {
      act = pickUnionValue(component.values[0], ["info", "checkpoint", "vacuum"]);
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "dev_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "dev_exec") {
      if (!act) {
        await component.reply({
          content: "ツールを選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      if (act === "info") {
        const dbInfo = getGuildDbInfo(context.gid);
        const logChannel = getSetting(context.gid, LOG_CHANNEL_KEY);
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
              value: `${component.guild?.name ?? "unknown"} (${context.gid})`,
            },
            {
              name: "DB",
              value: `size: ${formatBytes(dbInfo.sizeBytes)}\ncounts: ${dbInfo.counts}\nimmune: ${dbInfo.immune}\nlogs: ${dbInfo.logs}\nsettings: ${dbInfo.settings}`,
            },
            { name: "ログチャンネル", value: logLabel },
            {
              name: "SBKレンジ",
              value: `${safeCount(BigInt(context.state.sbkMin))}〜${safeCount(BigInt(context.state.sbkMax))}回`,
              inline: true,
            },
          );

        await component.followUp({ embeds: [embed], flags: "Ephemeral" });
      }

      if (act === "checkpoint") {
        try {
          checkpointGuildDb(context.gid);
          await component.followUp({
            content: "WALチェックポイントを実行しました。",
            flags: "Ephemeral",
          });
        } catch {
          await component.followUp({
            content: "WALチェックポイントに失敗しました。",
            flags: "Ephemeral",
          });
        }
      }

      if (act === "vacuum") {
        try {
          vacuumGuildDb(context.gid);
          await component.followUp({
            content: "VACUUM を実行しました。",
            flags: "Ephemeral",
          });
        } catch {
          await component.followUp({
            content: "VACUUM に失敗しました。",
            flags: "Ephemeral",
          });
        }
      }

      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleSystemStatsAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_sysstats") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "システム統計は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  await button.deferUpdate();

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const wsPing = button.client.ws?.ping ?? -1;
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
      value: `Guilds ${button.client.guilds.cache.size} / Users ${button.client.users.cache.size} / Channels ${button.client.channels.cache.size}`,
    },
  );

  await button.followUp({ embeds: [embed], flags: "Ephemeral" });
  return true;
};

const handleBackupAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_backup") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "バックアップ作業は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
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

  await button.reply({
    content: "バックアップ操作を選んでください。",
    components: [rowAct, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: "guild" | "list" | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "backup_act") {
      act = pickUnionValue(component.values[0], ["guild", "list"]);
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "backup_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "backup_exec") {
      if (!act) {
        await component.reply({
          content: "操作を選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      if (act === "guild") {
        const src = path.join(GUILD_DB_ROOT, `${context.gid}.db`);
        if (!fs.existsSync(src)) {
          await component.followUp({
            content: "ギルドDBが見つかりません。",
            flags: "Ephemeral",
          });
        } else {
          try {
            checkpointGuildDb(context.gid);
          } catch {
            // noop
          }

          const stamp = formatTimestamp();
          const destDir = path.join(BACKUP_ROOT, "guilds", context.gid);
          const dest = path.join(destDir, `${stamp}.db`);
          const copied = copyDbWithWal(src, dest);
          const list = copied
            .map((entry) => `- ${path.relative(process.cwd(), entry)}`)
            .join("\n");
          await component.followUp({
            content: copied.length
              ? `バックアップを作成しました:\n${list}`
              : "バックアップに失敗しました。",
            flags: "Ephemeral",
          });
        }
      }

      if (act === "list") {
        const guildDir = path.join(BACKUP_ROOT, "guilds", context.gid);
        const guildList = listBackupFiles(guildDir, BACKUP_LIST_LIMIT);
        const lines = [
          "ギルドDBバックアップ:",
          ...(guildList.length ? guildList.map((entry) => `- ${entry}`) : ["（なし）"]),
        ];

        await component.followUp({
          content: lines.join("\n"),
          flags: "Ephemeral",
        });
      }

      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const ADMIN_HANDLERS: readonly MenuActionHandler[] = [
  handleAuditAction,
  handleSettingsAction,
  handleDevtoolsAction,
  handleSystemStatsAction,
  handleBackupAction,
];

export const handleMenuAdminAction: MenuActionHandler = async (
  context,
  button,
) => {
  for (const handler of ADMIN_HANDLERS) {
    if (await handler(context, button)) {
      return true;
    }
  }

  return false;
};
