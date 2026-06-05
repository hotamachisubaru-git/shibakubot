import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  EmbedBuilder,
} from "discord.js";
import {
  describeSkyDreamResult,
  describeSkyDreamStep,
  type SkyDreamPlayResult,
} from "../../medals/index";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { formatMedalCount, formatMedalDelta } from "../../utils/medalFormat";

export function buildMedalResultRows(): ActionRowBuilder<ButtonBuilder>[] {
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

export async function buildSkyDreamResultEmbed(
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

export async function buildSkyDreamAnnouncementMessage(
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
