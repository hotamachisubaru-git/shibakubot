"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeStatsLogCounters = void 0;
require("dotenv/config");
const discord_js_1 = require("discord.js");
const runtime_1 = require("./config/runtime");
const index_js_1 = require("./consoleCommands/index.js");
const fileServer_1 = require("./fileserver/fileServer");
const lavalink_1 = require("./lavalink");
const lavalinkHandlers_1 = require("./events/lavalinkHandlers");
const appEvents_1 = require("./events/appEvents");
const singleInstance_1 = require("./utils/singleInstance");
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const TOKEN = runtimeConfig.discord.token;
exports.nodeStatsLogCounters = new Map();
if (!TOKEN) {
    throw new Error("Missing required environment variable: TOKEN");
}
(0, singleInstance_1.ensureSingleInstance)();
(0, fileServer_1.startFileServer)();
const client = (0, lavalink_1.initLavalink)(new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
}));
(0, index_js_1.registerConsoleCommands)(client);
client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`✅ ログイン完了: ${readyClient.user.tag}`);
    (0, lavalinkHandlers_1.setupLavalinkEventHandlers)(client);
    await (0, lavalink_1.waitForLavalinkReady)();
    await client.lavalink.init({
        id: readyClient.user.id,
        username: runtimeConfig.lavalink.username,
    });
    (0, appEvents_1.setupAppEventHandlers)(client);
});
void client.login(TOKEN);
