import path from "node:path";
import type { SearchPlatform } from "lavalink-client";
import {
  DEFAULT_SBK_MAX,
  DEFAULT_SBK_MIN,
  DISCORD_SELECT_OPTION_LIMIT,
  DEFAULT_FILE_HOST,
  DEFAULT_FILE_DIR,
  DEFAULT_MUSIC_PREFIX,
  DEFAULT_MUSIC_FIXED_VOLUME,
  DEFAULT_MUSIC_MAX_TRACK_MINUTES,
  MAX_MUSIC_MAX_TRACK_MINUTES,
  DEFAULT_PENDING_SEARCH_TTL_MS,
  DEFAULT_MAX_SELECTION_RESULTS,
  DEFAULT_YT_DLP_ENABLED,
  DEFAULT_YT_DLP_AUTO_DOWNLOAD,
  DEFAULT_YT_DLP_TIMEOUT_MS,
  DEFAULT_YT_DLP_CACHE_DIR,
  DEFAULT_LAVALINK_NODE_ID,
  DEFAULT_LAVALINK_HOST,
  DEFAULT_LAVALINK_PORT,
  DEFAULT_LAVALINK_PASSWORD,
  DEFAULT_LAVALINK_USERNAME,
  DEFAULT_LAVALINK_SECURE,
  DEFAULT_LAVALINK_TRACE_ENABLED,
  DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS,
  DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS,
  DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
  DEFAULT_LAVALINK_VOLUME_DECREMENTER,
  ALLOWED_EXTENSIONS,
  CONTENT_TYPE_TO_EXTENSION,
} from "./constants";
import { parseBoolean, parseInteger, parseText } from "../utils/env";
import type { RuntimeConfig } from "./types";

export function buildSbkRange(): RuntimeConfig["sbk"] {
  const min = parseInteger(process.env.SBK_MIN, DEFAULT_SBK_MIN, { min: 1 });
  const maxCandidate = parseInteger(process.env.SBK_MAX, DEFAULT_SBK_MAX, { min: 1 });
  const max = Math.max(min, maxCandidate);
  const optionsMax = Math.min(max, min + DISCORD_SELECT_OPTION_LIMIT - 1);
  return {
    min,
    max,
    options: Array.from(
      { length: optionsMax - min + 1 },
      (_, index) => min + index,
    ),
  };
}

export function buildMusicConfig(): RuntimeConfig["music"] {
  const musicMaxTrackMinutes = parseInteger(
    process.env.MUSIC_MAX_MINUTES,
    DEFAULT_MUSIC_MAX_TRACK_MINUTES,
    { min: 1, max: MAX_MUSIC_MAX_TRACK_MINUTES },
  );
  return {
    prefix: parseText(process.env.MUSIC_PREFIX) || DEFAULT_MUSIC_PREFIX,
    spotifyDebugEnabled: parseBoolean(process.env.SPOTIFY_DEBUG_ENABLED, false),
    fixedVolume: parseInteger(process.env.MUSIC_FIXED_VOLUME, DEFAULT_MUSIC_FIXED_VOLUME, { min: 0, max: 100 }),
    maxTrackMinutes: musicMaxTrackMinutes,
    maxTrackMs: musicMaxTrackMinutes * 60 * 1000,
    pendingSearchTtlMs: parseInteger(
      process.env.MUSIC_PENDING_SEARCH_TTL_MS,
      DEFAULT_PENDING_SEARCH_TTL_MS,
      { min: 1_000 },
    ),
    maxSelectionResults: parseInteger(
      process.env.MUSIC_MAX_SELECTION_RESULTS,
      DEFAULT_MAX_SELECTION_RESULTS,
      { min: 1, max: 25 },
    ),
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    allowedExtensionsLabel: ALLOWED_EXTENSIONS.map((ext) => ext.replace(".", "")).join(", "),
    contentTypeToExtension: { ...CONTENT_TYPE_TO_EXTENSION },
  };
}

export function buildYtdlpConfig(): RuntimeConfig["ytdlp"] {
  return {
    enabled: parseBoolean(process.env.YT_DLP_ENABLED, DEFAULT_YT_DLP_ENABLED),
    binaryPath: parseText(process.env.YT_DLP_PATH),
    autoDownload: parseBoolean(process.env.YT_DLP_AUTO_DOWNLOAD, DEFAULT_YT_DLP_AUTO_DOWNLOAD),
    timeoutMs: parseInteger(process.env.YT_DLP_TIMEOUT_MS, DEFAULT_YT_DLP_TIMEOUT_MS, { min: 1_000 }),
    cacheDir: path.resolve(parseText(process.env.YT_DLP_CACHE_DIR) || DEFAULT_YT_DLP_CACHE_DIR),
  };
}

export function buildLavalinkConfig(): RuntimeConfig["lavalink"] {
  const volumeDecrementerRaw = parseText(process.env.LAVALINK_VOLUME_DECREMENTER);
  const volumeDecrementerParsed = Number.parseFloat(volumeDecrementerRaw);
  const volumeDecrementer = Number.isFinite(volumeDecrementerParsed)
    ? volumeDecrementerParsed
    : DEFAULT_LAVALINK_VOLUME_DECREMENTER;
  return {
    nodeId: parseText(process.env.LAVALINK_NODE_ID) || DEFAULT_LAVALINK_NODE_ID,
    host: parseText(process.env.LAVALINK_HOST) || DEFAULT_LAVALINK_HOST,
    port: parseInteger(process.env.LAVALINK_PORT, DEFAULT_LAVALINK_PORT, { min: 1, max: 65_535 }),
    authorization: parseText(process.env.LAVALINK_PASSWORD) || DEFAULT_LAVALINK_PASSWORD,
    secure: parseBoolean(process.env.LAVALINK_SECURE, DEFAULT_LAVALINK_SECURE),
    traceEnabled: parseBoolean(process.env.LAVALINK_TRACE_ENABLED, DEFAULT_LAVALINK_TRACE_ENABLED),
    username: parseText(process.env.LAVALINK_USERNAME) || DEFAULT_LAVALINK_USERNAME,
    defaultSearchPlatform: (parseText(process.env.LAVALINK_DEFAULT_SEARCH_PLATFORM) || "ytmsearch") as SearchPlatform,
    maxPreviousTracks: parseInteger(process.env.LAVALINK_MAX_PREVIOUS_TRACKS, DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS, { min: 1 }),
    emptyQueueDestroyMs: parseInteger(process.env.LAVALINK_EMPTY_QUEUE_DESTROY_MS, DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS, { min: 1_000 }),
    clientPositionUpdateInterval: parseInteger(process.env.LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL, DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL, { min: 50 }),
    volumeDecrementer,
  };
}
