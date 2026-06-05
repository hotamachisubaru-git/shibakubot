import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { MenuActionContext, MenuActionHandler } from "./context";
import type { MessageComponentInteraction } from "discord.js";
import {
  requireAdminOrDev,
  pickUnionValue,
  safeCount,
  clearPanelComponents,
  createPanelCollector,
  bindPanelCleanup,
  formatBytes,
  formatDuration,
  OWNER_IDS,
  LOG_CHANNEL_KEY,
} from "./common";
import { getGuildDbInfo, getSetting, checkpointGuildDb, vacuumGuildDb } from "../../data";
import { LOG_CHANNEL_ID } from "../../config/index";

const DEV_ACTIONS = ["info", "checkpoint", "vacuum"] as const;

const handleDevtoolsAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_devtools") {
    return false;
  }

  if (!OWNER_IDS.has(button.user.id)) {
    await button.reply({
      content: "開発者ツールは OWNER_IDS のみ利用できます。",
      flags: "Ephemeral",
    });
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("dev_act")
      .setPlaceholder("ツールを選択")
      .addOptions(
        { label: "デバッグ情報", value: "info" },
        { label: "WALチェックポイント", value: "checkpoint" },
        { label: "DB最適化（VACUUM）", value: "vacuum" },
      ),
  );
  const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("dev_exec")
      .setLabel("実行")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("dev_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  await button.reply({
    content: "実行する開発者ツールを選んでください。",
    components: [rowAct, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: (typeof DEV_ACTIONS)[number] | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "dev_act") {
      act = pickUnionValue(component.values[0], DEV_ACTIONS);
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "dev_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "dev_exec") {
      if (!act) {
        await component.reply({
          content: "ツールを選択してください。",
          flags: "Ephemeral",
        });
        return;
      }

      await component.deferUpdate();

      if (act === "info") {
        await handleDevInfo(component, context);
      }

      if (act === "checkpoint") {
        await handleDevCheckpoint(component, context);
      }

      if (act === "vacuum") {
        await handleDevVacuum(component, context);
      }

      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

async function handleDevInfo(
  component: MessageComponentInteraction,
  context: MenuActionContext,
): Promise<void> {
  const dbInfo = getGuildDbInfo(context.gid);
  const logChannel = getSetting(context.gid, LOG_CHANNEL_KEY);
  const logLabel = logChannel
    ? `<#${logChannel}>`
    : LOG_CHANNEL_ID
      ? `<#${LOG_CHANNEL_ID}>（env）`
      : "未設定";

  const embed = new EmbedBuilder()
    .setTitle("開発者ツール: デバッグ情報")
    .addFields(
      {
        name: "ギルド",
        value: `${component.guild?.name ?? "unknown"} (${context.gid})`,
      },
      {
        name: "DB",
        value: `size: ${formatBytes(dbInfo.sizeBytes)}\ncounts: ${dbInfo.counts}\nimmune: ${dbInfo.immune}\nlogs: ${dbInfo.logs}\nsettings: ${dbInfo.settings}`,
      },
      { name: "ログチャンネル", value: logLabel },
      {
        name: "SBKレンジ",
        value: `${safeCount(BigInt(context.state.sbkMin))}〜${safeCount(BigInt(context.state.sbkMax))}回`,
        inline: true,
      },
    );

  await component.followUp({ embeds: [embed], flags: "Ephemeral" });
}

async function handleDevCheckpoint(
  component: MessageComponentInteraction,
  context: MenuActionContext,
): Promise<void> {
  try {
    checkpointGuildDb(context.gid);
    await component.followUp({
      content: "WALチェックポイントを実行しました。",
      flags: "Ephemeral",
    });
  } catch {
    await component.followUp({
      content: "WALチェックポイントに失敗しました。",
      flags: "Ephemeral",
    });
  }
}

async function handleDevVacuum(
  component: MessageComponentInteraction,
  context: MenuActionContext,
): Promise<void> {
  try {
    vacuumGuildDb(context.gid);
    await component.followUp({
      content: "VACUUM を実行しました。",
      flags: "Ephemeral",
    });
  } catch {
    await component.followUp({
      content: "VACUUM に失敗しました。",
      flags: "Ephemeral",
    });
  }
}

export { handleDevtoolsAction };
