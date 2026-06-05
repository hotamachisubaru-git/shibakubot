import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import {
  SKY_DREAM_TYPE_A_BETS,
  describeSkyDreamResult,
  describeSkyDreamStep,
  getMedalAccountSnapshot,
  playSkyDreamTypeA,
  type SkyDreamPlayResult,
} from "../../medals";
import { displayNameFrom } from "../../utils/displayNameUtil";
import {
  bindPanelCleanup,
  clearPanelComponents,
  createPanelCollector,
  type PanelMessage,
} from "./common";
import type { MenuActionContext, MenuActionHandler } from "./context";

function formatMedalCount(value: bigint): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}枚`;
}

function formatMedalDelta(value: bigint): string {
  const sign = value < 0n ? "-" : "+";
  const abs = value < 0n ? -value : value;
  return `${sign}${formatMedalCount(abs)}`;
}

async function buildSkyDreamAnnouncementMessage(
  interaction: ButtonInteraction,
  play: SkyDreamPlayResult,
): Promise<string | null> {
  const displayName = await displayNameFrom(interaction, interaction.user.id);

  if (play.resultType === "multiplier" && (play.multiplier ?? 0) >= 50) {
    return `${displayName}さんが${play.multiplier}倍を獲得しました！おめでとうございます！`;
  }
  if (play.resultType === "dream_jp") {
    return `${displayName}さんがDream JPを獲得しました！おめでとうございます！`;
  }
  if (play.resultType === "sky_jp") {
    return `${displayName}さんがSky JPを獲得しました！おめでとうございます！`;
  }

  return null;
}

function buildMedalCornerPanel(gid: string, userId: string) {
  const snapshot = getMedalAccountSnapshot(gid, userId);
  const jackpotLines = snapshot.jackpots.map(
    ({ bet, dream, sky }) =>
      `- ${bet}BET | Dream JP ${formatMedalCount(dream)} / Sky JP ${formatMedalCount(sky)}`,
  );

  const rowPrimary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...SKY_DREAM_TYPE_A_BETS.slice(0, 5).map((bet) =>
      new ButtonBuilder()
        .setCustomId(`medal_bet_${bet}`)
        .setLabel(`${bet}BET`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(snapshot.balance < BigInt(bet)),
    ),
  );

  const rowSecondary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("medal_bet_500")
      .setLabel("500BET")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(snapshot.balance < 500n),
    new ButtonBuilder()
      .setCustomId("medal_refresh")
      .setLabel("更新")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("medal_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setTitle("メダルコーナー | SkyDream Type-A")
    .setDescription(
      [
        "内部抽選で進行する完全ランダム仕様です。",
        `所持メダル: **${formatMedalCount(snapshot.balance)}**`,
        "JPC到達: 6段目 / JP到達: 12段目",
        "",
        "現在のJP",
        ...jackpotLines,
      ].join("\n"),
    );

  return {
    embed,
    rows: [rowPrimary, rowSecondary],
    balance: snapshot.balance,
  };
}

function buildMedalResultRows() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("medal_result_continue")
        .setLabel("続ける")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("medal_result_end")
        .setLabel("終わる")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function buildSkyDreamResultEmbed(
  interaction: ButtonInteraction,
  play: SkyDreamPlayResult,
  currentSessionNet: bigint,
): Promise<EmbedBuilder> {
  const displayName = await displayNameFrom(interaction, interaction.user.id);
  const outcome = describeSkyDreamResult(play);
  const progress = play.steps.map(describeSkyDreamStep).join("\n");
  const color =
    play.resultType === "dream_jp"
      ? 0xf1c40f
      : play.resultType === "sky_jp"
        ? 0x5dade2
        : play.payout === 0n
          ? 0xe74c3c
          : play.net >= 0n
            ? 0x2ecc71
            : 0x3498db;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("SkyDream Type-A")
    .setDescription(
      `${displayName} が **${play.bet}BET** でメダル抽選に挑戦しました。`,
    )
    .addFields(
      { name: "結果", value: outcome, inline: true },
      { name: "獲得", value: formatMedalCount(play.payout), inline: true },
      {
        name: "現在の収支",
        value: formatMedalDelta(currentSessionNet),
        inline: true,
      },
      {
        name: "所持メダル",
        value: `${formatMedalCount(play.balanceBefore)} -> ${formatMedalCount(play.balanceAfter)}`,
      },
      {
        name: "進行ログ",
        value: progress,
      },
      {
        name: "現在のJP",
        value: `Dream JP ${formatMedalCount(play.dreamJackpotAfter)} / Sky JP ${formatMedalCount(play.skyJackpotAfter)}`,
      },
    );
}

function bindPanelCleanupUnless(
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

function startMedalResultSession(
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

function startMedalPanelSession(
  context: MenuActionContext,
  interaction: ButtonInteraction,
  panel: PanelMessage,
  sessionStartBalance: bigint,
): void {
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
            ? `メダルが足りません。現在 **${formatMedalCount(attempt.balance)}** です。`
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

export const handleMenuMedalsAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId !== "menu_medals") {
    return false;
  }

  const panelState = buildMedalCornerPanel(context.gid, button.user.id);
  await button.reply({
    embeds: [panelState.embed],
    components: panelState.rows,
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  startMedalPanelSession(
    context,
    button,
    panel,
    panelState.balance,
  );
  return true;
};
