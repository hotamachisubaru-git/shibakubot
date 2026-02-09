"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sbkRandom_1 = require("./utils/sbkRandom");
const lavalink_client_1 = require("lavalink-client");
const discord_js_1 = require("discord.js");
const data_1 = require("./data");
const logging_1 = require("./logging");
const top_1 = require("./commands/top");
const members_1 = require("./commands/members");
const menu_1 = require("./commands/menu");
const help_1 = require("./commands/help");
const maintenance_1 = require("./commands/maintenance");
const ping_1 = require("./commands/ping");
const reset_1 = require("./commands/reset");
const stats_1 = require("./commands/stats");
const suiminbunihaire_1 = require("./commands/suiminbunihaire");
const music_1 = require("./music");
const formatCount_1 = require("./utils/formatCount");
function parseCsvIds(raw) {
    if (!raw)
        return [];
    return raw
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}
function parsePositiveInt(raw, fallback) {
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return parsed;
}
function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
const TOKEN = requiredEnv("TOKEN");
const UPLOAD_DIR = node_path_1.default.resolve(process.env.FILE_DIR ?? "./files");
node_fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
const FILE_HOST = "play.hotamachi.jp";
const FILE_PORT = parsePositiveInt(process.env.FILE_PORT, 3001);
const app = (0, express_1.default)();
app.use("/uploads", express_1.default.static(UPLOAD_DIR));
app.listen(FILE_PORT, FILE_HOST, () => {
    console.log(`📦 Upload file server: http://${FILE_HOST}:${FILE_PORT}/uploads/`);
});
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
});
// ---- Lavalink 接続設定 ----
const lavalink = new lavalink_client_1.LavalinkManager({
    nodes: [
        {
            id: "local",
            host: "127.0.0.1",
            port: 2333,
            authorization: "youshallnotpass", // application.yml の password
            secure: false,
        },
    ],
    // 🔹 ここは sendPayload ではなく sendToShard
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild)
            return;
        guild.shard.send(payload);
    },
    client: {
        id: "0", // ここはダミーでOK（後で init で上書き）
        username: "shibaku-bot",
    },
    // （オプション）お好みで
    autoSkip: true,
    playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        clientBasedPositionUpdateInterval: 150,
        volumeDecrementer: 0.75,
        onDisconnect: {
            autoReconnect: true,
            destroyPlayer: false,
        },
        onEmptyQueue: {
            destroyAfterMs: 60000,
        },
    },
    queueOptions: {
        maxPreviousTracks: 25,
    },
});
// client にぶら下げる
client.lavalink = lavalink;
// Discord の Raw イベントを Lavalink に渡す
client.on("raw", (data) => {
    void client.lavalink.sendRawData(data);
});
// ---- 定数 ----
const OWNER_IDS = parseCsvIds(process.env.OWNER_IDS);
const IMMUNE_IDS = parseCsvIds(process.env.IMMUNE_IDS);
// Ready
client.once(discord_js_1.Events.ClientReady, async (b) => {
    console.log(`✅ ログイン完了: ${b.user.tag}`);
    // Lavalink と Bot 情報を紐付け（ヘッダーは ASCII のみ）
    await client.lavalink.init({
        id: b.user.id,
        username: "shibakubot", // 日本語を入れない
    });
});
// ---- コマンドハンドラ ----
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const name = interaction.commandName;
    if (interaction.inGuild()) {
        const gid = interaction.guildId;
        if (!gid)
            return;
        if ((0, data_1.getMaintenanceEnabled)(gid) && name !== "maintenance" && name !== "mt") {
            await interaction.reply({
                content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
                ephemeral: true,
            });
            return;
        }
    }
    if (name === "ping") {
        await (0, ping_1.handlePing)(interaction);
        return;
    }
    // /sbk
    if (name === "sbk") {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "サーバー内で使ってね。",
                ephemeral: true,
            });
            return;
        }
        const gid = interaction.guildId;
        if (!gid) {
            await interaction.reply({
                content: "サーバー情報を取得できませんでした。",
                ephemeral: true,
            });
            return;
        }
        const user = interaction.options.getUser("user", true);
        if (user.bot || user.id === interaction.client.user?.id) {
            await interaction.reply({
                content: "BOTは対象外です。",
                ephemeral: true,
            });
            return;
        }
        const localImmune = (0, data_1.isImmune)(gid, user.id);
        const globalImmune = IMMUNE_IDS.includes(user.id);
        if (localImmune || globalImmune) {
            await interaction.reply({
                content: "このユーザーはしばき免除のため実行できません。",
                ephemeral: true,
            });
            return;
        }
        const { min: SBK_MIN, max: SBK_MAX } = (0, data_1.getSbkRange)(gid);
        // ★ optional 取得（count は string で受ける）
        const countStr = interaction.options.getString("count");
        let reason = interaction.options.getString("reason");
        // ★ count の決定（BigInt）
        let countBig;
        if (!countStr) {
            // 未指定 → ランダム（この時だけ範囲内）
            const n = (0, sbkRandom_1.randomInt)(SBK_MIN, SBK_MAX);
            countBig = BigInt(n);
        }
        else {
            // 指定 → BigIntとしてそのまま通す（上限で丸めない）
            if (!/^\d+$/.test(countStr)) {
                await interaction.reply({
                    content: "count は数字で入力してね。",
                    ephemeral: true,
                });
                return;
            }
            countBig = BigInt(countStr);
            // 0回やマイナス（今回は許してない）を防ぐ最低保証
            if (countBig < 1n)
                countBig = 1n;
        }
        // 範囲補正（BigIntでやる）
        const minB = BigInt(SBK_MIN);
        const maxB = BigInt(SBK_MAX);
        if (countBig < minB)
            countBig = minB;
        if (countBig > maxB)
            countBig = maxB;
        // ★ reason 未指定 → ランダム
        if (!reason)
            reason = (0, sbkRandom_1.randomReason)();
        const nextCount = (0, data_1.addCountGuild)(gid, user.id, countBig, interaction.user.id, // actorId
        reason // reason（ランダム確定後のやつ）
        );
        const member = await interaction
            .guild.members.fetch(user.id)
            .catch(() => null);
        const display = member?.displayName ?? user.tag;
        const MAX_REASON = 2000;
        const safeReason = reason.length > MAX_REASON ? reason.slice(0, MAX_REASON) + "…" : reason;
        await interaction.reply(`**${display}** を **${(0, formatCount_1.formatBigIntJP)(countBig)}回** しばきました！\n` +
            `（累計 ${(0, formatCount_1.formatBigIntJP)(nextCount)}回 / 今回 +${(0, formatCount_1.formatBigIntJP)(countBig)}回）\n` +
            `理由: ${safeReason}`);
        await (0, logging_1.sendLog)(interaction, interaction.user.id, user.id, reason, countBig, nextCount);
    }
    // /check
    if (name === "check") {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "サーバー内で使用してください。",
                ephemeral: true,
            });
            return;
        }
        const gid = interaction.guildId;
        if (!gid) {
            await interaction.reply({
                content: "サーバー情報を取得できませんでした。",
                ephemeral: true,
            });
            return;
        }
        const target = interaction.options.getUser("user", true);
        const store = (0, data_1.loadGuildStore)(gid);
        const count = store.counts[target.id] ?? 0n;
        const member = await interaction
            .guild.members.fetch(target.id)
            .catch(() => null);
        const displayName = member?.displayName ?? target.tag;
        await interaction.reply({
            content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
            allowedMentions: { parse: [] },
        });
        return;
    }
    // 外部ハンドラ
    if (name === "menu") {
        await (0, menu_1.handleMenu)(interaction);
        return;
    }
    if (name === "suimin") {
        await (0, suiminbunihaire_1.handleSuimin)(interaction);
        return;
    }
    if (name === "members") {
        await (0, members_1.handleMembers)(interaction);
        return;
    }
    if (name === "help") {
        await (0, help_1.handleHelp)(interaction);
        return;
    }
    if (name === "maintenance" || name === "mt") {
        await (0, maintenance_1.handleMaintenance)(interaction);
        return;
    }
    if (name === "stats") {
        await (0, stats_1.handleStats)(interaction);
        return;
    }
    if (name === "reset") {
        await (0, reset_1.handleReset)(interaction);
        return;
    }
    if (name === "top") {
        await (0, top_1.handleTop)(interaction);
        return;
    }
    // /control（管理者 / 開発者のみ）
    if (name === "control") {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "このコマンドはサーバー内でのみ使用できます。",
                ephemeral: true,
            });
            return;
        }
        const isAdmin = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ??
            false;
        const isOwner = OWNER_IDS.includes(interaction.user.id);
        if (!isAdmin && !isOwner) {
            await interaction.reply({
                content: "権限がありません。（管理者または開発者のみ）",
                ephemeral: true,
            });
            return;
        }
        const gid = interaction.guildId;
        if (!gid) {
            await interaction.reply({
                content: "サーバー情報を取得できませんでした。",
                ephemeral: true,
            });
            return;
        }
        const target = interaction.options.getUser("user", true);
        const newCountRaw = interaction.options.getString("count", true);
        let newCount;
        try {
            newCount = BigInt(newCountRaw);
            if (newCount < 0n)
                newCount = 0n;
        }
        catch {
            newCount = 0n;
        }
        const after = (0, data_1.setCountGuild)(gid, target.id, newCount);
        const store = (0, data_1.loadGuildStore)(gid);
        store.counts[target.id] = after;
        const member = await interaction
            .guild.members.fetch(target.id)
            .catch(() => null);
        const displayName = member?.displayName ?? target.tag;
        await interaction.reply({
            content: `**${displayName}** のしばかれ回数を **${after} 回** に設定しました。`,
            allowedMentions: { parse: [] },
            ephemeral: true,
        });
        return;
    }
    // /immune（管理者 / 開発者のみ） …（既存のまま）
    if (name === "immune") {
        if (!interaction.inGuild()) {
            await interaction.reply({
                content: "このコマンドはサーバー内でのみ使用できます。",
                ephemeral: true,
            });
            return;
        }
        const isAdmin = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ??
            false;
        const isOwner = OWNER_IDS.includes(interaction.user.id);
        if (!isAdmin && !isOwner) {
            await interaction.reply({
                content: "権限がありません。（管理者または開発者のみ）",
                ephemeral: true,
            });
            return;
        }
        const sub = interaction.options.getSubcommand();
        const gid = interaction.guildId;
        if (!gid) {
            await interaction.reply({
                content: "サーバー情報を取得できませんでした。",
                ephemeral: true,
            });
            return;
        }
        if (sub === "add") {
            const u = interaction.options.getUser("user", true);
            if (u.bot) {
                await interaction.reply({
                    content: "BOTはそもそもしばけません。",
                    ephemeral: true,
                });
                return;
            }
            const added = (0, data_1.addImmuneId)(gid, u.id);
            await interaction.reply({
                content: added
                    ? `\`${u.tag}\` を免除リストに追加しました。`
                    : `\`${u.tag}\` はすでに免除リストに存在します。`,
                allowedMentions: { parse: [] },
                ephemeral: true,
            });
            return;
        }
        if (sub === "remove") {
            const u = interaction.options.getUser("user", true);
            const removed = (0, data_1.removeImmuneId)(gid, u.id);
            await interaction.reply({
                content: removed
                    ? `\`${u.tag}\` を免除リストから削除しました。`
                    : `\`${u.tag}\` は免除リストにありません。`,
                allowedMentions: { parse: [] },
                ephemeral: true,
            });
            return;
        }
        if (sub === "list") {
            const ids = (0, data_1.getImmuneList)(gid);
            const global = IMMUNE_IDS;
            const textLocal = ids.length
                ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join("\n")
                : "（なし）";
            const textGlobal = global.length
                ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join("\n")
                : "（なし）";
            await interaction.reply({
                embeds: [
                    {
                        title: "🛡️ しばき免除リスト",
                        fields: [
                            { name: "ギルド免除", value: textLocal },
                            { name: "グローバル免除（.env IMMUNE_IDS）", value: textGlobal },
                        ],
                    },
                ],
                allowedMentions: { parse: [] },
                ephemeral: true,
            });
            return;
        }
    }
});
void client.login(TOKEN);
// index.ts 最後あたり
client.on("messageCreate", async (message) => {
    if (message.guildId && (0, data_1.getMaintenanceEnabled)(message.guildId))
        return;
    await (0, music_1.handleMusicMessage)(message);
});
