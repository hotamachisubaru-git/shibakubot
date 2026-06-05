import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { EMBED_COLORS } from "../constants/embedColors";

function formatMillis(value: number): string {
  return `${Math.max(0, Math.round(value))}ms`;
}

export async function handlePing(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const interactionLatency = Date.now() - interaction.createdTimestamp;

  const deferStartedAt = Date.now();
  await interaction.deferReply({ flags: "Ephemeral" });
  const replyLatency = Date.now() - deferStartedAt;

  const wsPing = interaction.client.ws?.ping ?? -1;
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
