import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import type { PanelMessage } from "./common";
import { safeCount } from "./common";
import { createPanelCollector, clearPanelComponents, bindPanelCleanup, showModalAndAwait, requireAdminOrDev } from "./common";
import { setSbkRange } from "../../data";

export async function openLimitModal(
  button: MessageComponentInteraction,
  gid: string,
  min: bigint,
  max: bigint,
  onChange: (min: number, max: number) => Promise<void> | void,
): Promise<boolean> {
  if (!(await requireAdminOrDev(button, "上限設定は管理者/開発者のみ。"))) {
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId("limit_modal")
    .setTitle("しばく回数の上限設定");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("min")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1以上の整数")
        .setRequired(true)
        .setLabel(`最小（現在 ${safeCount(min)}回）`),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("max")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("最小以上の整数")
        .setRequired(true)
        .setLabel(`最大（現在 ${safeCount(max)}回）`),
    ),
  );

  const submitted = await showModalAndAwait(button, modal);
  if (!submitted) return true;

  const minIn = Number(submitted.fields.getTextInputValue("min"));
  const maxIn = Number(submitted.fields.getTextInputValue("max"));
  if (!Number.isFinite(minIn) || !Number.isFinite(maxIn)) {
    await submitted.reply({
      content: "数値を入力してください。",
      flags: "Ephemeral",
    });
    return true;
  }

  const nextRange = setSbkRange(gid, minIn, maxIn);
  await onChange(nextRange.min, nextRange.max);

  await submitted.reply({
    content: `✅ しばく回数の範囲を **${safeCount(BigInt(nextRange.min))}〜${safeCount(BigInt(nextRange.max))}回** に変更しました。`,
    flags: "Ephemeral",
  });
  return true;
}
