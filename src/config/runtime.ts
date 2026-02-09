import path from "node:path";
import type { SearchPlatform } from "lavalink-client";
import { parseBoolean, parseCsvSet, parseCsvValues, parseInteger, parseText } from "../utils/env";

const DISCORD_SELECT_OPTION_LIMIT = 25;
const DEFAULT_SBK_MIN = 1;
const DEFAULT_SBK_MAX = 25;
const DEFAULT_FILE_PORT = 3001;
const DEFAULT_FILE_HOST = "0.0.0.0";
const DEFAULT_FILE_DIR = "./files";
const DEFAULT_MUSIC_PREFIX = "s!";
const DEFAULT_MUSIC_FIXED_VOLUME = 20;
const DEFAULT_MUSIC_MAX_TRACK_MINUTES = 15;
const DEFAULT_PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SELECTION_RESULTS = 10;
const DEFAULT_LAVALINK_NODE_ID = "local";
const DEFAULT_LAVALINK_HOST = "127.0.0.1";
const DEFAULT_LAVALINK_PORT = 2333;
const DEFAULT_LAVALINK_PASSWORD = "youshallnotpass";
const DEFAULT_LAVALINK_USERNAME = "shibakubot";
const DEFAULT_LAVALINK_SECURE = false;
const DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS = 25;
const DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS = 60_000;
const DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL = 150;
const DEFAULT_LAVALINK_VOLUME_DECREMENTER = 0.75;

type UrlBaseConfig = Readonly<{
  publicBaseUrl: URL;
  internalBaseUrl: URL;
}>;

export type RuntimeConfig = Readonly<{
  discord: Readonly<{
    token: string;
    clientId: string;
    guildIds: readonly string[];
    ownerIds: ReadonlySet<string>;
    immuneIds: ReadonlySet<string>;
    logChannelId: string;
  }>;
  sbk: Readonly<{
    min: number;
    max: number;
    options: readonly number[];
  }>;
  fileServer: Readonly<{
    uploadDir: string;
    host: string;
    port: number;
  }>;
  upload: UrlBaseConfig;
  music: Readonly<{
    prefix: string;
    fixedVolume: number;
    maxTrackMinutes: number;
    maxTrackMs: number;
    pendingSearchTtlMs: number;
    maxSelectionResults: number;
    allowedExtensions: readonly string[];
    allowedExtensionsLabel: string;
    contentTypeToExtension: Readonly<Record<string, string>>;
  }>;
  lavalink: Readonly<{
    nodeId: string;
    host: string;
    port: number;
    authorization: string;
    secure: boolean;
    username: string;
    defaultSearchPlatform: SearchPlatform;
    maxPreviousTracks: number;
    emptyQueueDestroyMs: number;
    clientPositionUpdateInterval: number;
    volumeDecrementer: number;
  }>;
  app: Readonly<{
    clearGlobalCommandsOnRegister: boolean;
    maxLogReasonLength: number;
  }>;
}>;

function normalizeUrl(raw: string | undefined, fallback: string): URL {
  const value = parseText(raw);
  if (!value) return new URL(fallback);

  try {
    return new URL(value);
  } catch {
    return new URL(fallback);
  }
}

function buildUploadUrlConfig(
  fileHost: string,
  filePort: number,
): UrlBaseConfig {
  const fallbackPublic = `http://localhost:${filePort}/uploads/`;
  const fallbackInternal = `http://127.0.0.1:${filePort}/uploads/`;

  const publicBase = normalizeUrl(
    process.env.UPLOAD_BASE_URL ?? process.env.FILE_BASE_URL,
    fallbackPublic,
  );
  const internalBase = normalizeUrl(
    process.env.UPLOAD_INTERNAL_URL,
    fallbackInternal,
  );

  if (!parseText(process.env.UPLOAD_INTERNAL_URL)) {
    const canUseFileHost =
      fileHost !== DEFAULT_FILE_HOST &&
      fileHost !== "localhost" &&
      fileHost !== "127.0.0.1";
    if (canUseFileHost) {
      return {
        publicBaseUrl: publicBase,
        internalBaseUrl: new URL(`http://${fileHost}:${filePort}/uploads/`),
      };
    }
  }

  return {
    publicBaseUrl: publicBase,
    internalBaseUrl: internalBase,
  };
}

