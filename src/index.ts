import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { getRuntimeConfig } from "./config/runtime";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink, initializeLavalink } from "./lavalink";
import { setupAppEventHandlers } from "./events/appEvents";
import { setupLavalinkEventHandlers } from "./events/lavalinkHandlers";
import { ensureSingleInstance } from "./utils/singleInstance";
import { registerCommands } from "./discord/deployCommands";
import { cleanupExpiredYtDlpDownloads } from "./music/ytDlp/ytDlpUtils";

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;
export const nodeStatsLogCounters = new Map<string, number>();

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

ensureSingleInstance();
startFileServer();

function runYtDlpCleanup(): void {
  void cleanupExpiredYtDlpDownloads()
    .then(({ deleted }) => {
      if (deleted > 0) {
        console.log(`[music] cleaned ${deleted} expired yt-dlp temporary file(s)`);
      }
    })
    .catch((error: unknown) => {
      console.warn("[music] yt-dlp temporary file cleanup failed", error);
    });
}

runYtDlpCleanup();
const ytDlpCleanupTimer = setInterval(
  runYtDlpCleanup,
  runtimeConfig.ytdlp.cleanupIntervalMs,
);
ytDlpCleanupTimer.unref();

const client = initLavalink(
  new Client({
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  }),
);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);

  // スラッシュコマンドを先に登録し、登録完了後にLavalink接続を開始する。
  try {
    await registerCommands();
  } catch (error: unknown) {
    console.warn("[commands] ⚠️ スラッシュコマンド登録に失敗しました。", error);
  }

  // Lavalink待機前にDiscordイベントハンドラを設定（音楽機能以外を先に利用可能にする）
  setupAppEventHandlers(client);
  setupLavalinkEventHandlers(client);

  // Lavalinkの初期化はバックグラウンドで試み、Bot全体の起動をブロックしない。
  void initializeLavalink(client).catch((error: unknown) => {
    console.warn(
      "[lavalink] ⚠️ Lavalinkサーバーに接続できません。音楽機能は利用できません。",
    );
    console.warn(
      `[lavalink] エラー: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
});

void client.login(TOKEN);
