// ─────────────────────────────────────────────────────────────────────────────
// music/commandHandlers.ts — リダイレクト用
//
// 各ハンドラーは関連するファイルに分割済み。
// 外部からのインポートはここから行われることを想定。
// ─────────────────────────────────────────────────────────────────────────────

// Types
export type { HandlePlayOptions } from "../playback/play";

// Play engine
export { handlePlay } from "../playback/play";
export { saveResponseBodyToFile } from "./upload-handler";
export { getOrCreatePlayer, waitForVoiceConnection } from "../playback/player-connection";
export { handleExternalUrlFallback } from "./external-url";

// Queue
export { handleSkip, handleStop, handleQueue, handleRemoveCommand } from "../queue/queue-commands";

// Settings (split)
export { handleRepeatCommand, parseRepeatEnabledArg } from "./repeat";
export { handleNgWordCommand } from "./ng-words";
export { handleLimitCommand, buildMusicLimitStatusMessage } from "./duration-limit";
export { handleDisable, handleEnable } from "./music-toggle";

// Now playing
export { handleNowPlaying } from "../playback/now-playing";

// Permissions
export { canManageMusic } from "./music-permissions";