function buildSbkRange(): RuntimeConfig["sbk"] {
  const min = parseInteger(process.env.SBK_MIN, DEFAULT_SBK_MIN, { min: 1 });
  const maxCandidate = parseInteger(process.env.SBK_MAX, DEFAULT_SBK_MAX, {
    min: 1,
  });
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

function buildRuntimeConfig(): RuntimeConfig {
  const filePort = parseInteger(process.env.FILE_PORT, DEFAULT_FILE_PORT, {
    min: 1,
    max: 65_535,
  });
  const fileHost = parseText(process.env.FILE_HOST) || DEFAULT_FILE_HOST;
  const uploadDir = path.resolve(
    parseText(process.env.FILE_DIR) || DEFAULT_FILE_DIR,
  );

  const allowedExtensions = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"] as const;
  const contentTypeToExtension: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
  };
  const musicMaxTrackMinutes = parseInteger(
    process.env.MUSIC_MAX_MINUTES,
    DEFAULT_MUSIC_MAX_TRACK_MINUTES,
    { min: 1 },
  );
  const volumeDecrementerRaw = parseText(process.env.LAVALINK_VOLUME_DECREMENTER);
  const volumeDecrementerParsed = Number.parseFloat(volumeDecrementerRaw);
  const volumeDecrementer = Number.isFinite(volumeDecrementerParsed)
    ? volumeDecrementerParsed
    : DEFAULT_LAVALINK_VOLUME_DECREMENTER;

  return {
    discord: {
      token: parseText(process.env.TOKEN),
      clientId: parseText(process.env.CLIENT_ID),
      guildIds: parseCsvValues(process.env.GUILD_IDS ?? process.env.GUILD_ID),
      ownerIds: parseCsvSet(process.env.OWNER_IDS),
      immuneIds: parseCsvSet(process.env.IMMUNE_IDS),
      logChannelId: parseText(process.env.LOG_CHANNEL_ID),
    },
    sbk: buildSbkRange(),
    fileServer: {
      uploadDir,
      host: fileHost,
      port: filePort,
    },
    upload: buildUploadUrlConfig(fileHost, filePort),
    music: {
      prefix: parseText(process.env.MUSIC_PREFIX) || DEFAULT_MUSIC_PREFIX,
      fixedVolume: parseInteger(
        process.env.MUSIC_FIXED_VOLUME,
        DEFAULT_MUSIC_FIXED_VOLUME,
        { min: 0, max: 20 },
      ),
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
      allowedExtensions,
      allowedExtensionsLabel: allowedExtensions
        .map((ext) => ext.replace(".", ""))
        .join(", "),
      contentTypeToExtension,
    },
    lavalink: {
      nodeId: parseText(process.env.LAVALINK_NODE_ID) || DEFAULT_LAVALINK_NODE_ID,
      host: parseText(process.env.LAVALINK_HOST) || DEFAULT_LAVALINK_HOST,
      port: parseInteger(process.env.LAVALINK_PORT, DEFAULT_LAVALINK_PORT, {
        min: 1,
        max: 65_535,
      }),
      authorization:
        parseText(process.env.LAVALINK_PASSWORD) || DEFAULT_LAVALINK_PASSWORD,
      secure: parseBoolean(process.env.LAVALINK_SECURE, DEFAULT_LAVALINK_SECURE),
      username:
        parseText(process.env.LAVALINK_USERNAME) || DEFAULT_LAVALINK_USERNAME,
      defaultSearchPlatform:
        (parseText(process.env.LAVALINK_DEFAULT_SEARCH_PLATFORM) ||
          "ytmsearch") as SearchPlatform,
      maxPreviousTracks: parseInteger(
        process.env.LAVALINK_MAX_PREVIOUS_TRACKS,
        DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS,
        { min: 1 },
      ),
      emptyQueueDestroyMs: parseInteger(
        process.env.LAVALINK_EMPTY_QUEUE_DESTROY_MS,
        DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS,
        { min: 1_000 },
      ),
      clientPositionUpdateInterval: parseInteger(
        process.env.LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
        DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
        { min: 50 },
      ),
      volumeDecrementer,
    },
    app: {
      clearGlobalCommandsOnRegister: parseBoolean(
        process.env.CLEAR_GLOBAL,
        true,
      ),
      maxLogReasonLength: parseInteger(process.env.SBK_MAX_REASON_LENGTH, 2_000, {
        min: 50,
      }),
    },
  };
}

let cachedRuntimeConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;
  cachedRuntimeConfig = buildRuntimeConfig();
  return cachedRuntimeConfig;
}
