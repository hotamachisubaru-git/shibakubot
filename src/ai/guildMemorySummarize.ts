import type { Guild } from "discord.js";
import { getAiGuildMemory, setAiGuildMemory } from "../data";
import { guildMemoryConfig, auxModelConfig } from "./guildMemoryConfig";
import { limitText } from "./textUtils";
import { getGuildMemoryAuxModelClient, getGuildMemoryFallbackModelClient, hasDistinctGuildMemoryFallbackModel } from "./clientFactory";
import { type ChatMessage, ModelRequestError } from "./model-client";

const refreshMs = guildMemoryConfig.refreshHours * 60 * 60 * 1000;
const minIntervalMs = guildMemoryConfig.liveMinIntervalMinutes * 60 * 1000;

export async function summarizeAndSaveGuildTranscript(
  guild: Guild,
  transcript: string,
): Promise<void> {
  const summary = await summarizeGuildTranscript(guild, transcript);
  const normalizedSummary = limitText(summary, guildMemoryConfig.maxSummaryChars);

  setAiGuildMemory(guild.id, {
    summary: normalizedSummary,
    updatedAt: Date.now(),
    sampledChannels: 0,
    sampledMessages: 0,
  });

  console.log(
    `[ai] guild memory summary guild=${guild.id} reason=manual\n${normalizedSummary}`,
  );
}

export function getGuildMemoryRefreshMs(): number {
  return refreshMs;
}

export function getGuildMemoryMinIntervalMs(): number {
  return minIntervalMs;
}

export function getExistingGuildMemory(guildId: string) {
  return getAiGuildMemory(guildId);
}

export function setExistingGuildMemory(guildId: string, data: ReturnType<typeof getAiGuildMemory> | undefined): void {
  if (data) {
    setAiGuildMemory(guildId, data);
  }
}

async function summarizeGuildTranscript(
  guild: Guild,
  transcript: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "あなたはDiscordサーバーの最近の会話ログから、そのサーバーの特徴メモを作るAIです。",
        "与えられたログだけを根拠に要約してください。推測しすぎないでください。",
        "ユーザー名の列挙や生ログの長い引用は避け、傾向だけを短くまとめてください。",
        "出力は日本語で、以下の5項目を簡潔にまとめてください。",
        "1. 雰囲気",
        "2. よく出る話題",
        "3. 言葉づかい・テンポ",
        "4. botが合わせると自然な振る舞い",
        "5. 注意点",
        `全体は ${guildMemoryConfig.maxSummaryChars} 文字以内を目安にしてください。`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `サーバー名: ${guild.name}`,
        "最近ログ:",
        '"""',
        transcript,
        '"""',
      ].join("\n"),
    },
  ];

  try {
    return await getGuildMemoryAuxModelClient(guild.id).generateReply(messages);
  } catch (error) {
    if (
      error instanceof ModelRequestError &&
      (error as ModelRequestError).statusCode === 404 &&
      hasDistinctGuildMemoryFallbackModel(guild.id)
    ) {
      console.warn(
        `[ai] guild memory aux model unavailable guild=${guild.id} auxModel=${auxModelConfig.modelName} fallbackModel=${(await import("./guildMemoryConfig")).guildMemoryConfig}`,
      );
      return await getGuildMemoryFallbackModelClient(guild.id).generateReply(messages);
    }
    throw error;
  }
}
