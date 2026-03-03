import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";

const runtimeConfig = getRuntimeConfig();
const TARGET_GUILD_ID = runtimeConfig.discord.guildIds[0] ?? null;

export async function handleVs(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
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

  if (!TARGET_GUILD_ID || guildId !== TARGET_GUILD_ID) {
    await interaction.reply({
      content: "このコマンドは対象サーバーでのみ使用できます。",
      ephemeral: true,
    });
    return;
  }

  const question = interaction.options.getString("question", true).trim();
  const option1 = interaction.options.getString("option1", true).trim();
  const option2 = interaction.options.getString("option2", true).trim();

  if (option1 === option2) {
    await interaction.reply({
      content: "項目1と項目2は別の内容を指定してください。",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ ${question}`)
    .setDescription(`1️⃣ ${option1}\n2️⃣ ${option2}`)
    .setFooter({ text: `作成者: ${interaction.user.tag}` });

  const message = await interaction.reply({
    embeds: [embed],
    fetchReply: true,
  });

  try {
    await message.react("1️⃣");
    await message.react("2️⃣");
  } catch {
    await interaction.followUp({
      content:
        "⚠️ 投票は作成しましたが、リアクション追加に失敗しました。権限を確認してください。",
      ephemeral: true,
    });
  }
}
