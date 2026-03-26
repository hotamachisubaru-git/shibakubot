import { getAiCustomPrompt, setAiCustomPrompt } from "../data";
import { getGuildIdFromConversationKey } from "./session-key";

export class PromptStore {
  constructor(private readonly defaultPrompt: string) {}

  getPrompt(key: string): string {
    return (
      getAiCustomPrompt(getGuildIdFromConversationKey(key), key) ?? this.defaultPrompt
    );
  }

  setPrompt(key: string, prompt: string): void {
    setAiCustomPrompt(getGuildIdFromConversationKey(key), key, prompt);
  }

  resetPrompt(key: string): void {
    setAiCustomPrompt(getGuildIdFromConversationKey(key), key, null);
  }
}
