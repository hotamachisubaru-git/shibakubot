import { getAiGuildMemory } from "../data";
import { conversationStore } from "./chat-core";
import { getGuildIdFromConversationKey } from "./session-key";
import { getConversationModelClient } from "./clientFactory";
import { CharacterStore } from "./character-store";
import { PromptStore } from "./prompt-store";
import { getCharacterQuickReply } from "./character-presets";
import { buildEffectiveSystemPrompt } from "./textUtils";
import { type ChatMessage } from "./model-client";

const characterStore = new CharacterStore();
const promptStore = new PromptStore("");

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
