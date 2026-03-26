import { clearAiReplyState, getAiReplyState, setAiReplyState } from "../data";
import { getGuildIdFromConversationKey } from "./session-key";

export interface ReplyState {
  targetMessageId: string;
  userMessage: string;
  quickReplyInput: string;
  lastAssistantMessage: string;
  isPrivate: boolean;
}

export class ReplyStateStore {
  getState(key: string): ReplyState | undefined {
    return getAiReplyState(getGuildIdFromConversationKey(key), key);
  }

  setState(key: string, state: ReplyState): void {
    setAiReplyState(getGuildIdFromConversationKey(key), key, state);
  }

  clear(key: string): void {
    clearAiReplyState(getGuildIdFromConversationKey(key), key);
  }
}
