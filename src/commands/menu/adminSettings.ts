import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} from "discord.js";
import type { MenuActionContext, MenuActionHandler } from "./context";
import { requireAdminOrDev, pickUnionValue, clearPanelComponents, createPanelCollector, bindPanelCleanup } from "./common";
import { getSetting, setSetting } from "../../data";
import { LOG_CHANNEL_ID } from "../../config/index";
import { LOG_CHANNEL_KEY } from "./common";

const handleSettingsAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_settings") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "サーバー設定は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const current = getSetting(context.gid, LOG_CHANNEL_KEY);
  const fallbackText = LOG_CHANNEL_ID ? `<#${LOG_CHANNEL_ID}>（env）` : "未設定";
  const currentText = current ? `<#${current}>` : fallbackText;

  const rowChannel =
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("settings_log_channel")
        .setPlaceholder("ログ送信チャンネルを選択")
        .addChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    );
  const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("settings_save")
      .setLabel("保存")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("settings_clear")
      .setLabel("クリア")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("settings_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Danger),
  );

  await button.reply({
    content:
      `現在のログチャンネル: ${currentText}\n` +
      "チャンネルを選択して「保存」を押してください。",
    components: [rowChannel, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let pickedChannelId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (
      component.isChannelSelectMenu() &&
      component.customId === "settings_log_channel"
    ) {
      pickedChannelId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "settings_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "settings_clear") {
      setSetting(context.gid, LOG_CHANNEL_KEY, null);
      await component.reply({
        content: `ログチャンネル設定をクリアしました。現在: ${fallbackText}`,
        flags: "Ephemeral",
      });
      await clearPanelComponents(panel);
      sub.stop("done");
      return;
    }

    if (component.isButton() && component.customId === "settings_save") {
      if (!pickedChannelId) {
        await component.reply({
          content: "チャンネルを選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      setSetting(context.gid, LOG_CHANNEL_KEY, pickedChannelId);
      await component.reply({
        content: `ログチャンネルを <#${pickedChannelId}> に設定しました。`,
        flags: "Ephemeral",
      });
      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

export { handleSettingsAction };
