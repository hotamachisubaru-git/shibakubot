import fs from "node:fs";
import type { Client } from "discord.js";
import type {
  Player,
  TrackExceptionEvent,
  TrackStuckEvent,
} from "lavalink-client";
import {
  applyTrackDisplayOverrides,
  applyTrackDurationOverride,
  getTrackId,
  getTrackTitle,
  markTrackAsRecoveredByYtDlp,
  type PendingTrack,
} from "./trackUtils";
import {
  buildExternalTrackBlockedMessage,
  downloadExternalTrack,
  getRecoverableTrackUrl,
  YtDlpUserError,
} from "./ytDlpUtils";

const RECOVERY_RETRY_TTL_MS = 5 * 60 * 1000;
const recoveryLocks = new Set<string>();
const recentRecoveryAttempts = new Map<string, number>();

function cleanupRecentRecoveryAttempts(now: number): void {
  for (const [key, startedAt] of recentRecoveryAttempts) {
    if (now - startedAt >= RECOVERY_RETRY_TTL_MS) {
      recentRecoveryAttempts.delete(key);
    }
  }
}

function buildRecoveryKey(player: Player, track: PendingTrack, sourceUrl: string): string {
  return `${player.guildId}:${getTrackId(track) || sourceUrl}`;
}

function getRecoveryMessageTarget(client: Client, textChannelId: string | null) {
  if (!textChannelId) return null;
  const channel = client.channels.cache.get(textChannelId);
  if (channel && "send" in channel) {
    return channel;
  }
  return null;
}

async function sendRecoveryMessage(
  client: Client,
  player: Player,
  content: string,
): Promise<void> {
  const channel = getRecoveryMessageTarget(client, player.textChannelId ?? null);
  if (!channel) return;
  try {
    await channel.send(content);
  } catch {
    // noop
  }
}

function summarizePayload(payload: TrackExceptionEvent | TrackStuckEvent): string {
  if ("exception" in payload) {
    const message = payload.exception?.message?.trim();
    return message || "playback error";
  }
  if ("thresholdMs" in payload && typeof payload.thresholdMs === "number") {
    return `track stuck (${payload.thresholdMs}ms)`;
  }
  return "playback error";
}

async function resolveDownloadedTrack(
  player: Player,
  internalUrl: string,
  publicUrl: string,
): Promise<PendingTrack | null> {
  const internalResult = await player.search({ query: internalUrl }, {
    system: "playback-recovery",
  });
  const internalTrack = internalResult?.tracks?.[0] ?? null;
  if (internalTrack) return internalTrack;

  const publicResult = await player.search({ query: publicUrl }, {
    system: "playback-recovery",
  });
  return publicResult?.tracks?.[0] ?? null;
}

export async function recoverPlaybackWithYtDlp(
  client: Client,
  player: Player,
  track: PendingTrack | null,
  payload: TrackExceptionEvent | TrackStuckEvent,
): Promise<boolean> {
  if (!track) {
    return false;
  }

  const sourceUrl = getRecoverableTrackUrl(track);
  if (!sourceUrl) {
    return false;
  }

  const startedAt = Date.now();
  cleanupRecentRecoveryAttempts(startedAt);

  const recoveryKey = buildRecoveryKey(player, track, sourceUrl);
  if (recoveryLocks.has(recoveryKey) || recentRecoveryAttempts.has(recoveryKey)) {
    return false;
  }

  recoveryLocks.add(recoveryKey);
  recentRecoveryAttempts.set(recoveryKey, startedAt);

  const trackTitle = getTrackTitle(track);
  const payloadSummary = summarizePayload(payload);

  try {
    await sendRecoveryMessage(
      client,
      player,
      `⚠️ **${trackTitle}** の再生で問題が出たので、外部URL取り込みで復旧を試します。\n原因: ${payloadSummary}`,
    );

    let downloadedTrack;
    try {
      downloadedTrack = await downloadExternalTrack(sourceUrl);
    } catch (error) {
      const detail =
        error instanceof YtDlpUserError
          ? error.message
          : "外部URL取り込みでも復旧できませんでした。";
      await sendRecoveryMessage(
        client,
        player,
        `⚠️ **${trackTitle}** を復旧できませんでした。${detail}`,
      );
      return true;
    }

    const blockedMessage = buildExternalTrackBlockedMessage(
      downloadedTrack.title,
      downloadedTrack.durationMs,
      downloadedTrack.isLive,
    );
    if (blockedMessage) {
      await fs.promises.unlink(downloadedTrack.filePath).catch(() => undefined);
      await sendRecoveryMessage(
        client,
        player,
        `⚠️ **${trackTitle}** を復旧できませんでした。\n${blockedMessage}`,
      );
      return true;
    }

    const recoveredTrack = await resolveDownloadedTrack(
      player,
      downloadedTrack.internalUrl,
      downloadedTrack.publicUrl,
    );
    if (!recoveredTrack) {
      await fs.promises.unlink(downloadedTrack.filePath).catch(() => undefined);
      await sendRecoveryMessage(
        client,
        player,
        `⚠️ **${trackTitle}** の取り込みには成功しましたが、Lavalink から再生トラックを作れませんでした。`,
      );
      return true;
    }

    applyTrackDisplayOverrides(recoveredTrack, {
      title: downloadedTrack.title,
      author: downloadedTrack.uploader ?? undefined,
      uri: downloadedTrack.sourceUrl,
      artworkUrl: downloadedTrack.artworkUrl,
    });
    applyTrackDurationOverride(recoveredTrack, downloadedTrack.durationMs);
    markTrackAsRecoveredByYtDlp(recoveredTrack, downloadedTrack.sourceUrl);

    const currentTrackId = getTrackId(player.queue.current);
    const failedTrackId = getTrackId(track);
    const shouldPlayImmediately =
      !player.playing ||
      !currentTrackId ||
      currentTrackId === failedTrackId;

    if (shouldPlayImmediately) {
      await player.play({ clientTrack: recoveredTrack, noReplace: false });
      await sendRecoveryMessage(
        client,
        player,
        `▶ **${downloadedTrack.title}** を外部URL取り込みで復旧して再生します。`,
      );
      return true;
    }

    await player.queue.add(recoveredTrack, 0);
    await sendRecoveryMessage(
      client,
      player,
      `⏱ **${downloadedTrack.title}** を外部URL取り込みで復旧し、次に再生するようキュー先頭へ戻しました。`,
    );
    return true;
  } catch (error) {
    console.warn("[music] playback recovery error", error);
    await sendRecoveryMessage(
      client,
      player,
      `⚠️ **${trackTitle}** の自動復旧中にエラーが発生しました。`,
    );
    return true;
  } finally {
    recoveryLocks.delete(recoveryKey);
  }
}
