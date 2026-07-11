import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import type { PanelMessage } from "./common";
import { safeCount } from "./common";
import { createPanelCollector, clearPanelComponents, bindPanelCleanup, bindPanelCollect, requireAdminOrDev } from "./common";
import { getImmuneList, addImmuneId, removeImmuneId } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";

export async function handleImmuneMenu(
  button: MessageComponentInteraction,
  gid: string,
  refreshMenu: () => Promise<void>,
): Promise<boolean> {
  if (!(await requireAdminOrDev(button, "免除管理は管理者/開発者のみ。"))) {
    return true;
  }

  const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("imm_act")
      .setPlaceholder("操作を選択")
      .addOptions(
        { label: "追加", value: "add" },
        { label: "削除", value: "remove" },
        { label: "一覧", value: "list" },
      ),
  );
  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("imm_user")
      .setPlaceholder("対象ユーザー")
      .setMaxValues(1),
  );

  await button.reply({
    content: "免除の操作を選んでください（追加/削除はユーザーも選択）。",
    components: [
      rowAct,
      rowUser,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("imm_exec")
          .setLabel("実行")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("imm_cancel")
          .setLabel("キャンセル")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let act: "add" | "remove" | "list" | null = null;
  let target: string | null = null;
  const sub = createPanelCollector(button, panel);

  bindPanelCollect(sub, "immune", async (component) => {
    if (component.isStringSelectMenu() && component.customId === "imm_act") {
      act = component.values[0] as "add" | "remove" | "list" | null;
      await component.deferUpdate();
      return;
    }

    if (component.isUserSelectMenu() && component.customId === "imm_user") {
      target = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "imm_cancel") {
      await component.update({
        content: "キャンセルしました。",
        components: [],
      });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "imm_exec") {
      if (!act) {
        await component.reply({ content: "操作を選んでください。", flags: "Ephemeral" });
        return;
      }
      if ((act === "add" || act === "remove") && !target) {
        await component.reply({ content: "対象を選んでください。", flags: "Ephemeral" });
        return;
      }

      if (act === "list") {
        const list = getImmuneList(gid);
        await component.reply({
          content: list.length
            ? list.map((entry, index) => `${index + 1}. <@${entry}> (\`${entry}\`)`).join("\n")
            : "（なし）",
          flags: "Ephemeral",
        });
      } else if (act === "add") {
        const ok = addImmuneId(gid, target!);
        const tag = await displayNameFrom(component, target!);
        await component.reply({
          content: ok ? `\`${tag}\` を免除リストに追加しました。` : `\`${tag}\` は既に免除リストに存在します。`,
          flags: "Ephemeral",
        });
      } else if (act === "remove") {
        const ok = removeImmuneId(gid, target!);
        const tag = await displayNameFrom(component, target!);
        await component.reply({
          content: ok ? `\`${tag}\` を免除リストから削除しました。` : `\`${tag}\` は免除リストにありません。`,
          flags: "Ephemeral",
        });
      }

      await clearPanelComponents(panel);
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
}
