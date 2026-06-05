// src/commands/menu/types.ts
import { ButtonInteraction, ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";

export type GuildScopedInteraction = ChatInputCommandInteraction | ButtonInteraction;
export { MessageComponentInteraction };
