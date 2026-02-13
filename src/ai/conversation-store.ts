import { ChatMessage } from './model-client';

export interface ConversationTurn {
  userMessage: string;
  assistantMessage: string;
}

export class ConversationStore {
  private readonly sessions = new Map<string, ChatMessage[]>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly maxMessages: number) {}

  getHistory(key: string): ChatMessage[] {
    const session = this.sessions.get(key);
    return session ? [...session] : [];
  }

  appendTurn(key: string, userMessage: string, assistantMessage: string): void {
    this.appendMessage(key, { role: 'user', content: userMessage });
    this.appendMessage(key, { role: 'assistant', content: assistantMessage });
  }

  getLastTurn(key: string): ConversationTurn | undefined {
    const session = this.sessions.get(key);
    if (!session || session.length < 2) {
      return undefined;
    }

    const user = session[session.length - 2];
    const assistant = session[session.length - 1];
    if (!user || !assistant || user.role !== 'user' || assistant.role !== 'assistant') {
      return undefined;
    }

    return {
      userMessage: user.content,
      assistantMessage: assistant.content
    };
  }

  removeLastTurn(key: string): ConversationTurn | undefined {
    const session = this.sessions.get(key);
    const lastTurn = this.getLastTurn(key);
    if (!session || !lastTurn) {
      return undefined;
    }

    session.splice(-2, 2);
    if (session.length === 0) {
      this.sessions.delete(key);
    } else {
      this.sessions.set(key, session);
    }

    return lastTurn;
  }

  reset(key: string): void {
    this.sessions.delete(key);
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

  private appendMessage(key: string, message: ChatMessage): void {
    const session = this.sessions.get(key) ?? [];
    session.push(message);

    while (session.length > this.maxMessages) {
      session.shift();
    }

    this.sessions.set(key, session);
  }
}
