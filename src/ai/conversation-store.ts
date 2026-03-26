import {
  appendAiConversationTurn,
  getAiConversationHistory,
  getAiConversationLastTurn,
  removeAiConversationLastTurn,
  resetAiConversation,
} from "../data";
import { getGuildIdFromConversationKey } from "./session-key";
import { ChatMessage } from './model-client';

export interface ConversationTurn {
  userMessage: string;
  assistantMessage: string;
}

export class ConversationStore {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly maxMessages: number) {}

  getHistory(key: string): ChatMessage[] {
    return getAiConversationHistory(getGuildIdFromConversationKey(key), key);
  }

  appendTurn(key: string, userMessage: string, assistantMessage: string): void {
    appendAiConversationTurn(
      getGuildIdFromConversationKey(key),
      key,
      userMessage,
      assistantMessage,
      this.maxMessages,
    );
  }

  getLastTurn(key: string): ConversationTurn | undefined {
    return getAiConversationLastTurn(getGuildIdFromConversationKey(key), key);
  }

  removeLastTurn(key: string): ConversationTurn | undefined {
    return removeAiConversationLastTurn(getGuildIdFromConversationKey(key), key);
  }

  reset(key: string): void {
    resetAiConversation(getGuildIdFromConversationKey(key), key);
  }

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previousLock = this.locks.get(key) ?? Promise.resolve();
    let releaseLock: () => void = () => undefined;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.locks.set(key, currentLock);
    await previousLock;

    try {
      return await task();
    } finally {
      releaseLock();
      if (this.locks.get(key) === currentLock) {
        this.locks.delete(key);
      }
    }
  }
}
