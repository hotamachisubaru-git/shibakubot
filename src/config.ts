// しばく回数の下限/上限を一元管理（環境変数で上書きも可）
export const SBK_MIN = Number(process.env.SBK_MIN ?? 1);
export const SBK_MAX = Number(process.env.SBK_MAX ?? 25);

// セレクトメニュー用の選択肢（1..MAX）
// 20件以内ならDiscordの上限(25)に収まるのでそのまま全件出せます。
export const SBK_OPTIONS = Array.from(
  { length: SBK_MAX - SBK_MIN + 1 },
  (_, i) => i + SBK_MIN
);
