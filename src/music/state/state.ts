// state.ts - リファクタリング済み
// 個別ファイルに分割済み:
//   state-types.ts   - 型定義
//   state-autoStop.ts - autoStop関連
//   state-repeat.ts   - repeat関連
//   state-pending.ts  - pendingSearch/retrySelection
//   state-hook.ts     - Lavalinkイベントフック

export type { PendingSearch, RetrySelectionContext } from "./state-types";

export {
  clearAutoStop,
  refreshAutoStopForPlayer,
  hookManagerAutoStopOnce,
} from "./state-autoStop";

export {
  clearRepeatTimer,
  setRepeatTimer,
  applyMusicRepeatForPlayer,
  replayMusicRepeatIfNeeded,
} from "./state-repeat";

export {
  getPendingSearch,
  setPendingSearch,
  setPendingSearchForUser,
  clearPendingSearch,
  registerRetrySelection,
  consumeRetrySelection,
  clearRetrySelection,
} from "./state-pending";
