import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageComponentInteraction,
  StringSelectMenuBuilder,
} from "discord.js";
import type { MenuActionContext, MenuActionHandler } from "./context";
import { requireAdminOrDev, pickUnionValue, clearPanelComponents, createPanelCollector, bindPanelCleanup, bindPanelCollect, listBackupFiles, copyDbWithWal, formatTimestamp } from "./common";
import { BACKUP_ROOT, GUILD_DB_ROOT } from "../../constants/paths";
import { checkpointGuildDb } from "../../data";

const BACKUP_ACTIONS = ["guild", "list"] as const;

const handleBackupAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_backup") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "バックアップ作業は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("backup_act")
      .setPlaceholder("操作を選択")
      .addOptions(
        { label: "ギルドDBをバックアップ", value: "guild" },
        { label: "バックアップ一覧", value: "list" },
      ),
  );
  const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("backup_exec")
      .setLabel("実行")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("backup_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  await button.reply({
    content: "バックアップ操作を選んでください。",
    components: [rowAct, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: (typeof BACKUP_ACTIONS)[number] | null = null;
  const sub = createPanelCollector(button, panel);

  bindPanelCollect(sub, "backup", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "backup_act") {
      act = pickUnionValue(component.values[0], BACKUP_ACTIONS);
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "backup_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "backup_exec") {
      if (!act) {
        await component.reply({
          content: "操作を選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      if (act === "guild") {
        await handleBackupGuild(component, context);
      }

      if (act === "list") {
        await handleBackupList(component, context);
      }

      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

async function handleBackupGuild(
  component: MessageComponentInteraction,
  context: MenuActionContext,
): Promise<void> {
  const src = path.join(GUILD_DB_ROOT, `${context.gid}.db`);
  if (!fs.existsSync(src)) {
    await component.followUp({
      content: "ギルドDBが見つかりません。",
      flags: "Ephemeral",
    });
    return;
  }

  try {
    checkpointGuildDb(context.gid);
  } catch {
    // noop
  }

  const stamp = formatTimestamp();
  const destDir = path.join(BACKUP_ROOT, "guilds", context.gid);
  const dest = path.join(destDir, `${stamp}.db`);
  const copied = copyDbWithWal(src, dest);
  const list = copied
    .map((entry) => `- ${path.relative(process.cwd(), entry)}`)
    .join("\n");
  await component.followUp({
    content: copied.length
      ? `バックアップを作成しました:\n${list}`
      : "バックアップに失敗しました。",
    flags: "Ephemeral",
  });
}

async function handleBackupList(
  component: MessageComponentInteraction,
  context: MenuActionContext,
): Promise<void> {
  const guildDir = path.join(BACKUP_ROOT, "guilds", context.gid);
  const guildList = listBackupFiles(guildDir, 10);
  const lines = [
    "ギルドDBバックアップ:",
    ...(guildList.length ? guildList.map((entry) => `- ${entry}`) : ["（なし）"]),
  ];

  await component.followUp({
    content: lines.join("\n"),
    flags: "Ephemeral",
  });
}

export { handleBackupAction };
