import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
  type GuildMember,
} from "discord.js";
import { getUserCount } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import {
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  formatCountWithReading,
  OWNER_IDS,
  UNKNOWN_GUILD_MESSAGE,
} from "./common";
import type { MenuActionContext, MenuActionHandler } from "./context";

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
  button: ButtonInteraction,
  config: VoiceBatchActionConfig,
): Promise<void> {
  if (!hasVoicePermission(button, config.permissionFlag)) {
    await button.reply({
      content: config.noPermissionMessage,
      flags: "Ephemeral",
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

  await button.reply({
    content: config.promptMessage,
    components: [rowUsers, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let pickedUsers: string[] = [];
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (
      component.isUserSelectMenu() &&
      component.customId === `${config.actionPrefix}_users`
    ) {
      pickedUsers = component.values;
      await component.deferUpdate();
      return;
    }

    if (
      component.isButton() &&
      component.customId === `${config.actionPrefix}_cancel`
    ) {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (
      component.isButton() &&
      component.customId === `${config.actionPrefix}_exec`
    ) {
      if (!pickedUsers.length) {
        await component.reply({
          content: config.missingTargetMessage,
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      const guild = component.guild;
      if (!guild) {
        await component.followUp({
          content: UNKNOWN_GUILD_MESSAGE,
          flags: "Ephemeral",
        });
        return;
      }

      const results: string[] = [];
      for (const userId of pickedUsers) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          results.push(`- <@${userId}>: 見つかりません`);
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
      await component.followUp({
        content: `${config.resultHeader}\n${results.join("\n")}`,
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
}

const handleMoveVoiceAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_movevc") {
    return false;
  }

  if (!hasVoicePermission(button, PermissionFlagsBits.MoveMembers)) {
    await button.reply({
      content: "⚠️ VC移動は管理者/MoveMembers権限/開発者のみ使えます。",
      flags: "Ephemeral",
    });
    return true;
  }

  const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("movevc_users")
      .setPlaceholder("移動するメンバーを選択（複数可）")
      .setMinValues(1)
      .setMaxValues(20),
  );
  const rowDest = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("movevc_dest")
      .setPlaceholder("移動先のボイスチャンネルを選択")
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
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

  await button.reply({
    content: "🎧 移動するメンバーと移動先VCを選んでください。",
    components: [rowUsers, rowDest, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let pickedUsers: string[] = [];
  let destChannelId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isUserSelectMenu() && component.customId === "movevc_users") {
      pickedUsers = component.values;
      await component.deferUpdate();
      return;
    }

    if (
      component.isChannelSelectMenu() &&
      component.customId === "movevc_dest"
    ) {
      destChannelId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "movevc_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "movevc_exec") {
      const selectedDestChannelId = destChannelId;
      if (!pickedUsers.length) {
        await component.reply({
          content: "移動するメンバーを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }
      if (!selectedDestChannelId) {
        await component.reply({
          content: "移動先のVCを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      const guild = component.guild;
      if (!guild) {
        await component.followUp({
          content: UNKNOWN_GUILD_MESSAGE,
          flags: "Ephemeral",
        });
        return;
      }

      const dest = await guild.channels.fetch(selectedDestChannelId).catch(() => null);
      if (
        !dest ||
        (dest.type !== ChannelType.GuildVoice &&
          dest.type !== ChannelType.GuildStageVoice)
      ) {
        await component.followUp({
          content: "❌ 移動先がボイスチャンネルではありません。",
          flags: "Ephemeral",
        });
        return;
      }

      const results: string[] = [];
      for (const userId of pickedUsers) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          results.push(`- <@${userId}>: 見つかりません`);
          continue;
        }
        if (!member.voice?.channelId) {
          results.push(`- ${member.displayName}: VC未参加`);
          continue;
        }
        try {
          await member.voice.setChannel(selectedDestChannelId);
          results.push(`- ${member.displayName}: ✅ 移動しました`);
        } catch {
          results.push(`- ${member.displayName}: ❌ 失敗（権限/接続状況を確認）`);
        }
      }

      await clearPanelComponents(panel);
      await component.followUp({
        content: `📦 VC移動結果（→ <#${selectedDestChannelId}>）\n${results.join("\n")}`,
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleCheckAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_check") {
    return false;
  }

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
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
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
  if (button.customId !== "menu_vcdisconnect") {
    return false;
  }

  await handleVoiceBatchAction(button, {
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
  return true;
};

const handleMuteAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vcmute") {
    return false;
  }

  await handleVoiceBatchAction(button, {
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
  return true;
};

const handleUnmuteAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vcunmute") {
    return false;
  }

  await handleVoiceBatchAction(button, {
    actionPrefix: "unmutevc",
    permissionFlag: PermissionFlagsBits.MuteMembers,
    noPermissionMessage:
      "⚠️ VCミュート解除は管理者/MuteMembers権限/開発者のみ使えます。",
    promptMessage: "🔈 VCでミュート解除するメンバーを選んでください。",
    userPlaceholder: "ミュート解除するメンバーを選択（最大10人）",
    executeLabel: "ミュート解除を実行",
    executeStyle: ButtonStyle.Success,
    missingTargetMessage: "ミュート解除するメンバーを選んでください。",
    resultHeader: "🔈 VCミュート解除結果",
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
