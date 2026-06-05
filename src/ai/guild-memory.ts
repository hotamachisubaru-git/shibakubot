import type { Guild, Message } from "discord.js";
import { guildMemoryConfig } from "./guildMemoryConfig";
import { collectGuildTranscript } from "./guildMemoryCollect";
import {
  summarizeAndSaveGuildTranscript,
  getGuildMemoryRefreshMs,
  getGuildMemoryMinIntervalMs,
  getExistingGuildMemory,
  setExistingGuildMemory,
} from "./guildMemorySummarize";

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
  const existing = getExistingGuildMemory(guild.id);
  const minIntervalMs = getGuildMemoryMinIntervalMs();
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
    const existing = getExistingGuildMemory(guild.id);
    const refreshMs = getGuildMemoryRefreshMs();
    if (!options.force && existing && Date.now() - existing.updatedAt < refreshMs) {
      return;
    }
    const sampled = await collectGuildTranscript(guild);
    if (sampled.sampledMessages === 0 || sampled.transcript.trim().length === 0) {
      console.log(`[ai] guild memory skipped guild=${guild.id} reason=no_messages`);
      return;
    }
    await summarizeAndSaveGuildTranscript(guild, sampled.transcript);
    console.log(
      `[ai] guild memory refreshed guild=${guild.id} reason=${options.reason} channels=${sampled.sampledChannels} messages=${sampled.sampledMessages}`,
    );
  } finally {
    activeRefreshGuilds.delete(guild.id);
  }
}
