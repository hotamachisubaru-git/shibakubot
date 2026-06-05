import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { isIgnoredUser } from "../data";
import { SLASH_COMMAND } from "../constants/commands";
import { CharacterStore } from "./character-store";
import { ConversationStore } from "./conversation-store";
import {
  getConversationModelClient,
  getImageClient,
} from "./clientFactory";
import {
  type ChatMessage,
  ModelRequestError,
} from "./model-client";
import { ApiRateLimitError } from "./rate-limit";
import { ReplyStateStore } from "./reply-state-store";
import { getGuildIdFromConversationKey } from "./session-key";
import {
  buildConversationKey,
  buildReplyUserMessage,
  extractReplyTargetContent,
  isSnowflake,
  replyInChunks,
  replyToMessageInChunks,
} from "./discordUtils";
import { buildEffectiveSystemPrompt, limitText } from "./textUtils";
import { getAiGuildMemory } from "../data";
import { PromptStore } from "./prompt-store";
import { getCharacterQuickReply, type MainCharacterId } from "./character-presets";

const aiConfig = getRuntimeConfig().ai;

export const conversationStore = new ConversationStore(
  Math.max(2, aiConfig.maxHistoryTurns * 2),
);

export const replyStateStore = new ReplyStateStore();

export const characterStore = new CharacterStore();

const defaultPromptStore = new PromptStore(aiConfig.systemPrompt);

export const promptStore = defaultPromptStore;

export const STALE_REPLY_STATE_ERROR = "STALE_REPLY_STATE";

export async function generateReplyForConversation(
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
  const guildMemorySummary =
    getAiGuildMemory(getGuildIdFromConversationKey(conversationKey))?.summary;
  const payload = buildConversationPayload(
    currentPrompt,
    guildMemorySummary,
    history,
    userMessage,
  );

  return getConversationModelClient(
    getGuildIdFromConversationKey(conversationKey),
  ).generateReply(payload);
}

export function buildConversationPayload(
  currentPrompt: string,
  guildMemorySummary: string | undefined,
  history: readonly ChatMessage[],
  userMessage: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: buildEffectiveSystemPrompt(currentPrompt, guildMemorySummary),
    },
    ...history,
    { role: "user", content: userMessage },
  ];
}

export async function publishGeneratedReply(
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

export function isStaleReplyStateError(error: unknown): boolean {
  return error instanceof Error && error.message === STALE_REPLY_STATE_ERROR;
}

export function buildModelErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiRateLimitError) {
    return error.message;
  }

  if (error instanceof ModelRequestError && error.statusCode === 429) {
    return "モデル API の利用枠を超過しました。しばらく待ってから再試行するか、ギルド別 API キー設定を含む課金・使用量を確認してください。";
  }

  return fallbackMessage;
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
