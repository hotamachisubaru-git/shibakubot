// src/commands/menu/panel.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
} from "discord.js";
import { hasAdminOrDevPermission } from "../../utils/permissions";
import { OWNER_IDS } from "./menuPageDefs";

export type PanelMessage = Awaited<ReturnType<MessageComponentInteraction["fetchReply"]>>;

export async function clearPanelComponents(panel: PanelMessage): Promise<void> {
  try {
    await panel.edit({ components: [] });
  } catch {
    /* noop */
  }
}

export function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
  return rows.map((r) => {
    const cloned = new ActionRowBuilder<ButtonBuilder>();
    const comps = r.components.map((c) =>
      ButtonBuilder.from(c).setDisabled(true),
    );
    cloned.addComponents(comps);
    return cloned;
  });
}

export function createPanelCollector(
  interaction: MessageComponentInteraction,
  panel: PanelMessage,
  time = 120_000,
) {
  const channel = interaction.channel;
  if (!channel) throw new Error("message component channel is unavailable");
  return channel.createMessageComponentCollector({
    time,
    filter: (i) => i.user.id === interaction.user.id && i.message.id === panel.id,
  });
}

export function bindPanelCleanup(
  collector: ReturnType<typeof createPanelCollector>,
  panel: PanelMessage,
) {
  collector.on("end", async () => {
    await clearPanelComponents(panel);
  });
}

export async function requireAdminOrDev(
  i: MessageComponentInteraction,
  message = "この操作は管理者/開発者のみ利用できます。",
): Promise<boolean> {
  if (!hasAdminOrDevPermission(i, OWNER_IDS)) {
    await i.reply({ content: `⚠️ ${message}`, flags: "Ephemeral" });
    return false;
  }
  return true;
}

export async function showModalAndAwait(
  interactor: MessageComponentInteraction,
  modal: ModalBuilder,
  time = 60_000,
): Promise<ModalSubmitInteraction | null> {
  await interactor.showModal(modal);
  return interactor
    .awaitModalSubmit({
      time,
      filter: (m: ModalSubmitInteraction) => m.user.id === interactor.user.id,
    })
    .catch(() => null);
}
