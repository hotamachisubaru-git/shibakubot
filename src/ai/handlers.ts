import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { SLASH_COMMAND } from "../constants/commands";
import {
  getCharacterQuickReply,
  getMainCharacterPreset,
} from "./character-presets";
import { CharacterStore } from "./character-store";
import { ConversationStore } from "./conversation-store";
import { SdxlImageClient } from "./image-client";
import {
  type ChatMessage,
  OllamaCompatibleClient,
} from "./model-client";
import { PromptStore } from "./prompt-store";
import { ReplyStateStore } from "./reply-state-store";

const aiConfig = getRuntimeConfig().ai;

const conversationStore = new ConversationStore(
  Math.max(2, aiConfig.maxHistoryTurns * 2),
);
const promptStore = new PromptStore(aiConfig.systemPrompt);
const characterStore = new CharacterStore();
const replyStateStore = new ReplyStateStore();
const modelClient = new OllamaCompatibleClient({
  endpoint: aiConfig.modelEndpoint,
  modelName: aiConfig.modelName,
  apiKey: aiConfig.modelApiKey,
  timeoutMs: aiConfig.modelTimeoutMs,
});
const imageClient = aiConfig.imageEndpoint
  ? new SdxlImageClient({
      endpoint: aiConfig.imageEndpoint,
      modelName: aiConfig.imageModel,
      apiKey: aiConfig.imageApiKey,
      timeoutMs: aiConfig.imageTimeoutMs,
      steps: aiConfig.imageSteps,
      cfgScale: aiConfig.imageCfgScale,
      samplerName: aiConfig.imageSamplerName,
      negativePrompt: aiConfig.imageNegativePrompt,
    })
  : undefined;

const STALE_REPLY_STATE_ERROR = "STALE_REPLY_STATE";
const AI_COMMAND_SET = new Set<string>([
  SLASH_COMMAND.chat,
  SLASH_COMMAND.reply,
  SLASH_COMMAND.regen,
  SLASH_COMMAND.image,
  SLASH_COMMAND.history,
  SLASH_COMMAND.setPrompt,
  SLASH_COMMAND.setCharacter,
  SLASH_COMMAND.chatReset,
]);

export function isAiSlashCommand(name: string): boolean {
  return AI_COMMAND_SET.has(name);
}

export async function handleAiSlashCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.commandName === SLASH_COMMAND.chat) {
    await handleChatCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.reply) {
    await handleReplyCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.regen) {
    await handleRegenCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.image) {
    await handleImageCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.history) {
    await handleHistoryCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.setPrompt) {
    await handleSetPromptCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.setCharacter) {
    await handleSetCharacterCommand(interaction);
    return;
  }

  if (interaction.commandName === SLASH_COMMAND.chatReset) {
    await handleChatResetCommand(interaction);
  }
}

