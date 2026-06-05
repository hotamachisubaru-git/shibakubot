import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import { createPanelCollector, bindPanelCleanup, OWNER_IDS } from "./common";
import { hasAdminGuildOwnerOrDevPermission } from "../../utils/permissions";
import { getAiChatEnabled, setAiChatEnabled } from "../../data";

async function requireAdminGuildOwnerOrDev(
  interaction: MessageComponentInteraction,
  message: string,
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

export async function handleAiChatToggle(
  button: MessageComponentInteraction,
  gid: string,
): Promise<boolean> {
  if (!(await requireAdminGuildOwnerOrDev(
    button,
    "AIチャット切替は管理者 / サーバーオーナー / 開発者のみ利用できます。",
  ))) {
    return true;
  }

  const enabled = getAiChatEnabled(gid);
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
    setAiChatEnabled(gid, nextEnabled);
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
}
