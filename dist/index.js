"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:timers/promises");
const discord_js_1 = require("discord.js");
const guild_memory_1 = require("./ai/guild-memory");
const runtime_1 = require("./config/runtime");
const interactionRouter_1 = require("./discord/interactionRouter");
const data_1 = require("./data");
const consoleCommands_1 = require("./consoleCommands");
const fileServer_1 = require("./fileserver/fileServer");
const lavalink_1 = require("./lavalink");
const music_1 = require("./music");
const playbackRecovery_1 = require("./music/playbackRecovery");
const singleInstance_1 = require("./utils/singleInstance");
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const TOKEN = runtimeConfig.discord.token;
const nodeStatsLogCounters = new Map();
if (!TOKEN) {
    throw new Error("Missing required environment variable: TOKEN");
}
(0, singleInstance_1.ensureSingleInstance)();
(0, fileServer_1.startFileServer)();
function getBotVoiceDebugState(client, guildId) {
    const guild = client.guilds.cache.get(guildId);
    const me = guild?.members.me;
    const voice = me?.voice;
    if (!voice) {
        return null;
    }
    return {
        channelId: voice.channelId ?? null,
        channelName: voice.channel?.name ?? null,
        selfMute: voice.selfMute,
        selfDeaf: voice.selfDeaf,
        serverMute: voice.serverMute,
        serverDeaf: voice.serverDeaf,
        suppress: voice.suppress,
        streaming: voice.streaming,
        requestToSpeakTimestamp: voice.requestToSpeakTimestamp,
    };
}
function isNodeStatsPayload(payload) {
    return (typeof payload === "object" &&
        payload !== null &&
        "op" in payload &&
        payload.op === "stats");
}
async function logImmediateNodeStats(player) {
    const snapshots = [
        { label: "instant", waitMs: 0 },
        { label: "after-3s", waitMs: 3000 },
    ];
    for (const snapshot of snapshots) {
        if (snapshot.waitMs > 0) {
            await (0, promises_1.setTimeout)(snapshot.waitMs);
        }
        try {
            const voiceState = player.voice;
            const stats = await player.node.fetchStats();
            console.log(`[lavalink] node stats immediate: ${player.node.id}`, {
                snapshot: snapshot.label,
                guildId: player.guildId,
                playerVolume: player.volume,
                lavalinkVolume: player.lavalinkVolume,
                voiceConnected: voiceState.connected ?? null,
                voicePing: voiceState.ping ?? null,
                voiceEndpoint: voiceState.endpoint ?? null,
                voiceSessionIdPresent: Boolean(voiceState.sessionId),
                players: stats.players,
                playingPlayers: stats.playingPlayers,
                frameStats: stats.frameStats ?? null,
                systemLoad: stats.cpu.systemLoad,
                lavalinkLoad: stats.cpu.lavalinkLoad,
            });
        }
        catch (error) {
            console.warn(`[lavalink] node stats immediate failed: ${player.node.id}`, {
                snapshot: snapshot.label,
                guildId: player.guildId,
            }, error);
        }
    }
}
const client = (0, lavalink_1.initLavalink)(new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
}));
(0, consoleCommands_1.registerConsoleCommands)(client);
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
    client.lavalink.nodeManager.on("raw", (node, payload) => {
        if (!isNodeStatsPayload(payload)) {
            return;
        }
        if (!payload.playingPlayers || payload.playingPlayers <= 0) {
            nodeStatsLogCounters.delete(node.id);
            return;
        }
        const nextCount = (nodeStatsLogCounters.get(node.id) ?? 0) + 1;
        nodeStatsLogCounters.set(node.id, nextCount);
        if (nextCount % 5 !== 0) {
            return;
        }
        console.log(`[lavalink] node stats: ${node.id}`, {
            players: payload.players ?? null,
            playingPlayers: payload.playingPlayers ?? null,
            frameStats: payload.frameStats ?? null,
            systemLoad: payload.cpu?.systemLoad ?? null,
            lavalinkLoad: payload.cpu?.lavalinkLoad ?? null,
        });
    });
    client.lavalink.on("trackError", (player, track, payload) => {
        console.error(`[music] track error guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`, {
            message: payload?.exception?.message ?? "unknown",
            severity: payload?.exception?.severity ?? "unknown",
            cause: payload?.exception?.cause ?? "unknown",
            connected: player.connected,
            playing: player.playing,
            paused: player.paused,
            queueSize: player.queue.tracks.length,
            position: player.position,
            currentTitle: player.queue.current?.info?.title ?? null,
            botVoiceState: getBotVoiceDebugState(client, player.guildId),
        });
        void (0, playbackRecovery_1.recoverPlaybackWithYtDlp)(client, player, track, payload);
    });
    client.lavalink.on("trackStart", (player, track) => {
        const voiceState = player.voice;
        console.log(`[music] track start guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`, {
            connected: player.connected,
            playing: player.playing,
            paused: player.paused,
            queueSize: player.queue.tracks.length,
            position: player.position,
            volume: player.volume,
            lavalinkVolume: player.lavalinkVolume,
            voiceConnected: voiceState.connected ?? null,
            voicePing: voiceState.ping ?? null,
            voiceEndpoint: voiceState.endpoint ?? null,
            botVoiceState: getBotVoiceDebugState(client, player.guildId),
        });
        void logImmediateNodeStats(player);
    });
    client.lavalink.on("trackEnd", (player, track, payload) => {
        console.log(`[music] track end guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`, {
            reason: payload?.reason ?? "unknown",
            connected: player.connected,
            playing: player.playing,
            paused: player.paused,
            queueSize: player.queue.tracks.length,
            position: player.position,
            botVoiceState: getBotVoiceDebugState(client, player.guildId),
        });
    });
    client.lavalink.on("trackStuck", (player, track, payload) => {
        console.error(`[music] track stuck guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`, {
            payload,
            connected: player.connected,
            playing: player.playing,
            paused: player.paused,
            queueSize: player.queue.tracks.length,
            position: player.position,
            currentTitle: player.queue.current?.info?.title ?? null,
            botVoiceState: getBotVoiceDebugState(client, player.guildId),
        });
        void (0, playbackRecovery_1.recoverPlaybackWithYtDlp)(client, player, track, payload);
    });
    await (0, lavalink_1.waitForLavalinkReady)();
    await client.lavalink.init({
        id: readyClient.user.id,
        username: runtimeConfig.lavalink.username,
    });
    void (0, guild_memory_1.refreshGuildMemoriesOnStartup)(client.guilds.cache.values());
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
    (0, guild_memory_1.notifyGuildMessage)(message);
    await (0, music_1.handleMusicMessage)(message);
});
client.on(discord_js_1.Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id !== client.user?.id && oldState.id !== client.user?.id) {
        return;
    }
    const state = newState.id === client.user?.id ? newState : oldState;
    console.log(`[voice] bot state guild=${state.guild.id}`, {
        oldChannelId: oldState.channelId ?? null,
        newChannelId: newState.channelId ?? null,
        selfMute: newState.selfMute,
        selfDeaf: newState.selfDeaf,
        serverMute: newState.serverMute,
        serverDeaf: newState.serverDeaf,
        suppress: newState.suppress,
        streaming: newState.streaming,
        requestToSpeakTimestamp: newState.requestToSpeakTimestamp,
    });
});
