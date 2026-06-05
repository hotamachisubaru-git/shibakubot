import type { ChatInputCommandInteraction } from "discord.js";
import { AI_SUBCOMMAND_HANDLERS, AI_SLASH_HANDLERS, AI_CHAT_RELATED_SUBCOMMANDS } from "./ai-slash-constants";
import { getAiChatEnabled } from "../data";

export function getAiSlashHandler(name: string) {
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

export function isAiSlashCommand(name: string): boolean {
  return name in AI_SLASH_HANDLERS;
}

export { AI_SUBCOMMAND_HANDLERS, AI_SLASH_HANDLERS, AI_CHAT_RELATED_SUBCOMMANDS };
