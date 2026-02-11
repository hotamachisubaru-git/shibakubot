import { getRuntimeConfig } from "../config/runtime";

const runtimeConfig = getRuntimeConfig();

export const PREFIX = runtimeConfig.music.prefix;
export const FIXED_VOLUME = runtimeConfig.music.fixedVolume;
export const MAX_SELECTION_RESULTS = runtimeConfig.music.maxSelectionResults;
export const PENDING_SEARCH_TTL_MS = runtimeConfig.music.pendingSearchTtlMs;
export const MAX_TRACK_MINUTES = runtimeConfig.music.maxTrackMinutes;
export const MAX_TRACK_MS = runtimeConfig.music.maxTrackMs;
export const OWNER_IDS = runtimeConfig.discord.ownerIds;
export const UPLOAD_DIR = runtimeConfig.fileServer.uploadDir;
export const ALLOWED_EXTENSIONS = runtimeConfig.music.allowedExtensions;
export const ALLOWED_EXTENSIONS_LABEL = runtimeConfig.music.allowedExtensionsLabel;
export const CONTENT_TYPE_TO_EXTENSION = runtimeConfig.music.contentTypeToExtension;
