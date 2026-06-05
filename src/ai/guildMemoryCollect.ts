import type { Collection, Guild, Message } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { getIgnoredUserList } from "../data";
import { guildMemoryConfig, type SampledGuildTranscript } from "./guildMemoryConfig";
import { singleLine } from "./textUtils";

type ReadableGuildTextChannel = {
  name: string;
  lastMessageId?: string | null;
  isTextBased(): boolean;
  messages: {
    fetch(options: { limit: number }): Promise<Collection<string, Message>>;
  };
  permissionsFor(member: unknown): { has(perms: unknown[]): boolean } | null;
};

export async function collectGuildTranscript(guild: Guild): Promise<SampledGuildTranscript> {
  await guild.channels.fetch();

  const unfilteredChannels = [...guild.channels.cache.values()];
  const readableChannels: ReadableGuildTextChannel[] = [];
  for (const channel of unfilteredChannels) {
    if (isReadableGuildTextChannel(channel) && canReadChannel(guild, channel)) {
      readableChannels.push(channel);
    }
  }
  const channels = readableChannels
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
  channel: unknown,
): channel is ReadableGuildTextChannel {
  if (!channel || typeof channel !== "object") {
    return false;
  }
  const obj = channel as Record<string, unknown>;
  const isTextBased = obj["isTextBased"];
  if (typeof isTextBased !== "function" || !isTextBased.call(obj)) {
    return false;
  }
  const c = channel as ReadableGuildTextChannel;
  return "messages" in c && typeof c.name === "string";
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
