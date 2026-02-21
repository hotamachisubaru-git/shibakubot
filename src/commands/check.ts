import { type ChatInputCommandInteraction } from "discord.js";
import { COMMON_MESSAGES } from "../constants/messages";
import { loadGuildStore } from "../data";

export async function handleCheck(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使用してください。",
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

  const target = interaction.options.getUser("user", true);
  const store = loadGuildStore(guildId);
  const count = store.counts[target.id] ?? 0n;
  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  const displayName = member?.displayName ?? target.tag;

  await interaction.reply({
    content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
    allowedMentions: { parse: [] },
  });
}
