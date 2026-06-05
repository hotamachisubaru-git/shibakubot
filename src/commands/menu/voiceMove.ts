import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} from "discord.js";
import {
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  OWNER_IDS,
  UNKNOWN_GUILD_MESSAGE,
} from "./common";

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

// ─── VC移動処理（移動先チャンネル選択付き） ──────────────────────

export async function executeMoveVoice(
  button: ButtonInteraction,
): Promise<void> {
  if (
    !hasVoicePermission(button, PermissionFlagsBits.MoveMembers)
  ) {
    await button.reply({
      content:
        "⚠️ VC移動は管理者/MoveMembers権限/開発者のみ使えます。",
      flags: "Ephemeral",
    });
    return;
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
    if (
      component.isUserSelectMenu() &&
      component.customId === "movevc_users"
    ) {
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

    if (
      component.isButton() &&
      component.customId === "movevc_cancel"
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
      component.customId === "movevc_exec"
    ) {
      if (!pickedUsers.length) {
        await component.reply({
          content: "移動するメンバーを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }
      if (!destChannelId) {
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

      const dest = await guild.channels.fetch(destChannelId).catch(() => null);
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
          await member.voice.setChannel(destChannelId);
          results.push(`- ${member.displayName}: ✅ 移動しました`);
        } catch {
          results.push(`- ${member.displayName}: ❌ 失敗（権限/接続状況を確認）`);
        }
      }

      await clearPanelComponents(panel);
      await component.followUp({
        content: `📦 VC移動結果（→ <#${destChannelId}>)\n${results.join("\n")}`,
        flags: "Ephemeral",
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
}
