// 環境変数の読み込み
export const SBK_MIN = Number(process.env.SBK_MIN ?? 1);
export const SBK_MAX = Number(process.env.SBK_MAX ?? 25);
export const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
// セレクトメニュー用の選択肢（1..MAX）
// 20件以内ならDiscordの上限(25)に収まるのでそのまま全件出せます。
export const SBK_OPTIONS = Array.from(
  { length: SBK_MAX - SBK_MIN + 1 },
  (_, i) => i + SBK_MIN
);
