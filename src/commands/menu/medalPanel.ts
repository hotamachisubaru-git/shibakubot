import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import {
  SKY_DREAM_TYPE_A_BETS,
  getMedalAccountSnapshot,
} from "../../medals/index";
import { formatMedalCount } from "../../utils/medalFormat";

export interface MedalPanelState {
  embed: EmbedBuilder;
  rows: ActionRowBuilder<ButtonBuilder>[];
  balance: bigint;
}

export function buildMedalCornerPanel(
  gid: string,
  userId: string,
): MedalPanelState {
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

  return { embed, rows: [rowPrimary, rowSecondary], balance: snapshot.balance };
}
