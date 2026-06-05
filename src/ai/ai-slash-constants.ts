import type { ChatInputCommandInteraction } from "discord.js";
import { handleAiCommand } from "./ai-slash-core";
import { handleChatCommand, handleReplyCommand, handleRegenCommand } from "./chat-handlers";
import { handleImageCommand, handleChatResetCommand, handleHistoryCommand, handleSetPromptCommand, handleSetCharacterCommand } from "./chat-commands";
import { SLASH_COMMAND } from "../constants/commands";

export const AI_CHAT_RELATED_SUBCOMMANDS: Readonly<Set<string>> = new Set([
  SLASH_COMMAND.chat,
  SLASH_COMMAND.reply,
  SLASH_COMMAND.regen,
  SLASH_COMMAND.image,
  SLASH_COMMAND.history,
  SLASH_COMMAND.setPrompt,
  SLASH_COMMAND.setCharacter,
  SLASH_COMMAND.chatReset,
]);

export const AI_SUBCOMMAND_HANDLERS: Readonly<Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>>> = {
  [SLASH_COMMAND.chat]: handleChatCommand,
  [SLASH_COMMAND.reply]: handleReplyCommand,
  [SLASH_COMMAND.regen]: handleRegenCommand,
  [SLASH_COMMAND.image]: handleImageCommand,
  [SLASH_COMMAND.history]: handleHistoryCommand,
  [SLASH_COMMAND.setPrompt]: handleSetPromptCommand,
  [SLASH_COMMAND.setCharacter]: handleSetCharacterCommand,
  [SLASH_COMMAND.chatReset]: handleChatResetCommand,
};

export const AI_SLASH_HANDLERS: Readonly<Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>>> = {
  [SLASH_COMMAND.ai]: handleAiCommand,
};
