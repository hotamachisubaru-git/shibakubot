import type { Message } from "discord.js";
import type { Player } from "lavalink-client";
import { looksLikeSpotifyInput, resolveSpotifyInput } from "./spotifyUtils";
import { resolveSpotifyTrackCandidate } from "../search/spotifySearch";
import {
  createSpotifyDebugContext,
  logSpotifyDebug,
  warnSpotifyDebug,
  errorSpotifyDebug,
  formatSpotifyDebugQuery,
  summarizeSpotifyTrackMetadata,
  summarizePendingTrackForDebug,
  SPOTIFY_DEBUG_TRACK_LOG_LIMIT,
} from "../search/searchDebug";
import { clearPendingSearch } from "../state/state";
import { getMusicNgWords } from "../../data";
import { getGuildMusicPlaybackLimit } from "../misc/limits";
import { validateTrackForQueue } from "../misc/trackValidation";
import { getTrackTitle } from "../misc/trackUtils";
import { FIXED_VOLUME } from "../misc/constants";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

function getSpotifyTypeLabel(type: "track" | "album" | "playlist"): string {
  switch (type) {
    case "track": return "曲";
    case "album": return "アルバム";
    case "playlist": return "プレイリスト";
    default: return "コンテンツ";
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleSpotifyPlay(
  message: Message,
  player: Player,
  query: string,
): Promise<boolean> {
  if (!looksLikeSpotifyInput(query)) return false;

  const guildId = message.guildId;
  if (!guildId) return true;

  const debugContext = createSpotifyDebugContext(message);
  clearPendingSearch(message);

  logSpotifyDebug(debugContext, "received-input", {
    query: formatSpotifyDebugQuery(query),
    playerConnected: player.connected,
    playerPlaying: player.playing,
    playerPaused: player.paused,
    queueSize: player.queue.tracks.length,
  });

  // --- Resolve Spotify input ---
  let spotifyResolution;
  try {
    spotifyResolution = await resolveSpotifyInput(query);
  } catch (error) {
    warnSpotifyDebug(debugContext, "resolve-error", { query: formatSpotifyDebugQuery(query) }, error);
  }

  if (!spotifyResolution?.tracks.length) {
    warnSpotifyDebug(debugContext, "resolve-empty", { query: formatSpotifyDebugQuery(query) });
    await message.reply(
      "⚠️ Spotify の公開トラック/アルバム/プレイリストを解決できませんでした。URL か URI を確認してください。",
    );
    return true;
  }

  const totalSpotifyTracks = spotifyResolution.tracks.length;
  logSpotifyDebug(debugContext, "resolved", {
    query: formatSpotifyDebugQuery(query),
    sourceUrl: spotifyResolution.sourceUrl,
    type: spotifyResolution.type,
    title: spotifyResolution.title,
    totalTracks: totalSpotifyTracks,
    truncated: spotifyResolution.truncated,
  });

  // --- Add tracks to queue ---
  const ngWords = getMusicNgWords(guildId);
  const playbackLimit = getGuildMusicPlaybackLimit(guildId);
  const wasIdle = !player.playing && !player.paused;
  let addedCount = 0;
  let skippedCount = 0;
  let unknownDurationCount = 0;
  let firstAddedTitle: string | null = null;
  let lastQueuePosition: number | null = null;
  let firstFailureMessage: string | null = null;

  for (const [index, spotifyTrack] of spotifyResolution.tracks.entries()) {
    const shouldLogTrackDetail =
      totalSpotifyTracks <= SPOTIFY_DEBUG_TRACK_LOG_LIMIT || index < SPOTIFY_DEBUG_TRACK_LOG_LIMIT;

    if (shouldLogTrackDetail) {
      logSpotifyDebug(debugContext, "search-start", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        searchQuery: formatSpotifyDebugQuery(`${spotifyTrack.title} ${spotifyTrack.artist}`),
        spotifyTrack: summarizeSpotifyTrackMetadata(spotifyTrack),
      });
    } else if (index === SPOTIFY_DEBUG_TRACK_LOG_LIMIT) {
      logSpotifyDebug(debugContext, "search-log-truncated", {
        totalTracks: totalSpotifyTracks,
        omittedDetailedLogs: totalSpotifyTracks - SPOTIFY_DEBUG_TRACK_LOG_LIMIT,
      });
    }

    const resolvedTrack = await resolveSpotifyTrackCandidate(
      player,
      spotifyTrack,
      message.author,
      debugContext,
      index + 1,
      totalSpotifyTracks,
    );

    if (!resolvedTrack) {
      skippedCount += 1;
      firstFailureMessage ??= "🔍 Spotify の曲に対応する再生候補が見つかりませんでした…。";
      warnSpotifyDebug(debugContext, "search-no-result", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        spotifyTrack: summarizeSpotifyTrackMetadata(spotifyTrack),
      });
      continue;
    }

    const validation = validateTrackForQueue(
      resolvedTrack,
      ngWords,
      playbackLimit,
      {
        ngWordTargets: [resolvedTrack.info?.title, resolvedTrack.info?.author],
        ngWordMessage: () => "🚫 NGワードが含まれているため再生できません。",
      },
    );

    if (validation.errorMessage) {
      skippedCount += 1;
      firstFailureMessage ??= validation.errorMessage;
      warnSpotifyDebug(debugContext, "queue-validation-failed", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        reason: validation.errorMessage,
        resolvedTrack: summarizePendingTrackForDebug(resolvedTrack),
      });
      continue;
    }

    if (!validation.hasDuration) unknownDurationCount += 1;

    await player.queue.add(resolvedTrack);
    addedCount += 1;
    if (!firstAddedTitle) firstAddedTitle = getTrackTitle(resolvedTrack);
    lastQueuePosition = player.queue.tracks.length;

    if (shouldLogTrackDetail) {
      logSpotifyDebug(debugContext, "queue-added", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        queuePosition: lastQueuePosition,
        resolvedTrack: summarizePendingTrackForDebug(resolvedTrack),
      });
    }
  }

  // --- Reply ---
  if (!addedCount) {
    warnSpotifyDebug(debugContext, "queue-empty-after-search", {
      totalTracks: totalSpotifyTracks,
      skippedCount,
      firstFailureMessage,
    });
    await message.reply(
      firstFailureMessage ?? "🔍 Spotify から再生できる曲を見つけられませんでした…。",
    );
    return true;
  }

  if (wasIdle) {
    try {
      await player.play();
      logSpotifyDebug(debugContext, "play-started", {
        currentTrack: summarizePendingTrackForDebug(player.queue.current),
        queueSize: player.queue.tracks.length,
      });
    } catch (error) {
      errorSpotifyDebug(debugContext, "play-start-failed", {
        addedCount,
        skippedCount,
        queueSize: player.queue.tracks.length,
        currentTrack: summarizePendingTrackForDebug(player.queue.current),
      }, error);
      throw error;
    }
  }

  const lines = buildSpotifyReplyLines(
    addedCount,
    skippedCount,
    unknownDurationCount,
    wasIdle,
    firstAddedTitle,
    lastQueuePosition,
    spotifyResolution,
    playbackLimit,
  );

  logSpotifyDebug(debugContext, "completed", {
    type: spotifyResolution.type,
    title: spotifyResolution.title,
    addedCount,
    skippedCount,
    unknownDurationCount,
    wasIdle,
    queueSize: player.queue.tracks.length,
    currentTrack: summarizePendingTrackForDebug(player.queue.current),
  });

  await message.reply(lines.join("\n"));
  return true;
}

