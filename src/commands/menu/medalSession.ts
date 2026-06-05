import { ButtonBuilder, ButtonInteraction, EmbedBuilder } from "discord.js";
import { ActionRowBuilder } from "discord.js";
import { playSkyDreamTypeA, type SkyDreamPlayResult } from "../../medals/index";
import type { MenuActionContext } from "./context";
import { createPanelCollector, clearPanelComponents, type PanelMessage } from "./common";
import { buildMedalCornerPanel, type MedalPanelState } from "./medalPanel";
import { buildMedalResultRows, buildSkyDreamResultEmbed, buildSkyDreamAnnouncementMessage } from "./medalResult";

export function bindPanelCleanupUnless(
  collector: ReturnType<typeof createPanelCollector>,
  panel: PanelMessage,
  skippedReasons: readonly string[],
): void {
  collector.on("end", async (_, reason) => {
    if (skippedReasons.includes(reason)) {
      return;
    }
    await clearPanelComponents(panel);
  });
}

export function startMedalResultSession(
  context: MenuActionContext,
  interaction: ButtonInteraction,
  panel: PanelMessage,
  sessionStartBalance: bigint,
): void {
  const sub = createPanelCollector(interaction, panel, 300_000);

  sub.on("collect", async (component) => {
    if (!component.isButton()) return;

    if (component.customId === "medal_result_continue") {
      const nextPanel = buildMedalCornerPanel(context.gid, component.user.id);
      await component.update({
        embeds: [nextPanel.embed],
        components: nextPanel.rows,
      });
      sub.stop("continue");
      startMedalPanelSession(
        context,
        component,
        panel,
        sessionStartBalance,
      );
      return;
    }

    if (component.customId === "medal_result_end") {
      await context.setPage(1).catch(() => {});
      await component.update({
        content: "\u200b",
        embeds: [],
        components: [],
      });
      sub.stop("end");
    }
  });

  bindPanelCleanupUnless(sub, panel, ["continue", "end"]);
}

export async function startMedalPanelSession(
  context: MenuActionContext,
  interaction: ButtonInteraction,
  panel: PanelMessage,
  sessionStartBalance: bigint,
): Promise<void> {
  const sub = createPanelCollector(interaction, panel, 300_000);

  sub.on("collect", async (component) => {
    if (!component.isButton()) return;

    if (component.customId === "medal_refresh") {
      const refreshed = buildMedalCornerPanel(context.gid, component.user.id);
      await component.update({
        embeds: [refreshed.embed],
        components: refreshed.rows,
      });
      return;
    }

    if (component.customId === "medal_close") {
      await component.update({
        content: "メダルコーナーを閉じました。",
        embeds: [],
        components: [],
      });
      sub.stop("close");
      return;
    }

    if (!component.customId.startsWith("medal_bet_")) {
      return;
    }

    const bet = Number(component.customId.replace("medal_bet_", ""));
    const attempt = playSkyDreamTypeA(context.gid, component.user.id, bet);

    if (!attempt.ok) {
      const refreshed = buildMedalCornerPanel(context.gid, component.user.id);
      try {
        await panel.edit({
          embeds: [refreshed.embed],
          components: refreshed.rows,
        });
      } catch {
        // noop
      }

      await component.reply({
        content:
          attempt.reason === "insufficient_medals"
            ? `メダルが足りません。現在 **${attempt.balance}枚** です。`
            : "BET値が不正です。",
        flags: "Ephemeral",
      });
      return;
    }

    await component.deferReply({
      flags: "Ephemeral",
    });
    sub.stop("played");
    await clearPanelComponents(panel);

    const resultEmbed = await buildSkyDreamResultEmbed(
      component,
      attempt.play,
      attempt.play.balanceAfter - sessionStartBalance,
    );
    await component.editReply({
      embeds: [resultEmbed],
      components: buildMedalResultRows(),
    });

    const resultPanel = await component.fetchReply();
    startMedalResultSession(
      context,
      component,
      resultPanel,
      sessionStartBalance,
    );

    const announcement = await buildSkyDreamAnnouncementMessage(
      component,
      attempt.play,
    );
    if (announcement && component.channel && "send" in component.channel) {
      await component.channel.send({
        content: announcement,
        allowedMentions: { parse: [] },
      });
    }
  });

  bindPanelCleanupUnless(sub, panel, ["close", "played"]);
}
