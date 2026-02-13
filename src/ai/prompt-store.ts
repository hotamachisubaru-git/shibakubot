export class PromptStore {
  private readonly prompts = new Map<string, string>();

  constructor(private readonly defaultPrompt: string) {}

  getPrompt(key: string): string {
    return this.prompts.get(key) ?? this.defaultPrompt;
  }

  setPrompt(key: string, prompt: string): void {
    this.prompts.set(key, prompt);
  }

  resetPrompt(key: string): void {
    this.prompts.delete(key);
  }
}
