"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/deploy-commands.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const runtime_1 = require("./config/runtime");
const commandCatalog_1 = require("./discord/commandCatalog");
function resolveDeployConfig() {
    const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
    return {
        token: runtimeConfig.discord.token,
        clientId: runtimeConfig.discord.clientId,
        guildIds: runtimeConfig.discord.guildIds,
    };
}
function arrayCount(value) {
    return Array.isArray(value) ? value.length : 0;
}
function hasRawError(value) {
    return typeof value === "object" && value !== null && "rawError" in value;
}
const deployConfig = resolveDeployConfig();
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
// 環境チェック
if (!deployConfig.token ||
    !deployConfig.clientId ||
    deployConfig.guildIds.length === 0) {
    console.error("❌ 環境変数が不足しています。TOKEN, CLIENT_ID, GUILD_IDS を確認してください。");
    process.exit(1);
}
const commands = (0, commandCatalog_1.getSlashCommandJson)();
const rest = new discord_js_1.REST({ version: "10" }).setToken(deployConfig.token);
(async () => {
    console.log("⏫ コマンド登録中...");
    console.log(`   CLIENT_ID=${deployConfig.clientId}`);
    console.log(`   GUILD_IDS=${deployConfig.guildIds.join(", ")}`);
    try {
        // --- 任意: グローバルコマンドを全削除（残っていると古い表示が混在しがち） ---
        if (runtimeConfig.app.clearGlobalCommandsOnRegister) {
            console.log("🧹 グローバルコマンドを全削除します...");
            const res = await rest.put(discord_js_1.Routes.applicationCommands(deployConfig.clientId), {
                body: [],
            });
            console.log(`   ✔ グローバル削除完了（${arrayCount(res)} 件）`);
        }
        else {
            console.log("（グローバル削除はスキップ: CLEAR_GLOBAL=false）");
        }
        // --- ギルド単位で順次（直列）登録：レート制限を避け、失敗点を特定しやすくする ---
        for (const guildId of deployConfig.guildIds) {
            console.log(`📝 ギルド(${guildId}) に置換登録中...`);
            const registered = await rest.put(discord_js_1.Routes.applicationGuildCommands(deployConfig.clientId, guildId), { body: commands });
            console.log(`   ✔ 登録完了: guild=${guildId} / count=${arrayCount(registered)}`);
        }
        console.log("✅ すべての登録処理が完了しました。");
        process.exit(0);
    }
    catch (err) {
        // Discord 側のエラー内容を見やすく
        console.error("❌ 登録中にエラー:");
        if (hasRawError(err))
            console.error(err.rawError);
        console.error(err);
        process.exit(1);
    }
})();
