"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeStatsLogCounters = void 0;
require("dotenv/config");
const discord_js_1 = require("discord.js");
const runtime_1 = require("./config/runtime");
const fileServer_1 = require("./fileserver/fileServer");
const lavalink_1 = require("./lavalink");
const appEvents_1 = require("./events/appEvents");
const lavalinkHandlers_1 = require("./events/lavalinkHandlers");
const singleInstance_1 = require("./utils/singleInstance");
const deployCommands_1 = require("./discord/deployCommands");
const ytDlpUtils_1 = require("./music/ytDlp/ytDlpUtils");
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const TOKEN = runtimeConfig.discord.token;
exports.nodeStatsLogCounters = new Map();
if (!TOKEN) {
    throw new Error("Missing required environment variable: TOKEN");
}
(0, singleInstance_1.ensureSingleInstance)();
(0, fileServer_1.startFileServer)();
function runYtDlpCleanup() {
    void (0, ytDlpUtils_1.cleanupExpiredYtDlpDownloads)()
        .then(({ deleted }) => {
        if (deleted > 0) {
            console.log(`[music] cleaned ${deleted} expired yt-dlp temporary file(s)`);
        }
    })
        .catch((error) => {
        console.warn("[music] yt-dlp temporary file cleanup failed", error);
    });
}
runYtDlpCleanup();
const ytDlpCleanupTimer = setInterval(runYtDlpCleanup, runtimeConfig.ytdlp.cleanupIntervalMs);
ytDlpCleanupTimer.unref();
const client = (0, lavalink_1.initLavalink)(new discord_js_1.Client({
    allowedMentions: {
        parse: [],
        repliedUser: false,
    },
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
}));
client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`✅ ログイン完了: ${readyClient.user.tag}`);
    // スラッシュコマンドを先に登録し、登録完了後にLavalink接続を開始する。
    try {
        await (0, deployCommands_1.registerCommands)();
    }
    catch (error) {
        console.warn("[commands] ⚠️ スラッシュコマンド登録に失敗しました。", error);
    }
    // Lavalink待機前にDiscordイベントハンドラを設定（音楽機能以外を先に利用可能にする）
    (0, appEvents_1.setupAppEventHandlers)(client);
    (0, lavalinkHandlers_1.setupLavalinkEventHandlers)(client);
    // Lavalinkの初期化はバックグラウンドで試み、Bot全体の起動をブロックしない。
    void (0, lavalink_1.initializeLavalink)(client).catch((error) => {
        console.warn("[lavalink] ⚠️ Lavalinkサーバーに接続できません。音楽機能は利用できません。");
        console.warn(`[lavalink] エラー: ${error instanceof Error ? error.message : String(error)}`);
    });
});
void client.login(TOKEN);
