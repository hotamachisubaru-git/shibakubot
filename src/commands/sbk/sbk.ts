import { type ChatInputCommandInteraction } from "discord.js";
import { getRuntimeConfig } from "../../config/runtime";
import { COMMON_MESSAGES } from "../../constants/messages";
import { addCountGuild, getSbkRange, getUserCount, isImmune } from "../../data";
import { sendLog } from "../../logging";
import { formatBigIntJP } from "../../utils/formatCount";
import { randomInt, randomReason } from "../../utils/sbkRandom";
import { isBotOrSelfTarget } from "../../utils/targetGuards";
import { truncateUtf16WithEllipsis } from "../../utils/text";

const runtimeConfig = getRuntimeConfig();
const IMMUNE_IDS = runtimeConfig.discord.immuneIds;
const MAX_REASON_LENGTH = runtimeConfig.app.maxLogReasonLength;

export async function handleSbk(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      flags: "Ephemeral",
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      flags: "Ephemeral",
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  if (isBotOrSelfTarget(targetUser, interaction.client.user?.id)) {
    await interaction.reply({
      content: COMMON_MESSAGES.botTargetExcluded,
      flags: "Ephemeral",
    });
    return;
  }

  if (isImmune(guildId, targetUser.id) || IMMUNE_IDS.has(targetUser.id)) {
    await interaction.reply({
      content: "このユーザーはしばき免除のため実行できません。",
      flags: "Ephemeral",
    });
    return;
  }

  const { min: sbkMin, max: sbkMax } = getSbkRange(guildId);
  const countRaw = interaction.options.getString("count");
  const reasonInput = interaction.options.getString("reason")?.trim();
  let reason = truncateUtf16WithEllipsis(
    reasonInput || randomReason(),
    MAX_REASON_LENGTH,
  );

  if (countRaw && !/^\d+$/.test(countRaw)) {
    await interaction.reply({
      content: "count は数字で入力してね。",
      flags: "Ephemeral",
    });
    return;
  }

  let count = countRaw ? BigInt(countRaw) : BigInt(randomInt(sbkMin, sbkMax));
  if (count < 1n) count = 1n;

  const min = BigInt(sbkMin);
  const max = BigInt(sbkMax);
  if (count < min) count = min;
  if (count > max) count = max;

  const member = await interaction.guild?.members
    .fetch(targetUser.id)
    .catch(() => null);
  const displayName = member?.displayName ?? targetUser.tag;

  const expectedNextCount = getUserCount(guildId, targetUser.id) + count;
  const replyPrefix =
    `**${displayName}** を **${formatBigIntJP(count)}回** しばきました！\n` +
    `（累計 ${formatBigIntJP(expectedNextCount)}回 / 今回 +${formatBigIntJP(count)}回）\n` +
    "理由: ";
  reason = truncateUtf16WithEllipsis(
    reason,
    Math.max(0, Math.min(MAX_REASON_LENGTH, 2_000 - replyPrefix.length)),
  );

  await interaction.reply(`${replyPrefix}${reason}`);

  let nextCount: bigint;
  try {
    nextCount = addCountGuild(
      guildId,
      targetUser.id,
      count,
      interaction.user.id,
      reason,
    );
  } catch (error) {
    console.error("[sbk] failed to persist count", {
      guildId,
      actorId: interaction.user.id,
      targetId: targetUser.id,
    }, error);
    await interaction.editReply(
      "❌ 返信には成功しましたが、回数の保存に失敗しました。管理者に確認してください。",
    ).catch(() => undefined);
    return;
  }

  if (nextCount !== expectedNextCount) {
    await interaction.editReply(
      `**${displayName}** を **${formatBigIntJP(count)}回** しばきました！\n` +
        `（累計 ${formatBigIntJP(nextCount)}回 / 今回 +${formatBigIntJP(count)}回）\n` +
        `理由: ${reason}`,
    ).catch(() => undefined);
  }

  await sendLog(
    interaction,
    interaction.user.id,
    targetUser.id,
    reason,
    count,
    nextCount,
  ).catch((error: unknown) => {
    console.warn("[sbk] failed to send log", {
      guildId,
      actorId: interaction.user.id,
      targetId: targetUser.id,
    }, error);
  });
}
