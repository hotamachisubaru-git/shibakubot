import type { Collection, Guild, GuildBasedChannel, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { getAiGuildMemory, getIgnoredUserList, setAiGuildMemory } from "../data";
import {
  getGuildMemoryAuxModelClient,
  getGuildMemoryFallbackModelClient,
  hasDistinctGuildMemoryFallbackModel,
} from "./clientFactory";
import {
  type ChatMessage,
  ModelRequestError,
} from "./model-client";
import { limitText, singleLine } from "./textUtils";

const aiConfig = getRuntimeConfig().ai;
const guildMemoryConfig = aiConfig.guildMemory;
const auxModelConfig = aiConfig.auxModel;

type ReadableGuildTextChannel = GuildBasedChannel & {
  name: string;
  lastMessageId?: string | null;
  messages: {
    fetch(options: { limit: number }): Promise<Collection<string, Message>>;
  };
};

type SampledGuildTranscript = Readonly<{
  transcript: string;
  sampledChannels: number;
  sampledMessages: number;
}>;

const pendingLiveRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const liveMessageCounts = new Map<string, number>();
const activeRefreshGuilds = new Set<string>();

export async function refreshGuildMemoriesOnStartup(
  guilds: Iterable<Guild>,
): Promise<void> {
  if (!guildMemoryConfig.enabled) {
    return;
  }

  for (const guild of guilds) {
    try {
      await refreshGuildMemory(guild, { force: false, reason: "startup" });
    } catch (error) {
      console.error(`[ai] guild memory refresh failed guild=${guild.id}`, error);
    }
  }
}

export function notifyGuildMessage(message: Message): void {
  if (!guildMemoryConfig.enabled || !guildMemoryConfig.liveEnabled) {
    return;
  }

  if (!message.inGuild() || message.author.bot) {
    return;
  }

  const content = message.cleanContent.replace(/\s+/g, " ").trim();
  if (content.length === 0) {
    return;
  }

  const nextCount = (liveMessageCounts.get(message.guild.id) ?? 0) + 1;
  liveMessageCounts.set(message.guild.id, nextCount);

  if (nextCount < guildMemoryConfig.liveMessageThreshold) {
    return;
  }

  scheduleLiveGuildRefresh(message.guild, guildMemoryConfig.liveDebounceMs);
}

function scheduleLiveGuildRefresh(guild: Guild, delayMs: number): void {
  const existingTimer = pendingLiveRefreshTimers.get(guild.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    pendingLiveRefreshTimers.delete(guild.id);
    void refreshGuildMemoryFromLiveMessages(guild);
  }, delayMs);

  pendingLiveRefreshTimers.set(guild.id, timer);
}

async function refreshGuildMemoryFromLiveMessages(guild: Guild): Promise<void> {
  if (activeRefreshGuilds.has(guild.id)) {
    return;
  }

  const pendingMessages = liveMessageCounts.get(guild.id) ?? 0;
  if (pendingMessages < guildMemoryConfig.liveMessageThreshold) {
    return;
  }

  const existing = getAiGuildMemory(guild.id);
  const minIntervalMs =
    guildMemoryConfig.liveMinIntervalMinutes * 60 * 1000;
  if (existing) {
    const elapsedMs = Date.now() - existing.updatedAt;
    if (elapsedMs < minIntervalMs) {
      scheduleLiveGuildRefresh(guild, minIntervalMs - elapsedMs);
      return;
    }
  }

  liveMessageCounts.set(guild.id, 0);

  try {
    await refreshGuildMemory(guild, { force: true, reason: "live" });
  } catch (error) {
    liveMessageCounts.set(
      guild.id,
      Math.max(
        liveMessageCounts.get(guild.id) ?? 0,
        guildMemoryConfig.liveMessageThreshold,
      ),
    );
    console.error(`[ai] guild memory live refresh failed guild=${guild.id}`, error);
  }
}

async function refreshGuildMemory(
  guild: Guild,
  options: Readonly<{ force: boolean; reason: "startup" | "live" }>,
): Promise<void> {
  if (activeRefreshGuilds.has(guild.id)) {
    return;
  }

  activeRefreshGuilds.add(guild.id);

  try {
    const existing = getAiGuildMemory(guild.id);
    const refreshMs = guildMemoryConfig.refreshHours * 60 * 60 * 1000;
    if (!options.force && existing && Date.now() - existing.updatedAt < refreshMs) {
      return;
    }

    const sampled = await collectGuildTranscript(guild);
    if (sampled.sampledMessages === 0 || sampled.transcript.trim().length === 0) {
      console.log(`[ai] guild memory skipped guild=${guild.id} reason=no_messages`);
      return;
    }

    const summary = await summarizeGuildTranscript(guild, sampled.transcript);
    const normalizedSummary = limitText(
      summary,
      guildMemoryConfig.maxSummaryChars,
    );

    setAiGuildMemory(guild.id, {
      summary: normalizedSummary,
      updatedAt: Date.now(),
      sampledChannels: sampled.sampledChannels,
      sampledMessages: sampled.sampledMessages,
    });

    console.log(
      `[ai] guild memory summary guild=${guild.id} reason=${options.reason}\n${normalizedSummary}`,
    );
    console.log(
      `[ai] guild memory refreshed guild=${guild.id} reason=${options.reason} channels=${sampled.sampledChannels} messages=${sampled.sampledMessages}`,
    );
  } finally {
    activeRefreshGuilds.delete(guild.id);
  }
}

