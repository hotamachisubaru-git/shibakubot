import { type ChatInputCommandInteraction } from "discord.js";
import { COMMON_MESSAGES } from "../../constants/messages";
import { getUserCount } from "../../data";
import { fetchGuildMemberOrNull } from "../../utils/discordErrors";

export async function handleCheck(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使用してください。",
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
  const count = getUserCount(guildId, target.id);
  const member = interaction.guild
    ? await fetchGuildMemberOrNull(interaction.guild, target.id).catch((error: unknown) => {
      console.warn("[check] failed to fetch display name; using user tag", {
        guildId, targetId: target.id,
      }, error);
      return null;
    })
    : null;
  const displayName = member?.displayName ?? target.tag;

  await interaction.reply({
    content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
    allowedMentions: { parse: [] },
  });
}
