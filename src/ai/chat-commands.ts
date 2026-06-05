import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { SLASH_COMMAND } from "../constants/commands";
import { getCharacterQuickReply, getMainCharacterPreset, type MainCharacterId } from "./character-presets";
import { CharacterStore } from "./character-store";
import { PromptStore } from "./prompt-store";
import { conversationStore, replyStateStore } from "./chat-core";
import { buildConversationKey } from "./discordUtils";
import { buildEffectiveSystemPrompt, extensionFromMimeType, isValidImageSizeInput, limitText, renderHistory, singleLine, truncateForPromptView } from "./textUtils";
import { getImageClient } from "./clientFactory";
import { ApiRateLimitError } from "./rate-limit";
import { generateReplyForConversation } from "./conversation-core";
import { replyInChunks } from "./discordUtils";

const aiConfig = getRuntimeConfig().ai;
const characterStore = new CharacterStore();
const promptStore = new PromptStore(aiConfig.systemPrompt);

export async function handleImageCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const prompt = interaction.options.getString("prompt", true).trim();
  const requestedSize = interaction.options.getString("size");
  const imageSize = requestedSize ?? aiConfig.imageDefaultSize;
  const isPrivate = interaction.options.getBoolean("private") ?? false;

  if (prompt.length === 0) {
    await interaction.reply({
      content: "プロンプトは空にできません。",
      flags: "Ephemeral",
    });
    return;
  }

  const imageClient = getImageClient(interaction.guildId ?? "dm");
  if (!imageClient) {
    await interaction.reply({
      content: "画像生成は未設定です。`IMAGE_ENDPOINT` を設定してください。",
      flags: "Ephemeral",
    });
    return;
  }

  if (!isValidImageSizeInput(imageSize)) {
    await interaction.reply({
      content: "画像サイズは `幅x高さ` 形式で指定してください（例: `512x512`, `1024x1536`）。",
      flags: "Ephemeral",
    });
    return;
  }

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  try {
    const generated = await imageClient.generateImage({
      prompt,
      size: imageSize,
    });
    const attachment = new AttachmentBuilder(generated.bytes, {
      name: `generated.${extensionFromMimeType(generated.mimeType)}`,
    });

    const lines = [
      `プロンプト: ${singleLine(prompt, 220)}`,
      generated.revisedPrompt
        ? `補正後プロンプト: ${singleLine(generated.revisedPrompt, 220)}`
        : undefined,
      `サイズ: ${imageSize}`,
    ].filter((line): line is string => typeof line === "string");

    await interaction.editReply({
      content: lines.join("\n"),
      files: [attachment],
    });
  } catch (error) {
    console.error("[image] 失敗:", error);
    await interaction.editReply(
      error instanceof ApiRateLimitError
        ? error.message
        : "画像生成に失敗しました。`IMAGE_ENDPOINT` / `IMAGE_MODEL` / `IMAGE_API_KEY` / `IMAGE_API_KEY_BY_GUILD` / `IMAGE_STEPS` / `IMAGE_CFG_SCALE` / `IMAGE_SAMPLER_NAME` の設定を確認してください。",
    );
  }
}

export async function handleChatResetCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const key = buildConversationKey(interaction);

  await conversationStore.runExclusive(key, async () => {
    conversationStore.reset(key);
    promptStore.resetPrompt(key);
    characterStore.resetCharacter(key);
    replyStateStore.clear(key);
  });

  await interaction.reply({
    content: "会話履歴とカスタムプロンプトをリセットしました。",
    flags: "Ephemeral",
  });
}

export async function handleHistoryCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const turns = interaction.options.getInteger("turns") ?? Math.min(10, aiConfig.maxHistoryTurns);
  const key = buildConversationKey(interaction);

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  const history = await conversationStore.runExclusive(key, async () =>
    conversationStore.getHistory(key),
  );
  if (history.length === 0) {
    await interaction.editReply(
      "表示できる会話履歴がありません。`/ai chat` を使って会話を開始してください。",
    );
    return;
  }

  const currentPrompt = promptStore.getPrompt(key);
  const historyText = renderHistory(history, turns, currentPrompt);
  await replyInChunks(interaction, historyText, isPrivate);
}

export async function handleSetPromptCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const resetHistory = interaction.options.getBoolean("reset_history") ?? true;
  const prompt = interaction.options.getString("content", true).trim();

  if (prompt.length === 0) {
    await interaction.reply({
      content: "プロンプト内容は空にできません。",
      flags: "Ephemeral",
    });
    return;
  }

  const key = buildConversationKey(interaction);
  const hadHistory = await applyConversationPersona(key, {
    prompt,
    characterId: null,
    resetHistory,
  });

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  const summaryLines = [
    "システムプロンプトを更新しました。",
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(prompt, 1600),
  ];

  appendHistoryCarryOverWarning(
    summaryLines,
    !resetHistory && hadHistory,
    "キャラを切り替える時は `/ai setprompt reset_history:true` または `/ai chat new_session:true` を推奨します。",
  );

  await replyInChunks(interaction, summaryLines.join("\n"), isPrivate);
}

export async function handleSetCharacterCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const characterId = interaction.options.getString("character", true);
  const isPrivate = interaction.options.getBoolean("private") ?? true;
  const resetHistory = interaction.options.getBoolean("reset_history") ?? true;

  const preset = getMainCharacterPreset(characterId);
  if (!preset) {
    await interaction.reply({
      content: "指定されたキャラクターは未対応です。",
      flags: "Ephemeral",
    });
    return;
  }

  const key = buildConversationKey(interaction);
  const hadHistory = await applyConversationPersona(key, {
    prompt: preset.prompt,
    characterId: preset.id,
    resetHistory,
  });

  await interaction.deferReply({ flags: isPrivate ? "Ephemeral" : undefined });

  const summaryLines = [
    `キャラクターを「${preset.displayName}」に設定しました。`,
    resetHistory ? "会話履歴もリセットしました。" : "会話履歴は維持されています。",
    "",
    "現在のプロンプト:",
    truncateForPromptView(preset.prompt, 1600),
  ];

  appendHistoryCarryOverWarning(
    summaryLines,
    !resetHistory && hadHistory,
    "キャラを切り替える時は `/ai setcharacter reset_history:true` を推奨します。",
  );

  await replyInChunks(interaction, summaryLines.join("\n"), isPrivate);
}

async function applyConversationPersona(
  conversationKey: string,
  update: Readonly<{
    prompt: string;
    characterId: MainCharacterId | null;
    resetHistory: boolean;
  }>,
): Promise<boolean> {
  let hadHistory = false;

  await conversationStore.runExclusive(conversationKey, async () => {
    hadHistory = conversationStore.getHistory(conversationKey).length > 0;
    promptStore.setPrompt(conversationKey, update.prompt);
    if (update.characterId) {
      characterStore.setCharacter(conversationKey, update.characterId);
    } else {
      characterStore.resetCharacter(conversationKey);
    }
    replyStateStore.clear(conversationKey);
    if (update.resetHistory) {
      conversationStore.reset(conversationKey);
    }
  });

  return hadHistory;
}

function appendHistoryCarryOverWarning(
  lines: string[],
  shouldWarn: boolean,
  recommendation: string,
): void {
  if (!shouldWarn) {
    return;
  }

  lines.push(
    "",
    "注意: 既存履歴の口調が引き継がれて、キャラ設定の反映が弱くなる場合があります。",
    recommendation,
  );
}
