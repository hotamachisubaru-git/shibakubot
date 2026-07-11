import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import type { PanelMessage } from "./common";
import { COMMON_MESSAGES } from "../../constants/messages";
import { createPanelCollector, clearPanelComponents, bindPanelCleanup, bindPanelCollect, requireAdminOrDev } from "./common";
import { OWNER_IDS } from "./common";
import { resetAllCounts, setCountGuild } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { isBotOrSelfTarget, isOwnerTarget } from "../../utils/targetGuards";

export async function handleResetMenu(
  button: MessageComponentInteraction,
  gid: string,
): Promise<boolean> {
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

  bindPanelCollect(sub, "reset-count", async (component) => {
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
      resetAllCounts(gid);
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

      const targetUser = await component.client.users
        .fetch(resetTargetUserId)
        .catch(() => null);
      if (targetUser && isBotOrSelfTarget(targetUser, component.client.user?.id)) {
        await component.reply({
          content: COMMON_MESSAGES.botTargetExcluded,
          flags: "Ephemeral",
        });
        return;
      }
      if (isOwnerTarget(resetTargetUserId, OWNER_IDS)) {
        await component.reply({
          content: COMMON_MESSAGES.ownerTargetExcluded,
          flags: "Ephemeral",
        });
        return;
      }

      setCountGuild(gid, resetTargetUserId, 0n);
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
}
