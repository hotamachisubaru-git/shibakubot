import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

function formatMillis(value: number): string {
  return `${Math.max(0, Math.round(value))}ms`;
}

export async function handlePing(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const startedAt = Date.now();
  await interaction.reply({ content: "計測中...", ephemeral: true });
  const apiPing = Date.now() - startedAt;

  let wsPing = interaction.client.ws?.ping ?? -1;
  for (let waited = 0; wsPing < 0 && waited < 5000; waited += 200) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    wsPing = interaction.client.ws?.ping ?? -1;
  }

  const wsText = wsPing >= 0 ? formatMillis(wsPing) : "取得できませんでした";

  const embed = new EmbedBuilder()
    .setTitle("🏓 Pong")
    .setDescription(`API: **${formatMillis(apiPing)}**\nWS: **${wsText}**`)
    .setColor(0x00aaff)
    .setFooter({ text: `計測時刻: ${new Date().toLocaleString("ja-JP")}` });

  await interaction.editReply({ content: null, embeds: [embed] });
}
