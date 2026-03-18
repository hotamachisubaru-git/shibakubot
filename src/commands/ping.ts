import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { EMBED_COLORS } from "../constants/embedColors";

function formatMillis(value: number): string {
  return `${Math.max(0, Math.round(value))}ms`;
}

async function waitForWsPing(
  interaction: ChatInputCommandInteraction,
): Promise<number> {
  let wsPing = interaction.client.ws?.ping ?? -1;

  for (let waited = 0; wsPing < 0 && waited < 5000; waited += 200) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    wsPing = interaction.client.ws?.ping ?? -1;
  }

  return wsPing;
}

export async function handlePing(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const interactionLatency = Date.now() - interaction.createdTimestamp;

  const deferStartedAt = Date.now();
  await interaction.deferReply({ ephemeral: true });
  const replyLatency = Date.now() - deferStartedAt;

  const wsPing = await waitForWsPing(interaction);
  const wsText = wsPing >= 0 ? formatMillis(wsPing) : "取得できませんでした";

  const embed = new EmbedBuilder()
    .setTitle("🏓 Pong")
    .setDescription(
      [
        `Interaction: **${formatMillis(interactionLatency)}**`,
        `Reply: **${formatMillis(replyLatency)}**`,
        `WS: **${wsText}**`,
      ].join("\n"),
    )
    .setColor(EMBED_COLORS.info)
    .setFooter({ text: `計測時刻: ${new Date().toLocaleString("ja-JP")}` });

  await interaction.editReply({ embeds: [embed] });
}