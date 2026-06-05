import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { getRuntimeConfig } from "../../config/runtime";
import { COMMON_MESSAGES } from "../../constants/messages";
import {
  addImmuneId,
  getAiChatEnabled,
  getImmuneList,
  getMaintenanceEnabled,
  removeImmuneId,
  resetAllCounts,
  setAiChatEnabled,
  setCountGuild,
  setMaintenanceEnabled,
  setSbkRange,
} from "../../data";
import { parseBigIntInput } from "../../utils/bigint";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { hasAdminGuildOwnerOrDevPermission } from "../../utils/permissions";
import { isBotOrSelfTarget, isOwnerTarget } from "../../utils/targetGuards";
import {
  OWNER_IDS,
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  pickUnionValue,
  requireAdminOrDev,
  safeCount,
  showModalAndAwait,
} from "./common";
import type { MenuActionContext, MenuActionHandler } from "./context";

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

async function requireAdminGuildOwnerOrDev(
  interaction: Parameters<MenuActionHandler>[1],
  message = "この操作は管理者 / サーバーオーナー / 開発者のみ利用できます。",
): Promise<boolean> {
  if (!hasAdminGuildOwnerOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: `⚠️ ${message}`,
      flags: "Ephemeral",
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

const handleLimitAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_limit") {
    return false;
  }

  if (!(await requireAdminOrDev(button, "上限設定は管理者/開発者のみ。"))) {
    return true;
  }

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
        .setLabel(`最小（現在 ${safeCount(BigInt(context.state.sbkMin))}回）`),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("max")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("最小以上の整数")
        .setRequired(true)
        .setLabel(`最大（現在 ${safeCount(BigInt(context.state.sbkMax))}回）`),
    ),
  );

  const submitted = await showModalAndAwait(button, modal);
  if (!submitted) {
    return true;
  }

  const minIn = Number(submitted.fields.getTextInputValue("min"));
  const maxIn = Number(submitted.fields.getTextInputValue("max"));
  if (!Number.isFinite(minIn) || !Number.isFinite(maxIn)) {
    await submitted.reply({
      content: "数値を入力してください。",
      flags: "Ephemeral",
    });
    return true;
  }

  const { min, max } = setSbkRange(context.gid, minIn, maxIn);
  context.state.sbkMin = min;
  context.state.sbkMax = max;
  await context.refreshMenu().catch(() => undefined);
  await submitted.reply({
    content: `✅ しばく回数の範囲を **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回** に変更しました。`,
    flags: "Ephemeral",
  });
  return true;
};

const handleImmuneAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_immune") {
    return false;
  }

  if (!(await requireAdminOrDev(button, "免除管理は管理者/開発者のみ。"))) {
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("imm_act")
      .setPlaceholder("操作を選択")
      .addOptions(
        { label: "追加", value: "add" },
        { label: "削除", value: "remove" },
        { label: "一覧", value: "list" },
      ),
  );
  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("imm_user")
      .setPlaceholder("対象ユーザー")
      .setMaxValues(1),
  );

  await button.reply({
    content: "免除の操作を選んでください（追加/削除はユーザーも選択）。",
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
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: "add" | "remove" | "list" | null = null;
  let target: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "imm_act") {
      act = pickUnionValue(component.values[0], ["add", "remove", "list"]);
      await component.deferUpdate();
      return;
    }

    if (component.isUserSelectMenu() && component.customId === "imm_user") {
      target = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "imm_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "imm_exec") {
      if (!act) {
        await component.reply({
          content: "操作を選んでください。",
          flags: "Ephemeral",
        });
        return;
      }
      if ((act === "add" || act === "remove") && !target) {
        await component.reply({
          content: "対象を選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      if (act === "list") {
        const list = getImmuneList(context.gid);
        await component.reply({
          content: list.length
            ? list.map((entry, index) => `${index + 1}. <@${entry}> (\`${entry}\`)`).join("\n")
            : "（なし）",
          flags: "Ephemeral",
        });
      } else if (act === "add") {
        const targetUserId = target;
        if (!targetUserId) return;
        const ok = addImmuneId(context.gid, targetUserId);
        const tag = await displayNameFrom(component, targetUserId);
        await component.reply({
          content: ok
            ? `\`${tag}\` を免除リストに追加しました。`
            : `\`${tag}\` は既に免除リストに存在します。`,
          flags: "Ephemeral",
        });
      } else if (act === "remove") {
        const targetUserId = target;
        if (!targetUserId) return;
        const ok = removeImmuneId(context.gid, targetUserId);
        const tag = await displayNameFrom(component, targetUserId);
        await component.reply({
          content: ok
            ? `\`${tag}\` を免除リストから削除しました。`
            : `\`${tag}\` は免除リストにありません。`,
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

const handleControlAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_control") {
    return false;
  }

  if (
    !(await requireAdminOrDev(button, "値の直接設定は管理者/開発者のみ。"))
  ) {
    return true;
  }

  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("ctl_user")
      .setPlaceholder("対象ユーザー")
      .setMaxValues(1),
  );

  await button.reply({
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
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let target: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isUserSelectMenu() && component.customId === "ctl_user") {
      target = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "ctl_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "ctl_set") {
      const targetUserId = target;
      if (!targetUserId) {
        await component.reply({
          content: "対象を選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      const targetUser = await component.client.users
        .fetch(targetUserId)
        .catch(() => null);
      if (!targetUser) {
        await component.reply({
          content: COMMON_MESSAGES.targetUserUnavailable,
          flags: "Ephemeral",
        });
        return;
      }

      if (isBotOrSelfTarget(targetUser, component.client.user?.id)) {
        await component.reply({
          content: COMMON_MESSAGES.botTargetExcluded,
          flags: "Ephemeral",
        });
        return;
      }

      if (isOwnerTarget(targetUserId, OWNER_IDS)) {
        await component.reply({
          content: COMMON_MESSAGES.ownerTargetExcluded,
          flags: "Ephemeral",
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
      const submitted = await showModalAndAwait(component, modal);
      if (!submitted) {
        return;
      }

      const value = parseBigIntInput(
        submitted.fields.getTextInputValue("value"),
      );
      if (value === null || value < 0n) {
        await submitted.reply({
          content: "0以上の数値を入力してください。",
          flags: "Ephemeral",
        });
        return;
      }

      const next = setCountGuild(context.gid, targetUserId, value);
      const tag = await displayNameFrom(submitted, targetUserId);

      await clearPanelComponents(panel);
      await submitted.reply({
        content: `**${tag}** のしばかれ回数を **${safeCount(next)} 回** に設定しました。`,
        flags: "Ephemeral",
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleMondayAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_monday") {
    return false;
  }

  await button.deferUpdate();
  await button.followUp({
    content: isSundayInJst() ? MONDAY_TAUNT_MESSAGE : NOT_SUNDAY_MESSAGE,
  });
  return true;
};

const handleResetAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_reset") {
    return false;
  }

  if (!(await requireAdminOrDev(button, "リセットは管理者/開発者のみ。"))) {
    return true;
  }

  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
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

  await button.reply({
    content: "個別リセットか全員リセットを選んでください。",
    components: [rowUser, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let resetTargetUserId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isUserSelectMenu() && component.customId === "reset_user") {
      resetTargetUserId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "reset_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "reset_exec_all") {
      resetAllCounts(context.gid);
      await component.update({
        content: "全員のしばき回数を0にリセットしました。",
        components: [],
      });
      sub.stop("done");
      return;
    }

    if (component.isButton() && component.customId === "reset_exec_one") {
      if (!resetTargetUserId) {
        await component.reply({
          content: "対象ユーザーを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      setCountGuild(context.gid, resetTargetUserId, 0n);
      const displayName = await displayNameFrom(component, resetTargetUserId);
      await component.update({
        content: `**${displayName}** のしばき回数を0にリセットしました。`,
        components: [],
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleMaintenanceAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId !== "menu_maintenance") {
    return false;
  }

  if (
    !(await requireAdminGuildOwnerOrDev(
      button,
      "メンテナンス切替は管理者 / サーバーオーナー / 開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const enabled = getMaintenanceEnabled(context.gid);
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

  await button.reply({
    content: `現在のメンテナンスモード: **${enabled ? "ON" : "OFF"}**`,
    components: [row],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (!component.isButton()) return;

    if (component.customId === "maintenance_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (
      component.customId !== "maintenance_on" &&
      component.customId !== "maintenance_off"
    ) {
      return;
    }

    const nextEnabled = component.customId === "maintenance_on";
    setMaintenanceEnabled(context.gid, nextEnabled);
    await component.update({
      content: nextEnabled
        ? "✅ メンテナンスモードを有効化しました。"
        : "✅ メンテナンスモードを無効化しました。",
      components: [],
    });
    sub.stop("done");
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleAiChatToggleAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId !== "menu_ai_chat") {
    return false;
  }

  if (
    !(await requireAdminGuildOwnerOrDev(
      button,
      "AIチャット切替は管理者 / サーバーオーナー / 開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const enabled = getAiChatEnabled(context.gid);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ai_chat_on")
      .setLabel("ON")
      .setStyle(ButtonStyle.Success)
      .setDisabled(enabled),
    new ButtonBuilder()
      .setCustomId("ai_chat_off")
      .setLabel("OFF")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!enabled),
    new ButtonBuilder()
      .setCustomId("ai_chat_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  await button.reply({
    content: `現在のAIチャット機能: **${enabled ? "ON" : "OFF"}**`,
    components: [row],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (!component.isButton()) return;

    if (component.customId === "ai_chat_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (
      component.customId !== "ai_chat_on" &&
      component.customId !== "ai_chat_off"
    ) {
      return;
    }

    const nextEnabled = component.customId === "ai_chat_on";
    setAiChatEnabled(context.gid, nextEnabled);
    await component.update({
      content: nextEnabled
        ? "✅ AIチャット機能を有効化しました。"
        : "✅ AIチャット機能を無効化しました。",
      components: [],
    });
    sub.stop("done");
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleVoteAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vs") {
    return false;
  }

  if (!TARGET_GUILD_ID || button.guildId !== TARGET_GUILD_ID) {
    await button.reply({
      content: "この機能は対象サーバーでのみ利用できます。",
      flags: "Ephemeral",
    });
    return true;
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

  const submitted = await showModalAndAwait(button, modal);
  if (!submitted) {
    return true;
  }

  const question = submitted.fields.getTextInputValue("question").trim();
  const option1 = submitted.fields.getTextInputValue("option1").trim();
  const option2 = submitted.fields.getTextInputValue("option2").trim();

  if (option1 === option2) {
    await submitted.reply({
      content: "項目1と項目2は別の内容を指定してください。",
      flags: "Ephemeral",
    });
    return true;
  }

  const channelForPoll = submitted.channel;
  if (!channelForPoll || !("send" in channelForPoll)) {
    await submitted.reply({
      content: "投票の送信先チャンネルを取得できませんでした。",
      flags: "Ephemeral",
    });
    return true;
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
      flags: "Ephemeral",
    });
    return true;
  }

  await submitted.reply({
    content: "✅ 投票を作成しました。",
    flags: "Ephemeral",
  });
  return true;
};

const MANAGEMENT_HANDLERS: readonly MenuActionHandler[] = [
  handleLimitAction,
  handleImmuneAction,
  handleControlAction,
  handleMondayAction,
  handleResetAction,
  handleMaintenanceAction,
  handleAiChatToggleAction,
  handleVoteAction,
];

export const handleMenuManagementAction: MenuActionHandler = async (
  context,
  button,
) => {
  for (const handler of MANAGEMENT_HANDLERS) {
    if (await handler(context, button)) {
      return true;
    }
  }

  return false;
};
