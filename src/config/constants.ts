import type { SearchPlatform } from "lavalink-client";

export const DISCORD_SELECT_OPTION_LIMIT = 25;
export const DEFAULT_SBK_MIN = 1;
export const DEFAULT_SBK_MAX = 25;
export const DEFAULT_FILE_PORT = 3001;
export const DEFAULT_FILE_HOST = "0.0.0.0";
export const DEFAULT_FILE_DIR = "./files";
export const DEFAULT_MUSIC_PREFIX = "p!";
export const DEFAULT_MUSIC_FIXED_VOLUME = 20;
export const DEFAULT_MUSIC_MAX_TRACK_MINUTES = 15;
export const MAX_MUSIC_MAX_TRACK_MINUTES = Math.floor(2_147_483_647 / 60_000);
export const DEFAULT_PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_SELECTION_RESULTS = 10;
export const DEFAULT_YT_DLP_ENABLED = true;
export const DEFAULT_YT_DLP_AUTO_DOWNLOAD = true;
export const DEFAULT_YT_DLP_TIMEOUT_MS = 3 * 60 * 1000;
export const DEFAULT_YT_DLP_CACHE_DIR = "./data/yt-dlp";
export const DEFAULT_LAVALINK_NODE_ID = "local";
export const DEFAULT_LAVALINK_HOST = "127.0.0.1";
export const DEFAULT_LAVALINK_PORT = 2333;
export const DEFAULT_LAVALINK_PASSWORD = "youshallnotpass";
export const DEFAULT_LAVALINK_USERNAME = "shibakubot";
export const DEFAULT_LAVALINK_SECURE = false;
export const DEFAULT_LAVALINK_TRACE_ENABLED = false;
export const DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS = 25;
export const DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS = 60_000;
export const DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL = 150;
export const DEFAULT_LAVALINK_VOLUME_DECREMENTER = 1;
export const DISABLED_TEXT_VALUES = new Set(["none", "null", "undefined"]);

export const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"] as const;

export const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
};
