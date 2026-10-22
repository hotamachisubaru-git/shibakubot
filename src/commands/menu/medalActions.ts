import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import {
  addMedalBalance,
  addMedalVip,
  isMedalVipTier,
  listMedalVips,
  MAX_MEDAL_BALANCE,
  MEDAL_VIP_TIERS,
  removeMedalBalance,
  removeMedalVip,
  setMedalBalance,
} from "../../data";
import type { MedalBalanceChange, MedalVipTier } from "../../data";
import { COMMON_MESSAGES } from "../../constants/messages";
import { parseBigIntInput } from "../../utils/bigint";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { fetchUserOrNull } from "../../utils/discordErrors";
import { isBotOrSelfTarget } from "../../utils/targetGuards";
import type { MenuActionHandler } from "./context";
import {
  bindPanelCleanup,
  bindPanelCollect,
  clearPanelComponents,
  createPanelCollector,
  formatWithComma,
  requireAdminOrDev,
  showModalAndAwait,
} from "./common";

type MedalBalanceMode = "add" | "remove" | "set";
type VipAction = "add" | "remove" | "list";

const VIP_TIER_LABELS: Readonly<Record<MedalVipTier, string>> = {
  bronze: "ブロンズ",
  silver: "シルバー",
  gold: "ゴールド",
  platinum: "プラチナ",
  diamond: "ダイヤモンド",
};

export function buildVipPanelComponents(
  selectedAction: VipAction | null,
  selectedUserId: string | null,
  selectedTier: MedalVipTier | null,
) {
  const actionMenu = new StringSelectMenuBuilder()
    .setCustomId("medal_vip_action")
    .setPlaceholder("操作を選択")
    .addOptions(
      { label: "VIPに追加", value: "add", default: selectedAction === "add" },
      {
        label: "VIPから削除",
        value: "remove",
        default: selectedAction === "remove",
      },
      { label: "VIP一覧", value: "list", default: selectedAction === "list" },
    );
  const userMenu = new UserSelectMenuBuilder()
    .setCustomId("medal_vip_user")
    .setPlaceholder("対象ユーザー")
    .setMaxValues(1);
  if (selectedUserId) {
    userMenu.setDefaultUsers(selectedUserId);
  }

  const actionRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionMenu);
  const userRow =
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userMenu);
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("medal_vip_exec")
      .setLabel("実行")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("medal_vip_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  if (selectedAction !== "add") {
    return [actionRow, userRow, buttonRow];
  }

  const tierRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("medal_vip_tier")
        .setPlaceholder("VIPランクを選択")
        .addOptions(
          ...MEDAL_VIP_TIERS.map((tier) => ({
            label: VIP_TIER_LABELS[tier],
            value: tier,
            default: selectedTier === tier,
          })),
        ),
    );
  return [actionRow, userRow, tierRow, buttonRow];
}

const BALANCE_ACTIONS: Readonly<
  Record<
    MedalBalanceMode,
    {
      buttonId: string;
      panelText: string;
      modalTitle: string;
      inputLabel: string;
      doneLabel: string;
    }
  >
> = {
  add: {
    buttonId: "menu_medal_add",
    panelText: "メダルを追加するユーザーを選んでください。",
    modalTitle: "メダルを追加",
    inputLabel: "追加する枚数（1以上・カンマ区切り可）",
    doneLabel: "追加",
  },
  remove: {
    buttonId: "menu_medal_remove",
    panelText: "メダルを減算するユーザーを選んでください。",
    modalTitle: "メダルを減算",
    inputLabel: "減算する枚数（1以上・カンマ区切り可）",
    doneLabel: "減算",
  },
  set: {
    buttonId: "menu_medal_set",
    panelText: "メダル残高を指定値へ上書きするユーザーを選んでください。",
    modalTitle: "メダル残高を設定",
    inputLabel: "新しい残高（0以上・カンマ区切り可）",
    doneLabel: "設定",
  },
};

function buildAmountModal(mode: MedalBalanceMode): ModalBuilder {
  const action = BALANCE_ACTIONS[mode];
  return new ModalBuilder()
    .setCustomId(`medal_balance_modal_${mode}`)
    .setTitle(action.modalTitle)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(action.inputLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(formatWithComma(MAX_MEDAL_BALANCE).length + 1),
      ),
    );
}

