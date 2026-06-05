import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { MessageComponentInteraction } from "discord.js";
import { showModalAndAwait } from "./common";
import { TARGET_GUILD_ID } from "./managementConstants";

export async function handleVoteAction(
  button: MessageComponentInteraction,
): Promise<boolean> {
  if (button.guildId !== TARGET_GUILD_ID) {
    await button.reply({
      content: "この機能は対象サーバーでのみ利用できます。",
      flags: "Ephemeral",
    });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId("vs_modal")
    .setTitle("2択投票を作成");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("question")
        .setLabel("質問")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("option1")
        .setLabel("項目1")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("option2")
        .setLabel("項目2")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80),
    ),
  );

  const submitted = await showModalAndAwait(button, modal);
  if (!submitted) return true;

  const question = submitted.fields.getTextInputValue("question").trim();
  const option1 = submitted.fields.getTextInputValue("option1").trim();
  const option2 = submitted.fields.getTextInputValue("option2").trim();

  if (option1 === option2) {
    await submitted.reply({
      content: "項目1と項目2は別の内容を指定してください。",
      flags: "Ephemeral",
    });
    return true;
  }

  const channelForPoll = submitted.channel;
  if (!channelForPoll || !("send" in channelForPoll)) {
    await submitted.reply({
      content: "投票の送信先チャンネルを取得できませんでした。",
      flags: "Ephemeral",
    });
    return true;
  }

  const pollEmbed = new EmbedBuilder()
    .setTitle(`🗳️ ${question}`)
    .setDescription(`1️⃣ ${option1}\n2️⃣ ${option2}`)
    .setFooter({ text: `作成者: ${submitted.user.tag}` });

  const pollMessage = await channelForPoll.send({
    embeds: [pollEmbed],
    allowedMentions: { parse: [] },
  });

  try {
    await pollMessage.react("1️⃣");
    await pollMessage.react("2️⃣");
  } catch {
    await submitted.reply({
      content:
        "⚠️ 投票は作成しましたが、リアクション追加に失敗しました。権限を確認してください。",
      flags: "Ephemeral",
    });
    return true;
  }

  await submitted.reply({
    content: "✅ 投票を作成しました。",
    flags: "Ephemeral",
  });
  return true;
}
