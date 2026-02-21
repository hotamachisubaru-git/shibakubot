// src/commands/reset.ts
import {
  type ChatInputCommandInteraction,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { loadGuildStore, setCountGuild } from "../data";
import { hasAdminOrDevPermission } from "../utils/permissions";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

export async function handleReset(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!hasAdminOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: "権限がありません（管理者/オーナーのみ）。",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  const guildId = interaction.guildId;
  if (!guild || !guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const resetAll = interaction.options.getBoolean("all") ?? false;
  const target = interaction.options.getUser("user");
  const store = loadGuildStore(guildId);

  if (resetAll) {
    for (const userId of Object.keys(store.counts)) {
      setCountGuild(guildId, userId, 0n);
    }

    await interaction.reply({
      content: "全員のしばき回数を0にリセットしました。",
      ephemeral: true,
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
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "リセット対象（`all: true` または `user`）を指定してください。",
    ephemeral: true,
  });
}
