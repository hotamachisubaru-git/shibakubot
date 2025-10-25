"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/deploy-commands.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName('ping')
        .setDescription('疎通確認'),
    new discord_js_1.SlashCommandBuilder()
        .setName('sbk')
        .setDescription('指定したユーザーをしばく')
        .addUserOption(o => o.setName('user').setDescription('相手').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('理由').setRequired(true))
        .addIntegerOption(o => o.setName('count').setDescription('回数（省略時1）')),
    new discord_js_1.SlashCommandBuilder()
        .setName('check')
        .setDescription('指定ユーザーのしばかれ回数を見る')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)),
    new discord_js_1.SlashCommandBuilder()
        .setName('top')
        .setDescription('しばきランキングを表示'),
    new discord_js_1.SlashCommandBuilder()
        .setName('control')
        .setDescription('指定ユーザーのしばかれ回数を調整（指定値に変更）')
        .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true))
        .addIntegerOption(o => o.setName('count')
        .setDescription('設定する回数（0以上）')
        .setRequired(true)
        .setMinValue(0))
        .setDefaultMemberPermissions(discord_js_1.PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    // ✅ 追加：/members
    new discord_js_1.SlashCommandBuilder()
        .setName('members')
        .setDescription('全メンバー（BOT除外）のしばかれ回数一覧')
].map(c => c.toJSON());
const rest = new discord_js_1.REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log('⏫ コマンド登録中...');
        await rest.put(discord_js_1.Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log('✅ 登録完了');
    }
    catch (err) {
        console.error('❌ 登録失敗:', err);
    }
})();
