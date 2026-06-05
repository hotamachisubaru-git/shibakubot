import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import { createPanelCollector, bindPanelCleanup, requireAdminOrDev, OWNER_IDS } from "./common";
import { hasAdminGuildOwnerOrDevPermission } from "../../utils/permissions";
import { getMaintenanceEnabled, setMaintenanceEnabled } from "../../data";

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

export async function handleMaintenanceToggle(
  button: MessageComponentInteraction,
  gid: string,
): Promise<boolean> {
  if (!(await requireAdminGuildOwnerOrDev(
    button,
    "メンテナンス切替は管理者 / サーバーオーナー / 開発者のみ利用できます。",
  ))) {
    return true;
  }

  const enabled = getMaintenanceEnabled(gid);
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
    setMaintenanceEnabled(gid, nextEnabled);
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
}
