import { type ChatInputCommandInteraction } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { setCountGuild } from "../data";
import { hasAdminOrDevPermission } from "../utils/permissions";
import { isBotOrSelfTarget, isOwnerTarget } from "../utils/targetGuards";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

function normalizeCountInput(raw: string): bigint {
  try {
    const parsed = BigInt(raw);
    return parsed < 0n ? 0n : parsed;
  } catch {
    return 0n;
  }
}

export async function handleControl(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      flags: "Ephemeral",
    });
    return;
  }

  if (!hasAdminOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: COMMON_MESSAGES.noPermissionAdminOrDev,
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

  const target = interaction.options.getUser("user", true);
  if (isBotOrSelfTarget(target, interaction.client.user?.id)) {
    await interaction.reply({
      content: COMMON_MESSAGES.botTargetExcluded,
      flags: "Ephemeral",
    });
    return;
  }

  if (isOwnerTarget(target.id, OWNER_IDS)) {
    await interaction.reply({
      content: COMMON_MESSAGES.ownerTargetExcluded,
      flags: "Ephemeral",
    });
    return;
  }

  const newCountRaw = interaction.options.getString("count", true);
  const nextCount = normalizeCountInput(newCountRaw);
  const after = setCountGuild(guildId, target.id, nextCount);

  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  const displayName = member?.displayName ?? target.tag;

  await interaction.reply({
    content: `**${displayName}** のしばかれ回数を **${after} 回** に設定しました。`,
    allowedMentions: { parse: [] },
    flags: "Ephemeral",
  });
}
