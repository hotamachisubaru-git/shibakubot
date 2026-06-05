import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { isIgnoredUser } from "../data";
import {
  buildConversationKey,
  buildReplyUserMessage,
  extractReplyTargetContent,
  isSnowflake,
  replyInChunks,
  replyToMessageInChunks,
} from "./discordUtils";
import {
  conversationStore,
  replyStateStore,
  generateReplyForConversation,
  publishGeneratedReply,
  buildModelErrorMessage,
  STALE_REPLY_STATE_ERROR,
  isStaleReplyStateError,
} from "./chat-core";
import { limitText } from "./textUtils";

const aiConfig = getRuntimeConfig().ai;

export async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userMessage = interaction.options.getString("message", true).trim();
  const startNewSession = interaction.options.getBoolean("new_session") ?? false;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (userMessage.length === 0) {
    await interaction.reply({
      content: "メッセージは空にできません。",
      flags: "Ephemeral",
    });
    return;
  }

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  const conversationKey = buildConversationKey(interaction);

  try {
    await conversationStore.runExclusive(conversationKey, async () => {
      if (startNewSession) {
        conversationStore.reset(conversationKey);
      }
      replyStateStore.clear(conversationKey);

      const modelReply = await generateReplyForConversation(
        conversationKey,
        userMessage,
        userMessage,
      );
      conversationStore.appendTurn(conversationKey, userMessage, modelReply);

      const normalizedReply = limitText(modelReply, aiConfig.maxResponseChars);
      await replyInChunks(interaction, normalizedReply, isPrivate);
    });
  } catch (error) {
    console.error("[chat] 失敗:", error);
    await interaction.editReply(buildModelErrorMessage(
      error,
      "モデル応答の取得に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` / `MODEL_API_KEY_BY_GUILD` を確認してください。",
    ));
  }
}

export async function handleReplyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const messageId = interaction.options.getString("message_id", true).trim();
  const instruction = interaction.options.getString("instruction")?.trim();
  const startNewSession = interaction.options.getBoolean("new_session") ?? false;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (!isSnowflake(messageId)) {
    await interaction.reply({
      content: "`message_id` は Discord メッセージ ID (数値) を指定してください。",
      flags: "Ephemeral",
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({
      content: "このチャンネルでは `/ai reply` を使用できません。",
      flags: "Ephemeral",
    });
    return;
  }

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  let targetMessage: Message;
  try {
    targetMessage = await channel.messages.fetch(messageId);
  } catch (error) {
    console.error("[reply] メッセージ取得失敗:", error);
    await interaction.editReply("指定した `message_id` のメッセージを取得できませんでした。");
    return;
  }

  if (
    interaction.guildId &&
    isIgnoredUser(interaction.guildId, targetMessage.author.id)
  ) {
    await interaction.editReply(
      "返信先メッセージの投稿者は ignore 対象のため、`/ai reply` を実行できません。",
    );
    return;
  }

  const targetContent = extractReplyTargetContent(targetMessage);
  if (!targetContent) {
    await interaction.editReply("返信先メッセージの内容を読み取れませんでした。");
    return;
  }

  const conversationKey = buildConversationKey(interaction);
  const userMessage = buildReplyUserMessage(targetMessage, targetContent, instruction);
  const quickReplyInput = instruction
    ? `${targetContent}\n${instruction}`
    : targetContent;
  let generatedReply = "";

  try {
    await conversationStore.runExclusive(conversationKey, async () => {
      if (startNewSession) {
        conversationStore.reset(conversationKey);
      }

      generatedReply = await generateReplyForConversation(
        conversationKey,
        userMessage,
        quickReplyInput,
      );
      conversationStore.appendTurn(conversationKey, userMessage, generatedReply);
      replyStateStore.setState(conversationKey, {
        targetMessageId: targetMessage.id,
        userMessage,
        quickReplyInput,
        lastAssistantMessage: generatedReply,
        isPrivate,
      });
    });

    await publishGeneratedReply(
      interaction,
      targetMessage,
      generatedReply,
      isPrivate,
      "返信しました",
    );
  } catch (error) {
    console.error("[reply] 失敗:", error);
    await interaction.editReply(buildModelErrorMessage(
      error,
      "返信の作成に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` / `MODEL_API_KEY_BY_GUILD` とチャンネル権限を確認してください。",
    ));
  }
}

export async function handleRegenCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const conversationKey = buildConversationKey(interaction);
  const savedState = replyStateStore.getState(conversationKey);
  if (!savedState) {
    await interaction.reply({
      content: "再生成できる返信がありません。先に `/ai reply` を実行してください。",
      flags: "Ephemeral",
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({
      content: "このチャンネルでは `/ai regen` を使用できません。",
      flags: "Ephemeral",
    });
    return;
  }

  const isPrivate = interaction.options.getBoolean("private") ?? savedState.isPrivate;
  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  let targetMessage: Message;
  try {
    targetMessage = await channel.messages.fetch(savedState.targetMessageId);
  } catch (error) {
    console.error("[regen] メッセージ取得失敗:", error);
    replyStateStore.clear(conversationKey);
    await interaction.editReply(
      "前回の返信先メッセージを取得できませんでした。もう一度 `/ai reply` を実行してください。",
    );
    return;
  }

  if (
    interaction.guildId &&
    isIgnoredUser(interaction.guildId, targetMessage.author.id)
  ) {
    await interaction.editReply(
      "返信先メッセージの投稿者は ignore 対象のため、`/ai regen` を実行できません。",
    );
    return;
  }

  let regeneratedReply = "";

  try {
    await conversationStore.runExclusive(conversationKey, async () => {
      const latestState = replyStateStore.getState(conversationKey);
      if (!latestState) {
        throw new Error(STALE_REPLY_STATE_ERROR);
      }

      const lastTurn = conversationStore.getLastTurn(conversationKey);
      const canReplaceLastTurn =
        lastTurn &&
        lastTurn.userMessage === latestState.userMessage &&
        lastTurn.assistantMessage === latestState.lastAssistantMessage;

      if (!canReplaceLastTurn) {
        throw new Error(STALE_REPLY_STATE_ERROR);
      }

      conversationStore.removeLastTurn(conversationKey);
      regeneratedReply = await generateReplyForConversation(
        conversationKey,
        latestState.userMessage,
        latestState.quickReplyInput,
      );
      conversationStore.appendTurn(
        conversationKey,
        latestState.userMessage,
        regeneratedReply,
      );
      replyStateStore.setState(conversationKey, {
        ...latestState,
        lastAssistantMessage: regeneratedReply,
        isPrivate,
      });
    });

    await publishGeneratedReply(
      interaction,
      targetMessage,
      regeneratedReply,
      isPrivate,
      "再生成して返信しました",
    );
  } catch (error) {
    if (isStaleReplyStateError(error)) {
      await interaction.editReply(
        "前回の `/ai reply` 以降に会話が進んだため再生成できません。返信対象を指定して `/ai reply` をやり直してください。",
      );
      return;
    }

    console.error("[regen] 失敗:", error);
    await interaction.editReply(buildModelErrorMessage(
      error,
      "返信の再生成に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` / `MODEL_API_KEY_BY_GUILD` とチャンネル権限を確認してください。",
    ));
  }
}
