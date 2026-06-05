import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} from "discord.js";
import { getUserCount } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import {
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  formatCountWithReading,
} from "./common";
import type { MenuActionHandler } from "./context";
import { executeVoiceBatch } from "./voiceBatch";
import { executeMoveVoice } from "./voiceMove";

const handleMoveVoiceAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_movevc") return false;
  await executeMoveVoice(button);
  return true;
};

const handleCheckAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_check") return false;

  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
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

  await button.reply({
    content: "回数を確認するユーザーを選んでください。",
    components: [rowUser, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let targetUserId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isUserSelectMenu() && component.customId === "check_user") {
      targetUserId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "check_cancel") {
      await component.update({ content: "キャンセルしました。", components: [] });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "check_exec") {
      if (!targetUserId) {
        await component.reply({
          content: "対象ユーザーを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      const count = getUserCount(context.gid, targetUserId);
      const displayName = await displayNameFrom(component, targetUserId);
      await component.update({
        content: `**${displayName}** は今までに ${formatCountWithReading(count)} しばかれました。`,
        components: [],
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleDisconnectAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vcdisconnect") return false;
  await executeVoiceBatch(button, {
    actionPrefix: "discvc",
    permissionFlag: PermissionFlagsBits.MoveMembers,
    noPermissionMessage:
      "⚠️ VC切断は管理者/MoveMembers権限/開発者のみ使えます。",
    promptMessage: "🔇 VCから切断するメンバーを選んでください。",
    userPlaceholder: "切断するメンバーを選択（最大10人）",
    executeLabel: "切断を実行",
    executeStyle: ButtonStyle.Danger,
    missingTargetMessage: "切断するメンバーを選んでください。",
    resultHeader: "VC切断結果",
    successMessage: "✅ 切断しました",
    failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
    maxUsers: 10,
    applyAction: async (member) => {
      await member.voice.setChannel(null);
    },
  });
  return true;
};

const handleMuteAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vcmute") return false;
  await executeVoiceBatch(button, {
    actionPrefix: "mutevc",
    permissionFlag: PermissionFlagsBits.MuteMembers,
    noPermissionMessage:
      "⚠️ VCミュートは管理者/MuteMembers権限/開発者のみ使えます。",
    promptMessage: "🔇 VCでミュートするメンバーを選んでください。",
    userPlaceholder: "ミュートするメンバーを選択（最大10人）",
    executeLabel: "ミュートを実行",
    executeStyle: ButtonStyle.Danger,
    missingTargetMessage: "ミュートするメンバーを選んでください。",
    resultHeader: "VCミュート結果",
    successMessage: "✅ ミュートしました",
    failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
    maxUsers: 10,
    applyAction: async (member) => {
      await member.voice.setMute(true);
    },
  });
  return true;
};

const handleUnmuteAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vcunmute") return false;
  await executeVoiceBatch(button, {
    actionPrefix: "unmutevc",
    permissionFlag: PermissionFlagsBits.MuteMembers,
    noPermissionMessage:
      "⚠️ VCミュート解除は管理者/MuteMembers権限/開発者のみ使えます。",
    promptMessage: "🔈 VCでミュート解除するメンバーを選んでください。",
    userPlaceholder: "ミュート解除するメンバーを選択（最大10人）",
    executeLabel: "ミュート解除を実行",
    executeStyle: ButtonStyle.Success,
    missingTargetMessage: "ミュート解除するメンバーを選んでください。",
    resultHeader: "VCミュート解除結果",
    successMessage: "✅ ミュート解除しました",
    failureMessage: "⚠️ 失敗（権限/接続状態を確認）",
    maxUsers: 10,
    applyAction: async (member) => {
      await member.voice.setMute(false);
    },
  });
  return true;
};

const VOICE_HANDLERS: readonly MenuActionHandler[] = [
  handleMoveVoiceAction,
  handleDisconnectAction,
  handleMuteAction,
  handleUnmuteAction,
  handleCheckAction,
];

export const handleMenuVoiceAction: MenuActionHandler = async (
  context,
  button,
) => {
  for (const handler of VOICE_HANDLERS) {
    if (await handler(context, button)) {
      return true;
    }
  }
  return false;
};
