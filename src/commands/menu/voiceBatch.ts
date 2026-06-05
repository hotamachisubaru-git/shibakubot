import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
  type GuildMember,
} from "discord.js";
import {
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  OWNER_IDS,
  UNKNOWN_GUILD_MESSAGE,
} from "./common";

// ─── 型定義 ─────────────────────────────────────────────────────

export type VoiceBatchConfig = Readonly<{
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

// ─── ユーティリティ ─────────────────────────────────────────────

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

// ─── ボーカルバッチ処理 ─────────────────────────────────────────

export async function executeVoiceBatch(
  button: ButtonInteraction,
  config: VoiceBatchConfig,
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
