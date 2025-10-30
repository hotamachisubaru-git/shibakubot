"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = (process.env.GUILD_IDS ?? process.env.GUILD_ID ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const commands = [
    new discord_js_1.SlashCommandBuilder().setName('ping').setDescription('疎通確認'),
    new discord_js_1.SlashCommandBuilder()
        .setName('sbk')
        .setDescription('指定したユーザーをしばく')
        .addUserOption(o => o.setName('user').setDescription('相手').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('理由').setRequired(true))
        .addIntegerOption(o => o.setName('count').setDescription('回数（省略時1）')),
    new discord_js_1.SlashCommandBuilder()
        .setName('check').setDescription('指定ユーザーのしばかれ回数を見る')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)),
    new discord_js_1.SlashCommandBuilder().setName('top').setDescription('しばきランキングを表示'),
    new discord_js_1.SlashCommandBuilder().setName('members').setDescription('全メンバー（BOT除外）のしばかれ回数一覧'),
    new discord_js_1.SlashCommandBuilder()
        .setName('control')
        .setDescription('回数を直接設定（管理者/開発者のみ）')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true))
        .addIntegerOption(o => o.setName('count').setDescription('設定する回数（0以上）').setRequired(true).setMinValue(0))
        .setDMPermission(false),
    new discord_js_1.SlashCommandBuilder()
        .setName('immune')
        .setDescription('しばき免除を操作（管理者/開発者のみ）')
        .addSubcommand(sc => sc.setName('add').setDescription('免除に追加')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)))
        .addSubcommand(sc => sc.setName('remove').setDescription('免除から削除')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('免除リストを表示'))
        .setDMPermission(false),
].map(c => c.toJSON());
const rest = new discord_js_1.REST({ version: '10' }).setToken(token);
(async () => {
    try {
        if (guildIds.length === 0)
            throw new Error('GUILD_IDS or GUILD_ID がありません');
        console.log('⏫ コマンド登録中...');
        for (const gid of guildIds) {
            await rest.put(discord_js_1.Routes.applicationGuildCommands(clientId, gid), { body: commands });
            console.log(`✅ 登録完了: guild=${gid}`);
        }
    }
    catch (err) {
        console.error('❌ 登録失敗:', err);
    }
})();
