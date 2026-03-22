import type {
  ChatInputCommandInteraction,
  Message,
} from "discord.js";
import { singleLine, splitForDiscord } from "./textUtils";

export function buildConversationKey(
  interaction: ChatInputCommandInteraction,
): string {
  const guildId = interaction.guildId ?? "dm";
  const channelId = interaction.channelId ?? "unknown-channel";
  const userId = interaction.user.id;
  return `${guildId}:${channelId}:${userId}`;
}

export async function replyInChunks(
  interaction: ChatInputCommandInteraction,
  content: string,
  isPrivate: boolean,
): Promise<void> {
  const chunks = splitForDiscord(content);
  await interaction.editReply(chunks[0]);

  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      content: chunk,
      flags: isPrivate ? "Ephemeral" : undefined,
    });
  }
}

export async function replyToMessageInChunks(
  targetMessage: Message,
  content: string,
): Promise<Message> {
  const chunks = splitForDiscord(content);
  let sentMessage = await targetMessage.reply({
    content: chunks[0],
    allowedMentions: { repliedUser: false },
  });
  const firstReply = sentMessage;

  for (const chunk of chunks.slice(1)) {
    sentMessage = await sentMessage.reply({
      content: chunk,
      allowedMentions: { repliedUser: false },
    });
  }

  return firstReply;
}

export function buildReplyUserMessage(
  targetMessage: Message,
  targetContent: string,
  instruction?: string,
): string {
  const lines = [
    "次の Discord メッセージに返信してください。",
    `返信先ユーザー: ${targetMessage.author.username}`,
    `返信先URL: ${targetMessage.url}`,
    "返信先メッセージ:",
    `\"\"\"${targetContent}\"\"\"`,
    instruction && instruction.length > 0 ? `追加指示: ${instruction}` : undefined,
    "出力は返信文のみ。前置きや解説は不要。",
  ].filter((line): line is string => typeof line === "string");

  return lines.join("\n");
}

export function extractReplyTargetContent(
  targetMessage: Message,
): string | undefined {
  const segments: string[] = [];
  const messageText = targetMessage.cleanContent.trim();
  if (messageText.length > 0) {
    segments.push(messageText);
  }

  if (targetMessage.attachments.size > 0) {
    const attachmentSummary = [...targetMessage.attachments.values()]
      .map((attachment) => attachment.name?.trim() || attachment.url)
      .join(", ");
    segments.push(`添付: ${attachmentSummary}`);
  }

  if (targetMessage.embeds.length > 0) {
    const embedSummary = targetMessage.embeds
      .map((embed) =>
        [embed.title, embed.description].filter(
          (value): value is string => typeof value === "string",
        ),
      )
      .map((values) =>
        values
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .join(" - "),
      )
      .filter((value) => value.length > 0)
      .join(" / ");
    if (embedSummary.length > 0) {
      segments.push(`埋め込み: ${singleLine(embedSummary, 300)}`);
    }
  }

  const merged = segments.join("\n").trim();
  return merged.length > 0 ? merged : undefined;
}

export function isSnowflake(value: string): boolean {
  return /^\d+$/.test(value);
}
