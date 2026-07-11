import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import type { PanelMessage } from "./common";
import { safeCount, createPanelCollector, clearPanelComponents, bindPanelCleanup, bindPanelCollect, showModalAndAwait, OWNER_IDS, requireAdminOrDev } from "./common";
import { COMMON_MESSAGES } from "../../constants/messages";
import { setCountGuild } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { hasAdminOrDevPermission } from "../../utils/permissions";
import { isBotOrSelfTarget, isOwnerTarget } from "../../utils/targetGuards";
import { parseBigIntInput } from "../../utils/bigint";

async function requireAdminForControl(
  interaction: MessageComponentInteraction,
): Promise<boolean> {
  if (!hasAdminOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: "⚠️ 値の直接設定は管理者/開発者のみ。",
      flags: "Ephemeral",
    });
    return false;
  }
  return true;
}

export async function openControlModal(
  button: MessageComponentInteraction,
  gid: string,
  refreshMenu: () => Promise<void>,
): Promise<boolean> {
  if (!(await requireAdminForControl(button))) {
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

  bindPanelCollect(sub, "set-count", async (component) => {
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
        await component.reply({ content: "対象を選んでください。", flags: "Ephemeral" });
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
      if (!submitted) return;

      const value = parseBigIntInput(submitted.fields.getTextInputValue("value"));
      if (value === null || value < 0n) {
        await submitted.reply({
          content: "0以上の数値を入力してください。",
          flags: "Ephemeral",
        });
        return;
      }

      const next = setCountGuild(gid, targetUserId, value);
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
}
