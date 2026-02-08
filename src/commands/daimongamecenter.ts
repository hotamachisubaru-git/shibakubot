import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

function resolveRoomPassword(interaction: ChatInputCommandInteraction): string {
  return (
    interaction.options.getString("pass") ??
    interaction.options.getString("password") ??
    ""
  ).trim();
}

export async function handleRoom(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  const game = interaction.options.getString("game", true);
  const area = interaction.options.getInteger("area", true);
  const password = resolveRoomPassword(interaction);

  if (!password) {
    await interaction.reply({
      content: "パスワードが未指定です。`pass` オプションを確認してください。",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎮 本日のルーム案内")
    .setDescription(
      `本日は**${game}**の**${area}**で、**${password}**で入れます。`,
    )
    .setFooter({ text: new Date().toLocaleString("ja-JP") });

  await interaction.reply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}
