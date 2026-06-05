import { SETTING_KEYS } from "../constants/settings";
import { getGuildDbContext } from "./store";
import { getSetting, setSetting } from "./settings";

export type AiChatRole = "system" | "user" | "assistant";
export type AiChatMessage = {
  role: AiChatRole;
  content: string;
};
export type AiConversationTurn = {
  userMessage: string;
  assistantMessage: string;
};
export type AiReplyStateRecord = {
  targetMessageId: string;
  userMessage: string;
  quickReplyInput: string;
  lastAssistantMessage: string;
  isPrivate: boolean;
};
export type AiGuildMemoryRecord = {
  summary: string;
  updatedAt: number;
  sampledChannels: number;
  sampledMessages: number;
};

type AiSessionRow = {
  customPrompt: string | null;
  characterId: string | null;
};

type AiMessageRow = {
  id: number;
  role: string;
  content: string;
};

type AiReplyStateRow = {
  targetMessageId: string;
  userMessage: string;
  quickReplyInput: string;
  lastAssistantMessage: string;
  isPrivate: number;
};

function getAiSessionRow(
  gid: string,
  conversationKey: string,
): AiSessionRow | undefined {
  return getGuildDbContext(gid).statements.selectAiSession.get(conversationKey) as
    | AiSessionRow
    | undefined;
}

function saveAiSessionRow(
  gid: string,
  conversationKey: string,
  customPrompt: string | null,
  characterId: string | null,
): void {
  const context = getGuildDbContext(gid);
  if (customPrompt === null && characterId === null) {
    context.statements.deleteAiSession.run(conversationKey);
    return;
  }

  context.statements.upsertAiSession.run(
    conversationKey,
    customPrompt,
    characterId,
    Date.now(),
  );
}

function normalizeAiRole(role: string): AiChatRole | undefined {
  if (role === "system" || role === "user" || role === "assistant") {
    return role;
  }
  return undefined;
}

