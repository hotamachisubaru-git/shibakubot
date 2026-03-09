"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const runtime_1 = require("./config/runtime");
const interactionRouter_1 = require("./discord/interactionRouter");
const data_1 = require("./data");
const fileServer_1 = require("./fileserver/fileServer");
const lavalink_1 = require("./lavalink");
const music_1 = require("./music");
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const TOKEN = runtimeConfig.discord.token;
if (!TOKEN) {
    throw new Error("Missing required environment variable: TOKEN");
}
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
client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
    console.log(`✅ ログイン完了: ${readyClient.user.tag}`);
    client.lavalink.nodeManager.on("connect", (node) => {
        console.log(`[lavalink] node connected: ${node.id}`);
    });
    client.lavalink.nodeManager.on("disconnect", (node, reason) => {
        console.warn(`[lavalink] node disconnected: ${node.id}`, reason);
    });
    client.lavalink.nodeManager.on("error", (node, error, payload) => {
        console.error(`[lavalink] node error: ${node.id}`, error, payload);
    });
    client.lavalink.on("trackError", (player, track, payload) => {
        console.error(`[music] track error guild=${player.guildId} title=${track?.info?.title ?? "unknown"}`, payload?.exception?.message ?? payload);
    });
    client.lavalink.on("trackStuck", (player, track, payload) => {
        console.error(`[music] track stuck guild=${player.guildId} title=${track?.info?.title ?? "unknown"}`, payload);
    });
    await (0, lavalink_1.waitForLavalinkReady)();
    await client.lavalink.init({
        id: readyClient.user.id,
        username: runtimeConfig.lavalink.username,
    });
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    await (0, interactionRouter_1.handleChatInputInteraction)(interaction);
});
void client.login(TOKEN);
client.on("messageCreate", async (message) => {
    if (message.guildId && (0, data_1.getMaintenanceEnabled)(message.guildId))
        return;
    await (0, music_1.handleMusicMessage)(message);
});
