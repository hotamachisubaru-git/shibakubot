// src/commands/reset.ts
import {
  type ChatInputCommandInteraction,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { resetAllCounts, setCountGuild } from "../data";
import { hasAdminOrDevPermission } from "../utils/permissions";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

export async function handleReset(
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
      content: "権限がありません（管理者/オーナーのみ）。",
      flags: "Ephemeral",
    });
    return;
  }

  const guild = interaction.guild;
  const guildId = interaction.guildId;
  if (!guild || !guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      flags: "Ephemeral",
    });
    return;
  }

  const resetAll = interaction.options.getBoolean("all") ?? false;
  const target = interaction.options.getUser("user");
  if (resetAll) {
    resetAllCounts(guildId);

    await interaction.reply({
      content: "全員のしばき回数を0にリセットしました。",
      flags: "Ephemeral",
    });
    return;
  }

  if (target) {
    setCountGuild(guildId, target.id, 0n);

    const member = await guild.members.fetch(target.id).catch(() => null);
    const display = member?.displayName ?? target.tag;
    await interaction.reply({
      content: `**${display}** のしばき回数を0にリセットしました。`,
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
    return;
  }

  await interaction.reply({
    content: "リセット対象（`all: true` または `user`）を指定してください。",
    flags: "Ephemeral",
  });
}
