import { type ChatInputCommandInteraction } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { addCountGuild, getSbkRange, isImmune } from "../data";
import { sendLog } from "../logging";
import { formatBigIntJP } from "../utils/formatCount";
import { randomInt, randomReason } from "../utils/sbkRandom";
import { isBotOrSelfTarget } from "../utils/targetGuards";

const runtimeConfig = getRuntimeConfig();
const IMMUNE_IDS = runtimeConfig.discord.immuneIds;
const MAX_REASON_LENGTH = runtimeConfig.app.maxLogReasonLength;

export async function handleSbk(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  if (isBotOrSelfTarget(targetUser, interaction.client.user?.id)) {
    await interaction.reply({
      content: COMMON_MESSAGES.botTargetExcluded,
      ephemeral: true,
    });
    return;
  }

  if (isImmune(guildId, targetUser.id) || IMMUNE_IDS.has(targetUser.id)) {
    await interaction.reply({
      content: "このユーザーはしばき免除のため実行できません。",
      ephemeral: true,
    });
    return;
  }

  const { min: sbkMin, max: sbkMax } = getSbkRange(guildId);
  const countRaw = interaction.options.getString("count");
  let reason = interaction.options.getString("reason") ?? randomReason();

  if (countRaw && !/^\d+$/.test(countRaw)) {
    await interaction.reply({
      content: "count は数字で入力してね。",
      ephemeral: true,
    });
    return;
  }

  let count = countRaw ? BigInt(countRaw) : BigInt(randomInt(sbkMin, sbkMax));
  if (count < 1n) count = 1n;

  const min = BigInt(sbkMin);
  const max = BigInt(sbkMax);
  if (count < min) count = min;
  if (count > max) count = max;

  const nextCount = addCountGuild(
    guildId,
    targetUser.id,
    count,
    interaction.user.id,
    reason,
  );

  const member = await interaction.guild?.members
    .fetch(targetUser.id)
    .catch(() => null);
  const displayName = member?.displayName ?? targetUser.tag;

  if (reason.length > MAX_REASON_LENGTH) {
    reason = `${reason.slice(0, MAX_REASON_LENGTH)}…`;
  }

  await interaction.reply(
    `**${displayName}** を **${formatBigIntJP(count)}回** しばきました！\n` +
      `（累計 ${formatBigIntJP(nextCount)}回 / 今回 +${formatBigIntJP(count)}回）\n` +
      `理由: ${reason}`,
  );

  await sendLog(
    interaction,
    interaction.user.id,
    targetUser.id,
    reason,
    count,
    nextCount,
  );
}
