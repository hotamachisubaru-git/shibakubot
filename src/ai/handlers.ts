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
  type MainCharacterId,
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
import {
  buildConversationKey,
  buildReplyUserMessage,
  extractReplyTargetContent,
  isSnowflake,
  replyInChunks,
  replyToMessageInChunks,
} from "./discordUtils";
import {
  buildEffectiveSystemPrompt,
  extensionFromMimeType,
  isValidImageSizeInput,
  limitText,
  renderHistory,
  singleLine,
  truncateForPromptView,
} from "./textUtils";

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

type AiSlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

const AI_SLASH_HANDLERS: Readonly<Record<string, AiSlashHandler>> = {
  [SLASH_COMMAND.chat]: handleChatCommand,
  [SLASH_COMMAND.reply]: handleReplyCommand,
  [SLASH_COMMAND.regen]: handleRegenCommand,
  [SLASH_COMMAND.image]: handleImageCommand,
  [SLASH_COMMAND.history]: handleHistoryCommand,
  [SLASH_COMMAND.setPrompt]: handleSetPromptCommand,
  [SLASH_COMMAND.setCharacter]: handleSetCharacterCommand,
  [SLASH_COMMAND.chatReset]: handleChatResetCommand,
};

export function isAiSlashCommand(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(AI_SLASH_HANDLERS, name);
}

export function getAiSlashHandler(name: string): AiSlashHandler | undefined {
  return AI_SLASH_HANDLERS[name];
}

export async function handleAiSlashCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const handler = getAiSlashHandler(interaction.commandName);
  if (handler) {
    await handler(interaction);
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

    await publishGeneratedReply(
      interaction,
      targetMessage,
      generatedReply,
      isPrivate,
      "返信しました",
    );
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

  if (!isValidImageSizeInput(imageSize)) {
    await interaction.reply({
      content:
        "画像サイズは `幅x高さ` 形式で指定してください（例: `512x512`, `1024x1536`）。",
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
  const hadHistory = await applyConversationPersona(key, {
    prompt,
    characterId: null,
    resetHistory,
  });

  await interaction.deferReply({ ephemeral: isPrivate });

  const summaryLines = [
    "システムプロンプトを更新しました。",
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(prompt, 1600),
  ];

  appendHistoryCarryOverWarning(
    summaryLines,
    !resetHistory && hadHistory,
    "キャラを切り替える時は `/setprompt reset_history:true` または `/chat new_session:true` を推奨します。",
  );

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
  const hadHistory = await applyConversationPersona(key, {
    prompt: preset.prompt,
    characterId: preset.id,
    resetHistory,
  });

  await interaction.deferReply({ ephemeral: isPrivate });

  const summaryLines = [
    `キャラクターを「${preset.displayName}」に設定しました。`,
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(preset.prompt, 1600),
  ];

  appendHistoryCarryOverWarning(
    summaryLines,
    !resetHistory && hadHistory,
    "キャラを切り替える時は `/setcharacter reset_history:true` を推奨します。",
  );

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
  const payload = buildConversationPayload(
    currentPrompt,
    history,
    userMessage,
  );

  return modelClient.generateReply(payload);
}

function isStaleReplyStateError(error: unknown): boolean {
  return error instanceof Error && error.message === STALE_REPLY_STATE_ERROR;
}

function buildConversationPayload(
  currentPrompt: string,
  history: readonly ChatMessage[],
  userMessage: string,
): ChatMessage[] {
  return [
    { role: "system", content: buildEffectiveSystemPrompt(currentPrompt) },
    ...history,
    { role: "user", content: userMessage },
  ];
}

async function publishGeneratedReply(
  interaction: ChatInputCommandInteraction,
  targetMessage: Message,
  content: string,
  isPrivate: boolean,
  publicMessage: string,
): Promise<void> {
  const normalizedReply = limitText(content, aiConfig.maxResponseChars);
  if (isPrivate) {
    await replyInChunks(interaction, normalizedReply, true);
    return;
  }

  const postedMessage = await replyToMessageInChunks(
    targetMessage,
    normalizedReply,
  );
  await interaction.editReply(`${publicMessage}: ${postedMessage.url}`);
}

type ConversationPersonaUpdate = Readonly<{
  prompt: string;
  characterId: MainCharacterId | null;
  resetHistory: boolean;
}>;

async function applyConversationPersona(
  conversationKey: string,
  update: ConversationPersonaUpdate,
): Promise<boolean> {
  let hadHistory = false;

  await conversationStore.runExclusive(conversationKey, async () => {
    hadHistory = conversationStore.getHistory(conversationKey).length > 0;
    promptStore.setPrompt(conversationKey, update.prompt);
    if (update.characterId) {
      characterStore.setCharacter(conversationKey, update.characterId);
    } else {
      characterStore.resetCharacter(conversationKey);
    }
    replyStateStore.clear(conversationKey);
    if (update.resetHistory) {
      conversationStore.reset(conversationKey);
    }
  });

  return hadHistory;
}

function appendHistoryCarryOverWarning(
  lines: string[],
  shouldWarn: boolean,
  recommendation: string,
): void {
  if (!shouldWarn) {
    return;
  }

  lines.push(
    "",
    "注意: 既存履歴の口調が引き継がれて、キャラ設定の反映が弱くなる場合があります。",
    recommendation,
  );
}
