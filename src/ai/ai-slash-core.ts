import type { ChatInputCommandInteraction } from "discord.js";
import { AI_SUBCOMMAND_HANDLERS, AI_SLASH_HANDLERS, AI_CHAT_RELATED_SUBCOMMANDS } from "./ai-slash-constants";
import { getAiChatEnabled } from "../data";

export async function handleAiCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  let subcommand: string;

  try {
    subcommand = interaction.options.getSubcommand();
  } catch {
    await interaction.reply({
      content: "使用するAI機能を選んでください。`/ai chat` などを使えます。",
      flags: "Ephemeral",
    });
    return;
  }

  const handler = AI_SUBCOMMAND_HANDLERS[subcommand];
  if (!handler) {
    await interaction.reply({
      content: `未対応のAIサブコマンドです: \`${subcommand}\``,
      flags: "Ephemeral",
    });
    return;
  }

  if (
    interaction.guildId &&
    AI_CHAT_RELATED_SUBCOMMANDS.has(subcommand) &&
    !getAiChatEnabled(interaction.guildId)
  ) {
    await interaction.reply({
      content:
        "AIチャット機能はこのサーバーで無効化されています。管理者にメニューの「AIチャット切替」で有効化してもらってください。",
      flags: "Ephemeral",
    });
    return;
  }

  await handler(interaction);
}