function getAiMessageCount(gid: string, conversationKey: string): number {
  const row = getGuildDbContext(gid).statements.countAiMessages.get(
    conversationKey,
  ) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function getAiConversationHistory(
  gid: string,
  conversationKey: string,
): AiChatMessage[] {
  const rows = getGuildDbContext(gid).statements.selectAiMessages.all(
    conversationKey,
  ) as AiMessageRow[];
  const messages: AiChatMessage[] = [];

  for (const row of rows) {
    const role = normalizeAiRole(row.role);
    if (!role) {
      continue;
    }
    messages.push({
      role,
      content: row.content,
    });
  }

  return messages;
}

export function appendAiConversationTurn(
  gid: string,
  conversationKey: string,
  userMessage: string,
  assistantMessage: string,
  maxMessages: number,
): void {
  const context = getGuildDbContext(gid);
  const safeMaxMessages = Math.max(2, Math.floor(maxMessages));

  context.db.transaction(() => {
    const now = Date.now();
    context.statements.insertAiMessage.run(
      conversationKey,
      "user",
      userMessage,
      now,
    );
    context.statements.insertAiMessage.run(
      conversationKey,
      "assistant",
      assistantMessage,
      now,
    );

    const overflow = getAiMessageCount(gid, conversationKey) - safeMaxMessages;
    if (overflow > 0) {
      context.statements.deleteOldestAiMessages.run(conversationKey, overflow);
    }
  })();
}

export function getAiConversationLastTurn(
  gid: string,
  conversationKey: string,
): AiConversationTurn | undefined {
  const rows = getGuildDbContext(gid).statements.selectAiMessagesDescLimited.all(
    conversationKey,
    2,
  ) as AiMessageRow[];
  if (rows.length < 2) {
    return undefined;
  }

  const [assistant, user] = rows;
  if (assistant.role !== "assistant" || user.role !== "user") {
    return undefined;
  }

  return {
    userMessage: user.content,
    assistantMessage: assistant.content,
  };
}

export function removeAiConversationLastTurn(
  gid: string,
  conversationKey: string,
): AiConversationTurn | undefined {
  const context = getGuildDbContext(gid);

  return context.db.transaction(() => {
    const rows = context.statements.selectAiMessagesDescLimited.all(
      conversationKey,
      2,
    ) as AiMessageRow[];
    if (rows.length < 2) {
      return undefined;
    }

    const [assistant, user] = rows;
    if (assistant.role !== "assistant" || user.role !== "user") {
      return undefined;
    }

    context.statements.deleteAiMessageById.run(assistant.id);
    context.statements.deleteAiMessageById.run(user.id);

    return {
      userMessage: user.content,
      assistantMessage: assistant.content,
    };
  })();
}

export function resetAiConversation(
  gid: string,
  conversationKey: string,
): void {
  getGuildDbContext(gid).statements.deleteAiMessagesByConversation.run(
    conversationKey,
  );
}

export function getAiCustomPrompt(
  gid: string,
  conversationKey: string,
): string | null {
  return getAiSessionRow(gid, conversationKey)?.customPrompt ?? null;
}

export function setAiCustomPrompt(
  gid: string,
  conversationKey: string,
  prompt: string | null,
): void {
  const current = getAiSessionRow(gid, conversationKey);
  saveAiSessionRow(
    gid,
    conversationKey,
    prompt,
    current?.characterId ?? null,
  );
}

export function getAiCharacter(
  gid: string,
  conversationKey: string,
): string | null {
  return getAiSessionRow(gid, conversationKey)?.characterId ?? null;
}

export function setAiCharacter(
  gid: string,
  conversationKey: string,
  characterId: string | null,
): void {
  const current = getAiSessionRow(gid, conversationKey);
  saveAiSessionRow(
    gid,
    conversationKey,
    current?.customPrompt ?? null,
    characterId,
  );
}

export function getAiReplyState(
  gid: string,
  conversationKey: string,
): AiReplyStateRecord | undefined {
  const row = getGuildDbContext(gid).statements.selectAiReplyState.get(
    conversationKey,
  ) as AiReplyStateRow | undefined;
  if (!row) {
    return undefined;
  }

  return {
    targetMessageId: row.targetMessageId,
    userMessage: row.userMessage,
    quickReplyInput: row.quickReplyInput,
    lastAssistantMessage: row.lastAssistantMessage,
    isPrivate: row.isPrivate !== 0,
  };
}

export function setAiReplyState(
  gid: string,
  conversationKey: string,
  state: AiReplyStateRecord,
): void {
  getGuildDbContext(gid).statements.upsertAiReplyState.run(
    conversationKey,
    state.targetMessageId,
    state.userMessage,
    state.quickReplyInput,
    state.lastAssistantMessage,
    state.isPrivate ? 1 : 0,
    Date.now(),
  );
}

export function clearAiReplyState(
  gid: string,
  conversationKey: string,
): void {
  getGuildDbContext(gid).statements.deleteAiReplyState.run(conversationKey);
}

export function getAiGuildMemory(
  gid: string,
): AiGuildMemoryRecord | undefined {
  const raw = getSetting(gid, SETTING_KEYS.aiGuildMemory);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiGuildMemoryRecord>;
    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.updatedAt !== "number" ||
      !Number.isFinite(parsed.updatedAt)
    ) {
      return undefined;
    }

    return {
      summary: parsed.summary,
      updatedAt: parsed.updatedAt,
      sampledChannels:
        typeof parsed.sampledChannels === "number" &&
        Number.isFinite(parsed.sampledChannels)
          ? Math.max(0, Math.floor(parsed.sampledChannels))
          : 0,
      sampledMessages:
        typeof parsed.sampledMessages === "number" &&
        Number.isFinite(parsed.sampledMessages)
          ? Math.max(0, Math.floor(parsed.sampledMessages))
          : 0,
    };
  } catch {
    return undefined;
  }
}

export function setAiGuildMemory(
  gid: string,
  memory: AiGuildMemoryRecord,
): void {
  setSetting(gid, SETTING_KEYS.aiGuildMemory, JSON.stringify(memory));
}

export function clearAiGuildMemory(gid: string): void {
  setSetting(gid, SETTING_KEYS.aiGuildMemory, null);
}
