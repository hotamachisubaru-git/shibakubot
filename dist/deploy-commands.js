"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/deploy-commands.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || process.env.GUILD_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
// 環境チェック
if (!TOKEN || !CLIENT_ID || GUILD_IDS.length === 0) {
    console.error('❌ 環境変数が不足しています。TOKEN, CLIENT_ID, GUILD_IDS を確認してください。');
    process.exit(1);
}
// ---- ここで「/menu」だけを登録（他はUIから呼び出す前提） ----
const commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName('menu')
        .setDescription('しばくbot メニューを表示する')
        // 何か将来の拡張用に、サブコマンドやオプションを足すならここに追加
        .toJSON(),
];
const rest = new discord_js_1.REST({ version: '10' }).setToken(TOKEN);
(async () => {
    console.log('⏫ コマンド登録中...');
    console.log(`   CLIENT_ID=${CLIENT_ID}`);
    console.log(`   GUILD_IDS=${GUILD_IDS.join(', ')}`);
    try {
        // --- 任意: グローバルコマンドを全削除（残っていると古い表示が混在しがち） ---
        if ((process.env.CLEAR_GLOBAL || 'true').toLowerCase() === 'true') {
            console.log('🧹 グローバルコマンドを全削除します...');
            const res = await rest.put(discord_js_1.Routes.applicationCommands(CLIENT_ID), { body: [] });
            console.log(`   ✔ グローバル削除完了（${Array.isArray(res) ? res.length : 0} 件）`);
        }
        else {
            console.log('（グローバル削除はスキップ: CLEAR_GLOBAL=false）');
        }
        // --- ギルド単位で順次（直列）登録：レート制限を避け、失敗点を特定しやすくする ---
        for (const gid of GUILD_IDS) {
            console.log(`📝 ギルド(${gid}) に置換登録中...`);
            const registered = await rest.put(discord_js_1.Routes.applicationGuildCommands(CLIENT_ID, gid), { body: commands });
            console.log(`   ✔ 登録完了: guild=${gid} / count=${Array.isArray(registered) ? registered.length : 0}`);
        }
        console.log('✅ すべての登録処理が完了しました。');
        process.exit(0);
    }
    catch (err) {
        // Discord 側のエラー内容を見やすく
        console.error('❌ 登録中にエラー:');
        if (err?.rawError)
            console.error(err.rawError);
        console.error(err);
        process.exit(1);
    }
})();
