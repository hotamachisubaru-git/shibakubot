export interface ReplyState {
  targetMessageId: string;
  userMessage: string;
  quickReplyInput: string;
  lastAssistantMessage: string;
  isPrivate: boolean;
}

export class ReplyStateStore {
  private readonly states = new Map<string, ReplyState>();

  getState(key: string): ReplyState | undefined {
    const state = this.states.get(key);
    return state ? { ...state } : undefined;
  }

  setState(key: string, state: ReplyState): void {
    this.states.set(key, { ...state });
  }

  clear(key: string): void {
    this.states.delete(key);
  }
}
