"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const handlers_1 = require("./ai/handlers");
const check_1 = require("./commands/check");
const control_1 = require("./commands/control");
const help_1 = require("./commands/help");
const immune_1 = require("./commands/immune");
const maintenance_1 = require("./commands/maintenance");
const members_1 = require("./commands/members");
const menu_1 = require("./commands/menu");
const ping_1 = require("./commands/ping");
const reset_1 = require("./commands/reset");
const sbk_1 = require("./commands/sbk");
const stats_1 = require("./commands/stats");
const suiminbunihaire_1 = require("./commands/suiminbunihaire");
const top_1 = require("./commands/top");
const runtime_1 = require("./config/runtime");
const commands_1 = require("./constants/commands");
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
const ROOT_SLASH_HANDLERS = {
    [commands_1.SLASH_COMMAND.ping]: ping_1.handlePing,
    [commands_1.SLASH_COMMAND.sbk]: sbk_1.handleSbk,
    [commands_1.SLASH_COMMAND.check]: check_1.handleCheck,
    [commands_1.SLASH_COMMAND.control]: control_1.handleControl,
    [commands_1.SLASH_COMMAND.immune]: immune_1.handleImmune,
    [commands_1.SLASH_COMMAND.menu]: menu_1.handleMenu,
    [commands_1.SLASH_COMMAND.suimin]: suiminbunihaire_1.handleSuimin,
    [commands_1.SLASH_COMMAND.members]: members_1.handleMembers,
    [commands_1.SLASH_COMMAND.help]: help_1.handleHelp,
    [commands_1.SLASH_COMMAND.maintenance]: maintenance_1.handleMaintenance,
    [commands_1.SLASH_COMMAND.maintenanceAlias]: maintenance_1.handleMaintenance,
    [commands_1.SLASH_COMMAND.stats]: stats_1.handleStats,
    [commands_1.SLASH_COMMAND.reset]: reset_1.handleReset,
    [commands_1.SLASH_COMMAND.top]: top_1.handleTop,
};
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
    await client.lavalink.init({
        id: readyClient.user.id,
        username: runtimeConfig.lavalink.username,
    });
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const commandName = interaction.commandName;
    if (interaction.guildId &&
        (0, data_1.getMaintenanceEnabled)(interaction.guildId) &&
        !(0, commands_1.isMaintenanceCommand)(commandName)) {
        await interaction.reply({
            content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
            ephemeral: true,
        });
        return;
    }
    if ((0, handlers_1.isAiSlashCommand)(commandName)) {
        await (0, handlers_1.handleAiSlashCommand)(interaction);
        return;
    }
    const handler = ROOT_SLASH_HANDLERS[commandName];
    if (!handler)
        return;
    await handler(interaction);
});
void client.login(TOKEN);
client.on("messageCreate", async (message) => {
    if (message.guildId && (0, data_1.getMaintenanceEnabled)(message.guildId))
        return;
    await (0, music_1.handleMusicMessage)(message);
});
