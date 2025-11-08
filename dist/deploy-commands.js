"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/deploy-commands.ts
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
        .setName('check')
        .setDescription('指定ユーザーのしばかれ回数を見る')
        .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)),
    new discord_js_1.SlashCommandBuilder().setName('top').setDescription('しばきランキングを表示'),
    new discord_js_1.SlashCommandBuilder().setName('members').setDescription('全メンバー（BOT除外）のしばかれ回数一覧'),
    new discord_js_1.SlashCommandBuilder()
        .setName('control')
        .setDescription('回数を直接設定（管理者/開発者のみ）')
        .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true))
        .addIntegerOption(o => o.setName('count').setDescription('設定回数').setRequired(true))
        .setDMPermission(false),
    new discord_js_1.SlashCommandBuilder()
        .setName('immune')
        .setDescription('しばき免除ユーザーの管理（管理者/開発者のみ）')
        .addSubcommand(sub => sub
        .setName('add')
        .setDescription('ユーザーを免除リストに追加')
        .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true)))
        .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('ユーザーを免除リストから削除')
        .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true)))
        .addSubcommand(sub => sub
        .setName('list')
        .setDescription('免除リストを表示'))
        .setDMPermission(false),
    new discord_js_1.SlashCommandBuilder()
        .setName('reset')
        .setDescription('全データをリセット（開発者のみ）')
        .addBooleanOption(o => o.setName('all').setDescription('全員の回数をリセット')),
    new discord_js_1.SlashCommandBuilder().setName('help').setDescription('コマンド一覧を表示'),
    new discord_js_1.SlashCommandBuilder().setName('stats').setDescription('しばき統計情報を表示（管理者/開発者のみ）').setDMPermission(false),
    // ★ 追加: /menu
    new discord_js_1.SlashCommandBuilder().setName('menu').setDescription('クイックメニューを開く'),
    // ★ 追加: /room
    new discord_js_1.SlashCommandBuilder()
        .setName('room')
        .setDescription('本日の大門なおゲーセンの情報')
        .addStringOption(o => o.setName('game')
        .setDescription('ゲーム名')
        .setRequired(true))
        .addIntegerOption(o => o.setName('area')
        .setDescription('エリア番号')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(200))
        .addStringOption(o => o.setName('pass')
        .setDescription('パスワード')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(18))
        .setDMPermission(false)
].map(c => c.toJSON()); // ← ここでしっかり配列を閉じる
// ← ここからは配列の“外”なのでエラーにならない
const rest = new discord_js_1.REST({ version: '10' }).setToken(token);
(async () => {
    try {
        console.log(`[REST] ${commands.length} 個のアプリケーションコマンドを登録します。`);
        // グローバルコマンドとしてデプロイ
        if (guildIds.length === 0) {
            console.log('[REST] GUILD_IDS が設定されていないため、グローバルコマンドとしてデプロイします。');
            const data = await rest.put(discord_js_1.Routes.applicationCommands(clientId), { body: commands });
            console.log(`[REST] ${data.length} 個のグローバルコマンドの登録に成功しました。`);
        }
        else {
            // ギルドコマンドとしてデプロイ
            for (const guildId of guildIds) {
                console.log(`[REST] ギルドID: ${guildId} へコマンドをデプロイ中...`);
                const data = await rest.put(discord_js_1.Routes.applicationGuildCommands(clientId, guildId), { body: commands });
                console.log(`[REST] ギルドID: ${guildId} に ${data.length} 個のコマンドの登録に成功しました。`);
            }
        }
    }
    catch (error) {
        console.error('[REST] コマンドデプロイ中にエラーが発生しました:', error);
    }
})();