function validateAmount(
  raw: string,
  mode: MedalBalanceMode,
): bigint | null {
  const amount = parseBigIntInput(raw);
  const minimum = mode === "set" ? 0n : 1n;
  if (amount === null || amount < minimum || amount > MAX_MEDAL_BALANCE) {
    return null;
  }
  return amount;
}

async function openBalancePanel(
  button: MessageComponentInteraction,
  mode: MedalBalanceMode,
): Promise<boolean> {
  if (!(await requireAdminOrDev(button, "メダル操作は管理者/開発者のみ利用できます。"))) {
    return true;
  }

  const action = BALANCE_ACTIONS[mode];
  await button.reply({
    content: action.panelText,
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`medal_balance_user_${mode}`)
          .setPlaceholder("対象ユーザー")
          .setMaxValues(1),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`medal_balance_exec_${mode}`)
          .setLabel(action.doneLabel)
          .setStyle(mode === "remove" ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`medal_balance_cancel_${mode}`)
          .setLabel("キャンセル")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  const collector = createPanelCollector(button, panel);
  let targetUserId: string | null = null;

  bindPanelCollect(collector, `medal-balance-${mode}`, async (component) => {
    if (
      component.isUserSelectMenu() &&
      component.customId === `medal_balance_user_${mode}`
    ) {
      targetUserId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (
      component.isButton() &&
      component.customId === `medal_balance_cancel_${mode}`
    ) {
      await component.update({ content: "キャンセルしました。", components: [] });
      collector.stop("cancel");
      return;
    }

    if (
      !component.isButton() ||
      component.customId !== `medal_balance_exec_${mode}`
    ) {
      return;
    }

    const selectedUserId = targetUserId;
    if (!selectedUserId) {
      await component.reply({
        content: "対象ユーザーを選んでください。",
        flags: "Ephemeral",
      });
      return;
    }

    const targetUser = await fetchUserOrNull(component.client, selectedUserId);
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

    const submitted = await showModalAndAwait(component, buildAmountModal(mode));
    if (!submitted) return;

    const amount = validateAmount(
      submitted.fields.getTextInputValue("amount"),
      mode,
    );
    if (amount === null) {
      await submitted.reply({
        content:
          mode === "set"
            ? `0〜${formatWithComma(MAX_MEDAL_BALANCE)} の整数を入力してください（カンマ区切り可）。`
            : `1〜${formatWithComma(MAX_MEDAL_BALANCE)} の整数を入力してください（カンマ区切り可）。`,
        flags: "Ephemeral",
      });
      return;
    }

    let change: MedalBalanceChange;
    try {
      if (mode === "add") {
        change = addMedalBalance(selectedUserId, amount, targetUser.tag);
      } else if (mode === "remove") {
        change = removeMedalBalance(selectedUserId, amount, targetUser.tag);
      } else {
        change = setMedalBalance(selectedUserId, amount, targetUser.tag);
      }
    } catch (error) {
      if (error instanceof RangeError) {
        await submitted.reply({
          content: `操作後の残高は 0〜${formatWithComma(MAX_MEDAL_BALANCE)} 枚に収めてください。`,
          flags: "Ephemeral",
        });
        return;
      }
      throw error;
    }

    const displayName = await displayNameFrom(submitted, selectedUserId);
    await clearPanelComponents(panel);
    await submitted.reply({
      content:
        `💰 **${displayName}** のメダル残高を更新しました。\n` +
        `${formatWithComma(change.before)} 枚 → **${formatWithComma(change.after)} 枚**`,
      flags: "Ephemeral",
      allowedMentions: { parse: [] },
    });
    collector.stop("done");
  });

  bindPanelCleanup(collector, panel);
  return true;
}

async function openVipPanel(
  button: MessageComponentInteraction,
): Promise<boolean> {
  if (!(await requireAdminOrDev(button, "VIP管理は管理者/開発者のみ利用できます。"))) {
    return true;
  }

  await button.reply({
    content: "VIPの操作を選んでください（追加時はユーザーとランクも選択）。",
    components: buildVipPanelComponents(null, null, null),
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  const collector = createPanelCollector(button, panel);
  let action: VipAction | null = null;
  let targetUserId: string | null = null;
  let tier: MedalVipTier | null = null;

  bindPanelCollect(collector, "medal-vip", async (component) => {
    if (
      component.isStringSelectMenu() &&
      component.customId === "medal_vip_action"
    ) {
      const selected = component.values[0];
      const nextAction =
        selected === "add" || selected === "remove" || selected === "list"
          ? selected
          : null;
      action = nextAction;
      if (action !== "add") {
        tier = null;
      }
      await component.update({
        components: buildVipPanelComponents(action, targetUserId, tier),
      });
      return;
    }

    if (
      component.isStringSelectMenu() &&
      component.customId === "medal_vip_tier"
    ) {
      const selected = component.values[0];
      tier = selected && isMedalVipTier(selected) ? selected : null;
      await component.deferUpdate();
      return;
    }

    if (
      component.isUserSelectMenu() &&
      component.customId === "medal_vip_user"
    ) {
      targetUserId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "medal_vip_cancel") {
      await component.update({ content: "キャンセルしました。", components: [] });
      collector.stop("cancel");
      return;
    }

    if (!component.isButton() || component.customId !== "medal_vip_exec") {
      return;
    }

    if (!action) {
      await component.reply({ content: "操作を選んでください。", flags: "Ephemeral" });
      return;
    }

    if (action === "list") {
      const vips = listMedalVips();
      const visibleVips = vips.slice(0, 30);
      const remaining = vips.length - visibleVips.length;
      await component.reply({
        content: vips.length
          ? [
              ...visibleVips.map(
                (vip, index) =>
                  `${index + 1}. 【${VIP_TIER_LABELS[vip.tier]}】 <@${vip.userId}> (\`${vip.userId}\`)`,
              ),
              ...(remaining > 0 ? [`ほか ${remaining} 人`] : []),
            ].join("\n")
          : "VIPユーザーはいません。",
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
      await clearPanelComponents(panel);
      collector.stop("done");
      return;
    }

    const selectedUserId = targetUserId;
    if (!selectedUserId) {
      await component.reply({
        content: "対象ユーザーを選んでください。",
        flags: "Ephemeral",
      });
      return;
    }

    if (action === "add" && tier === null) {
      await component.reply({
        content: "VIPランクを選んでください。",
        flags: "Ephemeral",
      });
      return;
    }

    const targetUser = await fetchUserOrNull(component.client, selectedUserId);
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

    const displayName = await displayNameFrom(component, selectedUserId);
    if (action === "add") {
      const selectedTier = tier;
      if (selectedTier === null) {
        return;
      }
      const change = addMedalVip(
        selectedUserId,
        component.user.id,
        selectedTier,
      );
      const tierLabel = VIP_TIER_LABELS[selectedTier];
      await component.reply({
        content:
          change.before === null
            ? `**${displayName}** を **${tierLabel}** VIPに追加しました。`
            : change.changed
              ? `**${displayName}** のVIPランクを **${VIP_TIER_LABELS[change.before]}** から **${tierLabel}** に変更しました。`
              : `**${displayName}** は既に **${tierLabel}** VIPです。`,
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
    } else {
      const removed = removeMedalVip(selectedUserId);
      await component.reply({
        content: removed
          ? `**${displayName}** をVIPから削除しました。`
          : `**${displayName}** はVIPではありません。`,
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
    }

    await clearPanelComponents(panel);
    collector.stop("done");
  });

  bindPanelCleanup(collector, panel);
  return true;
}

export const handleMenuMedalAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId === "menu_medal") {
    await button.deferUpdate();
    await context.setPage(5);
    return true;
  }

  for (const mode of ["add", "remove", "set"] as const) {
    if (button.customId === BALANCE_ACTIONS[mode].buttonId) {
      return openBalancePanel(button, mode);
    }
  }

  if (button.customId === "menu_medal_vip") {
    return openVipPanel(button);
  }

  return false;
};