async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userMessage = interaction.options.getString("message", true).trim();
  const startNewSession = interaction.options.getBoolean("new_session") ?? false;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (userMessage.length === 0) {
    await interaction.reply({
      content: "メッセージは空にできません。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: isPrivate });

  const conversationKey = buildConversationKey(interaction);

  try {
    await conversationStore.runExclusive(conversationKey, async () => {
      if (startNewSession) {
        conversationStore.reset(conversationKey);
      }
      replyStateStore.clear(conversationKey);

      const selectedCharacterId = characterStore.getCharacter(conversationKey);
      const quickReply = getCharacterQuickReply(selectedCharacterId, userMessage);
      if (quickReply) {
        conversationStore.appendTurn(conversationKey, userMessage, quickReply);
        await replyInChunks(interaction, quickReply, isPrivate);
        return;
      }

      const currentPrompt = promptStore.getPrompt(conversationKey);
      const history = conversationStore.getHistory(conversationKey);
      const payload: ChatMessage[] = [
        { role: "system", content: buildEffectiveSystemPrompt(currentPrompt) },
        ...history,
        { role: "user", content: userMessage },
      ];

      const modelReply = await modelClient.generateReply(payload);
      conversationStore.appendTurn(conversationKey, userMessage, modelReply);

      const normalizedReply = limitText(modelReply, aiConfig.maxResponseChars);
      await replyInChunks(interaction, normalizedReply, isPrivate);
    });
  } catch (error) {
    console.error("[chat] 失敗:", error);
    await interaction.editReply(
      "モデル応答の取得に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` を確認してください。",
    );
  }
}

async function handleReplyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const messageId = interaction.options.getString("message_id", true).trim();
  const instruction = interaction.options.getString("instruction")?.trim();
  const startNewSession = interaction.options.getBoolean("new_session") ?? false;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (!isSnowflake(messageId)) {
    await interaction.reply({
      content: "`message_id` は Discord メッセージ ID (数値) を指定してください。",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({
      content: "このチャンネルでは `/reply` を使用できません。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: isPrivate });

  let targetMessage: Message;
  try {
    targetMessage = await channel.messages.fetch(messageId);
  } catch (error) {
    console.error("[reply] メッセージ取得失敗:", error);
    await interaction.editReply("指定した `message_id` のメッセージを取得できませんでした。");
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

    const normalizedReply = limitText(generatedReply, aiConfig.maxResponseChars);
    if (isPrivate) {
      await replyInChunks(interaction, normalizedReply, true);
      return;
    }

    const postedMessage = await replyToMessageInChunks(targetMessage, normalizedReply);
    await interaction.editReply(`返信しました: ${postedMessage.url}`);
  } catch (error) {
    console.error("[reply] 失敗:", error);
    await interaction.editReply(
      "返信の作成に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` とチャンネル権限を確認してください。",
    );
  }
}

async function handleRegenCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const conversationKey = buildConversationKey(interaction);
  const savedState = replyStateStore.getState(conversationKey);
  if (!savedState) {
    await interaction.reply({
      content: "再生成できる返信がありません。先に `/reply` を実行してください。",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    await interaction.reply({
      content: "このチャンネルでは `/regen` を使用できません。",
      ephemeral: true,
    });
    return;
  }

  const isPrivate = interaction.options.getBoolean("private") ?? savedState.isPrivate;
  await interaction.deferReply({ ephemeral: isPrivate });

  let targetMessage: Message;
  try {
    targetMessage = await channel.messages.fetch(savedState.targetMessageId);
  } catch (error) {
    console.error("[regen] メッセージ取得失敗:", error);
    replyStateStore.clear(conversationKey);
    await interaction.editReply(
      "前回の返信先メッセージを取得できませんでした。もう一度 `/reply` を実行してください。",
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

    const normalizedReply = limitText(regeneratedReply, aiConfig.maxResponseChars);
    if (isPrivate) {
      await replyInChunks(interaction, normalizedReply, true);
      return;
    }

    const postedMessage = await replyToMessageInChunks(targetMessage, normalizedReply);
    await interaction.editReply(`再生成して返信しました: ${postedMessage.url}`);
  } catch (error) {
    if (isStaleReplyStateError(error)) {
      await interaction.editReply(
        "前回の `/reply` 以降に会話が進んだため再生成できません。返信対象を指定して `/reply` をやり直してください。",
      );
      return;
    }

    console.error("[regen] 失敗:", error);
    await interaction.editReply(
      "返信の再生成に失敗しました。`MODEL_ENDPOINT` / `MODEL_NAME` / `MODEL_API_KEY` とチャンネル権限を確認してください。",
    );
  }
}

async function handleImageCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const prompt = interaction.options.getString("prompt", true).trim();
  const requestedSize = interaction.options.getString("size");
  const imageSize = requestedSize ?? aiConfig.imageDefaultSize;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (prompt.length === 0) {
    await interaction.reply({
      content: "プロンプトは空にできません。",
      ephemeral: true,
    });
    return;
  }

  if (!imageClient) {
    await interaction.reply({
      content: "画像生成は未設定です。`IMAGE_ENDPOINT` を設定してください。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: isPrivate });

  try {
    const generated = await imageClient.generateImage({
      prompt,
      size: imageSize,
    });
    const attachment = new AttachmentBuilder(generated.bytes, {
      name: `generated.${extensionFromMimeType(generated.mimeType)}`,
    });

    const lines = [
      `プロンプト: ${singleLine(prompt, 220)}`,
      generated.revisedPrompt
        ? `補正後プロンプト: ${singleLine(generated.revisedPrompt, 220)}`
        : undefined,
      `サイズ: ${imageSize}`,
    ].filter((line): line is string => typeof line === "string");

    await interaction.editReply({
      content: lines.join("\n"),
      files: [attachment],
    });
  } catch (error) {
    console.error("[image] 失敗:", error);
    await interaction.editReply(
      "画像生成に失敗しました。`IMAGE_ENDPOINT` / `IMAGE_MODEL` / `IMAGE_API_KEY` / `IMAGE_STEPS` / `IMAGE_CFG_SCALE` / `IMAGE_SAMPLER_NAME` の設定を確認してください。",
    );
  }
}

async function handleChatResetCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const key = buildConversationKey(interaction);

  await conversationStore.runExclusive(key, async () => {
    conversationStore.reset(key);
    promptStore.resetPrompt(key);
    characterStore.resetCharacter(key);
    replyStateStore.clear(key);
  });

  await interaction.reply({
    content: "会話履歴とカスタムプロンプトをリセットしました。",
    ephemeral: true,
  });
}

async function handleHistoryCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const turns = interaction.options.getInteger("turns") ?? Math.min(10, aiConfig.maxHistoryTurns);
  const key = buildConversationKey(interaction);

  await interaction.deferReply({ ephemeral: isPrivate });

  const history = await conversationStore.runExclusive(key, async () =>
    conversationStore.getHistory(key),
  );
  if (history.length === 0) {
    await interaction.editReply(
      "表示できる会話履歴がありません。`/chat` を使って会話を開始してください。",
    );
    return;
  }

  const currentPrompt = promptStore.getPrompt(key);
  const historyText = renderHistory(history, turns, currentPrompt);
  await replyInChunks(interaction, historyText, isPrivate);
}

async function handleSetPromptCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const resetHistory = interaction.options.getBoolean("reset_history") ?? true;
  const prompt = interaction.options.getString("content", true).trim();

  if (prompt.length === 0) {
    await interaction.reply({
      content: "プロンプト内容は空にできません。",
      ephemeral: true,
    });
    return;
  }

  const key = buildConversationKey(interaction);
  let hadHistory = false;

  await conversationStore.runExclusive(key, async () => {
    hadHistory = conversationStore.getHistory(key).length > 0;
    promptStore.setPrompt(key, prompt);
    characterStore.resetCharacter(key);
    replyStateStore.clear(key);
    if (resetHistory) {
      conversationStore.reset(key);
    }
  });

  await interaction.deferReply({ ephemeral: isPrivate });

  const summaryLines = [
    "システムプロンプトを更新しました。",
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(prompt, 1600),
  ];

  if (!resetHistory && hadHistory) {
    summaryLines.push(
      "",
      "注意: 既存履歴の口調が引き継がれて、キャラ設定の反映が弱くなる場合があります。",
      "キャラを切り替える時は `/setprompt reset_history:true` または `/chat new_session:true` を推奨します。",
    );
  }

  await replyInChunks(interaction, summaryLines.join("\n"), isPrivate);
}

async function handleSetCharacterCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const characterId = interaction.options.getString("character", true);
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const resetHistory = interaction.options.getBoolean("reset_history") ?? true;

  const preset = getMainCharacterPreset(characterId);
  if (!preset) {
    await interaction.reply({
      content: "指定されたキャラクターは未対応です。",
      ephemeral: true,
    });
    return;
  }

  const key = buildConversationKey(interaction);
  let hadHistory = false;

  await conversationStore.runExclusive(key, async () => {
    hadHistory = conversationStore.getHistory(key).length > 0;
    promptStore.setPrompt(key, preset.prompt);
    characterStore.setCharacter(key, preset.id);
    replyStateStore.clear(key);
    if (resetHistory) {
      conversationStore.reset(key);
    }
  });

  await interaction.deferReply({ ephemeral: isPrivate });

  const summaryLines = [
    `キャラクターを「${preset.displayName}」に設定しました。`,
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(preset.prompt, 1600),
  ];

  if (!resetHistory && hadHistory) {
    summaryLines.push(
      "",
      "注意: 既存履歴の口調が引き継がれて、キャラ設定の反映が弱くなる場合があります。",
      "キャラを切り替える時は `/setcharacter reset_history:true` を推奨します。",
    );
  }

  await replyInChunks(interaction, summaryLines.join("\n"), isPrivate);
}

async function generateReplyForConversation(
  conversationKey: string,
  userMessage: string,
  quickReplyInput: string,
): Promise<string> {
  const selectedCharacterId = characterStore.getCharacter(conversationKey);
  const quickReply = getCharacterQuickReply(selectedCharacterId, quickReplyInput);
  if (quickReply) {
    return quickReply;
  }

  const currentPrompt = promptStore.getPrompt(conversationKey);
  const history = conversationStore.getHistory(conversationKey);
  const payload: ChatMessage[] = [
    { role: "system", content: buildEffectiveSystemPrompt(currentPrompt) },
    ...history,
    { role: "user", content: userMessage },
  ];

  return modelClient.generateReply(payload);
}

function isStaleReplyStateError(error: unknown): boolean {
  return error instanceof Error && error.message === STALE_REPLY_STATE_ERROR;
}

function buildConversationKey(interaction: ChatInputCommandInteraction): string {
  const guildId = interaction.guildId ?? "dm";
  const channelId = interaction.channelId ?? "unknown-channel";
  const userId = interaction.user.id;
  return `${guildId}:${channelId}:${userId}`;
}

async function replyInChunks(
  interaction: ChatInputCommandInteraction,
  content: string,
  isPrivate: boolean,
): Promise<void> {
  const chunks = splitForDiscord(content);
  await interaction.editReply(chunks[0]);

  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({
      content: chunk,
      ephemeral: isPrivate,
    });
  }
}

async function replyToMessageInChunks(
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

function buildReplyUserMessage(
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

function extractReplyTargetContent(targetMessage: Message): string | undefined {
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

function isSnowflake(value: string): boolean {
  return /^\d+$/.test(value);
}

function splitForDiscord(content: string, maxLength = 1900): string[] {
  const text = content.trim();
  if (!text) {
    return ["（応答が空でした）"];
  }

  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const splitPoint = findSplitPoint(candidate);
    const chunk = remaining.slice(0, splitPoint).trim();

    chunks.push(chunk.length > 0 ? chunk : candidate);
    remaining = remaining.slice(splitPoint).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function findSplitPoint(text: string): number {
  const minSplitIndex = Math.floor(text.length * 0.6);
  const separators = ["\n\n", "\n", " "];

  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index >= minSplitIndex) {
      return index + separator.length;
    }
  }

  return text.length;
}

function limitText(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars)}\n\n[...省略: MAX_RESPONSE_CHARS を超過しました...]`;
}

function buildEffectiveSystemPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim();
  return [
    "あなたはロールプレイ会話を行うAIアシスタントです。",
    "以下の「キャラクター設定」を最優先で守って回答してください。",
    "口調・語尾・性格・テンションを毎回一貫させてください。",
    "説明的な回答でも、話し方は必ずキャラクター設定に合わせてください。",
    "不明な情報は捏造せず、キャラクター口調のまま「分からない」と伝えてください。",
    "",
    "キャラクター設定:",
    trimmedPrompt,
  ].join("\n");
}

function renderHistory(
  history: readonly ChatMessage[],
  turns: number,
  currentPrompt: string,
): string {
  const safeTurns = Math.max(1, turns);
  const maxMessages = safeTurns * 2;
  const slicedHistory = history.slice(-maxMessages);

  const lines: string[] = [];
  for (const [index, message] of slicedHistory.entries()) {
    const role = roleLabel(message.role);
    const preview = singleLine(message.content, 220);
    lines.push(`${index + 1}. [${role}] ${preview}`);
  }

  const shownTurns = Math.ceil(slicedHistory.length / 2);
  const totalTurns = Math.ceil(history.length / 2);

  return [
    `会話履歴 (${shownTurns}/${totalTurns} ターン)`,
    `現在のシステムプロンプト: ${singleLine(currentPrompt, 180)}`,
    "",
    ...lines,
  ].join("\n");
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") {
    return "ユーザー";
  }
  if (role === "assistant") {
    return "アシスタント";
  }
  return "システム";
}

function singleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function truncateForPromptView(prompt: string, maxLength: number): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) {
    return "png";
  }
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return "jpg";
  }
  if (normalized.includes("webp")) {
    return "webp";
  }
  return "bin";
}
