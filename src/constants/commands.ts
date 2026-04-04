export const SLASH_COMMAND = {
  ping: "ping", //ping
  sbk: "sbk", //しばく
  menu: "menu", //メニュー
  help: "help", //ヘルプ
  ai: "ai", // AI総合
  chat: "chat", //AIチャット
  reply: "reply", // AIチャット返信
  regen: "regen", // AIチャット再生成
  image: "image", //  AI画像生成
  tts: "tts", // AI音声生成
  history: "history", // チャット履歴
  setPrompt: "setprompt", //  プロンプト設定
  setCharacter: "setcharacter", // キャラクター設定
  chatReset: "chatreset", // チャット履歴リセット
} as const;

export const MUSIC_TEXT_COMMAND = {
  play: "play",
  np: "np",
  skip: "skip",
  skipAlias: "s",
  stop: "stop",
  queue: "queue",
  upload: "upload",
  ng: "ng",
  ngAlias: "ngword",
  help: "help",
  remove: "remove",
  removeAlias: "delete",
  disable: "disable",
  disableAlias: "d",
  enable: "enable",
  enableAlias: "e",
} as const;