// ---------------------------------------------------------------------------
// Reply builder
// ---------------------------------------------------------------------------

function buildSpotifyReplyLines(
  addedCount: number,
  skippedCount: number,
  unknownDurationCount: number,
  wasIdle: boolean,
  firstAddedTitle: string | null,
  lastQueuePosition: number | null,
  spotifyResolution: {
    type: "track" | "album" | "playlist";
    title: string;
    sourceUrl: string;
    truncated?: boolean;
    tracks: { length: number };
  },
  playbackLimit: { maxTrackMinutes: number },
): string[] {
  const lines: string[] = [];

  if (addedCount === 1 && firstAddedTitle) {
    if (wasIdle) {
      lines.push(`▶ 再生開始: **${firstAddedTitle}**（音量: ${FIXED_VOLUME}）`);
    } else {
      lines.push(
        `⏱ キューに追加しました: **${firstAddedTitle}**（位置: ${lastQueuePosition ?? 1}）`,
      );
    }
  } else {
    const typeLabel = getSpotifyTypeLabel(spotifyResolution.type);
    const actionLabel = wasIdle ? "再生キューに追加しました" : "キューに追加しました";
    lines.push(
      `🎵 Spotify の${typeLabel}を${actionLabel}: **${spotifyResolution.title}**（${addedCount}曲）`,
    );
  }

  lines.push(`🔗 Spotify: ${spotifyResolution.sourceUrl}`);

  if (spotifyResolution.truncated) {
    lines.push(
      `⚠️ 取り込み件数が多いため、先頭 ${spotifyResolution.tracks.length} 曲のみ追加対象にしました。`,
    );
  }
  if (skippedCount > 0) {
    lines.push(
      `⚠️ ${skippedCount} 曲は見つからないか、長すぎる/NGワードのため追加できませんでした。`,
    );
  }
  if (unknownDurationCount > 0) {
    lines.push(
      `⚠️ ${unknownDurationCount} 曲は長さを取得できないため、最大 ${playbackLimit.maxTrackMinutes} 分で自動停止します。`,
    );
  }

  return lines;
}