async function collectGuildTranscript(guild: Guild): Promise<SampledGuildTranscript> {
  await guild.channels.fetch();

  const channels = [...guild.channels.cache.values()]
    .filter(isReadableGuildTextChannel)
    .filter((channel) => canReadChannel(guild, channel))
    .sort(compareChannelsByRecentActivity)
    .slice(0, guildMemoryConfig.channelLimit);

  const lines: string[] = [];
  let totalChars = 0;
  let sampledChannels = 0;
  let sampledMessages = 0;
  const ignoredUserIds = new Set(getIgnoredUserList(guild.id));

  for (const channel of channels) {
    if (totalChars >= guildMemoryConfig.maxInputChars) {
      break;
    }

    let fetched: Collection<string, Message>;
    try {
      fetched = await channel.messages.fetch({
        limit: guildMemoryConfig.messagesPerChannel,
      });
    } catch {
      continue;
    }

    const messages = [...fetched.values()]
      .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
      .filter((message) => !message.author.bot)
      .filter((message) => !ignoredUserIds.has(message.author.id))
      .map((message) => formatMessageLine(channel.name, message))
      .filter((line): line is string => typeof line === "string");

    if (messages.length === 0) {
      continue;
    }

    sampledChannels += 1;

    const channelHeader = `#${channel.name}`;
    if (pushTranscriptLine(lines, channelHeader, totalChars)) {
      totalChars += channelHeader.length + 1;
    }

    for (const messageLine of messages) {
      if (!pushTranscriptLine(lines, messageLine, totalChars)) {
        break;
      }
      totalChars += messageLine.length + 1;
      sampledMessages += 1;
      if (totalChars >= guildMemoryConfig.maxInputChars) {
        break;
      }
    }
  }

  return {
    transcript: lines.join("\n"),
    sampledChannels,
    sampledMessages,
  };
}

function pushTranscriptLine(lines: string[], line: string, currentChars: number): boolean {
  if (currentChars + line.length + 1 > guildMemoryConfig.maxInputChars) {
    return false;
  }

  lines.push(line);
  return true;
}

function canReadChannel(guild: Guild, channel: ReadableGuildTextChannel): boolean {
  const me = guild.members.me;
  if (!me) {
    return true;
  }

  const permissions = channel.permissionsFor(me);
  if (!permissions) {
    return false;
  }

  return permissions.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
  ]);
}

function isReadableGuildTextChannel(
  channel: GuildBasedChannel | null | undefined,
): channel is ReadableGuildTextChannel {
  if (!channel || !channel.isTextBased()) {
    return false;
  }

  return "messages" in channel && typeof channel.name === "string";
}

function compareChannelsByRecentActivity(
  left: ReadableGuildTextChannel,
  right: ReadableGuildTextChannel,
): number {
  const leftValue = parseSnowflake(left.lastMessageId);
  const rightValue = parseSnowflake(right.lastMessageId);
  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue < rightValue ? 1 : -1;
}

function parseSnowflake(value: string | null | undefined): bigint {
  if (!value) {
    return 0n;
  }

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function formatMessageLine(channelName: string, message: Message): string | undefined {
  const content = message.cleanContent.replace(/\s+/g, " ").trim();
  if (content.length === 0) {
    return undefined;
  }

  const authorName = singleLine(
    message.member?.displayName ?? message.author.displayName ?? message.author.username,
    40,
  );
  const body = singleLine(content, 220);
  return `[${channelName}] ${authorName}: ${body}`;
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
      error.statusCode === 404 &&
      hasDistinctGuildMemoryFallbackModel(guild.id)
    ) {
      console.warn(
        `[ai] guild memory aux model unavailable guild=${guild.id} auxModel=${auxModelConfig.modelName} fallbackModel=${aiConfig.modelName}`,
      );
      return await getGuildMemoryFallbackModelClient(guild.id).generateReply(messages);
    }

    throw error;
  }
}
