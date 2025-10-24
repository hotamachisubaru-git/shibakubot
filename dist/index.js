"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds] });
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
// ---- データ保存まわり ----
const ROOT_DATA = path_1.default.join(process.cwd(), 'data.json');
const LEGACY_DATA = path_1.default.join(process.cwd(), 'src', 'data.json');
function loadData() {
    try {
        if (fs_1.default.existsSync(ROOT_DATA)) {
            return JSON.parse(fs_1.default.readFileSync(ROOT_DATA, 'utf8'));
        }
        if (fs_1.default.existsSync(LEGACY_DATA)) {
            const d = JSON.parse(fs_1.default.readFileSync(LEGACY_DATA, 'utf8'));
            // 旧ファイルがあれば移行
            fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(d, null, 2));
            return d;
        }
    }
    catch { /* 何もしない（新規） */ }
    return {};
}
function saveData(data) {
    fs_1.default.writeFileSync(ROOT_DATA, JSON.stringify(data, null, 2));
}
function addCount(data, userId) {
    const next = (data[userId] ?? 0) + 1;
    data[userId] = next;
    saveData(data);
    return next;
}
function getTop(data, limit = 10) {
    return Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
// ---- Bot本体 ----
client.once(discord_js_1.Events.ClientReady, b => {
    console.log(`✅ ログイン完了: ${b.user.tag}`);
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    // 毎回読む（超小規模なので十分シンプル）
    const data = loadData();
    if (interaction.commandName === 'ping') {
        // 返信を送信
        await interaction.reply({ content: '📡 測定中...' });
        // 返信メッセージを取得
        const sent = await interaction.fetchReply();
        const ping = sent.createdTimestamp - interaction.createdTimestamp;
        const wsPing = Math.round(interaction.client.ws.ping);
        await interaction.editReply(`🏓 Pong! 応答速度: **${ping}ms**`);
        return;
    }
    if (interaction.commandName === 'sbk') {
        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason', true);
        const count = addCount(data, user.id);
        await interaction.reply(`**${user.tag}** がしばかれました！（累計 ${count} 回）\n理由: ${reason}`);
        if (LOG_CHANNEL_ID && interaction.guild) {
            const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (ch && ch.type === discord_js_1.ChannelType.GuildText) {
                await ch.send(`${interaction.user.tag} → ${user.tag}\n理由: ${reason}\n累計: ${count} 回`);
            }
        }
        return;
    }
    if (interaction.commandName === 'check') {
        const user = interaction.options.getUser('user', true);
        const count = data[user.id] ?? 0;
        await interaction.reply(`**${user.tag}** は今までに ${count} 回 しばかれました。`);
        return;
    }
    if (interaction.commandName === 'top') {
        const limit = interaction.options.getInteger('limit') ?? 10;
        const top = getTop(data, limit);
        if (top.length === 0) {
            await interaction.reply('まだ誰も しばかれていません。');
            return;
        }
        // 1〜3位にだけメダル、それ以降は番号
        const medal = ['🥇', '🥈', '🥉'];
        const lines = top.map((e, i) => {
            const rank = medal[i] ?? `${i + 1}.`;
            return `${rank} <@${e.id}> — ${e.count} 回`;
        });
        await interaction.reply(`🏆 **しばかれランキング TOP${top.length}**\n${lines.join('\n')}`);
        return;
    }
});
client.login(process.env.TOKEN);
