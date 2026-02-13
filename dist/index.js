"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const handlers_1 = require("./ai/handlers");
const help_1 = require("./commands/help");
const maintenance_1 = require("./commands/maintenance");
const members_1 = require("./commands/members");
const menu_1 = require("./commands/menu");
const ping_1 = require("./commands/ping");
const reset_1 = require("./commands/reset");
const stats_1 = require("./commands/stats");
const suiminbunihaire_1 = require("./commands/suiminbunihaire");
const top_1 = require("./commands/top");
const runtime_1 = require("./config/runtime");
const commands_1 = require("./constants/commands");
const messages_1 = require("./constants/messages");
const data_1 = require("./data");
const fileServer_1 = require("./fileserver/fileServer");
const lavalink_1 = require("./lavalink");
const logging_1 = require("./logging");
const music_1 = require("./music");
const formatCount_1 = require("./utils/formatCount");
const sbkRandom_1 = require("./utils/sbkRandom");
const runtimeConfig = (0, runtime_1.getRuntimeConfig)();
const TOKEN = runtimeConfig.discord.token;
if (!TOKEN) {
    throw new Error("Missing required environment variable: TOKEN");
}
(0, fileServer_1.startFileServer)();
const OWNER_IDS = runtimeConfig.discord.ownerIds;
const IMMUNE_IDS = runtimeConfig.discord.immuneIds;
const MAX_REASON_LENGTH = runtimeConfig.app.maxLogReasonLength;
const ROOT_SLASH_HANDLERS = {
    [commands_1.SLASH_COMMAND.ping]: ping_1.handlePing,
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
function hasAdminOrOwnerPermission(interaction) {
    const isAdmin = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ??
        false;
    const isOwner = OWNER_IDS.has(interaction.user.id);
    return isAdmin || isOwner;
}
function normalizeCountInput(raw) {
    try {
        const parsed = BigInt(raw);
        return parsed < 0n ? 0n : parsed;
    }
    catch {
        return 0n;
    }
}
async function handleSbk(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "サーバー内で使ってね。",
            ephemeral: true,
        });
        return;
    }
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildUnavailable,
            ephemeral: true,
        });
        return;
    }
    const targetUser = interaction.options.getUser("user", true);
    if (targetUser.bot || targetUser.id === interaction.client.user?.id) {
        await interaction.reply({
            content: "BOTは対象外です。",
            ephemeral: true,
        });
        return;
    }
    if ((0, data_1.isImmune)(guildId, targetUser.id) || IMMUNE_IDS.has(targetUser.id)) {
        await interaction.reply({
            content: "このユーザーはしばき免除のため実行できません。",
            ephemeral: true,
        });
        return;
    }
    const { min: sbkMin, max: sbkMax } = (0, data_1.getSbkRange)(guildId);
    const countRaw = interaction.options.getString("count");
    let reason = interaction.options.getString("reason") ?? (0, sbkRandom_1.randomReason)();
    if (countRaw && !/^\d+$/.test(countRaw)) {
        await interaction.reply({
            content: "count は数字で入力してね。",
            ephemeral: true,
        });
        return;
    }
    let count = countRaw ? BigInt(countRaw) : BigInt((0, sbkRandom_1.randomInt)(sbkMin, sbkMax));
    if (count < 1n)
        count = 1n;
    const min = BigInt(sbkMin);
    const max = BigInt(sbkMax);
    if (count < min)
        count = min;
    if (count > max)
        count = max;
    const nextCount = (0, data_1.addCountGuild)(guildId, targetUser.id, count, interaction.user.id, reason);
    const member = await interaction.guild?.members
        .fetch(targetUser.id)
        .catch(() => null);
    const displayName = member?.displayName ?? targetUser.tag;
    if (reason.length > MAX_REASON_LENGTH) {
        reason = `${reason.slice(0, MAX_REASON_LENGTH)}…`;
    }
    await interaction.reply(`**${displayName}** を **${(0, formatCount_1.formatBigIntJP)(count)}回** しばきました！\n` +
        `（累計 ${(0, formatCount_1.formatBigIntJP)(nextCount)}回 / 今回 +${(0, formatCount_1.formatBigIntJP)(count)}回）\n` +
        `理由: ${reason}`);
    await (0, logging_1.sendLog)(interaction, interaction.user.id, targetUser.id, reason, count, nextCount);
}
async function handleCheck(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: "サーバー内で使用してください。",
            ephemeral: true,
        });
        return;
    }
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildUnavailable,
            ephemeral: true,
        });
        return;
    }
    const target = interaction.options.getUser("user", true);
    const store = (0, data_1.loadGuildStore)(guildId);
    const count = store.counts[target.id] ?? 0n;
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.tag;
    await interaction.reply({
        content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
        allowedMentions: { parse: [] },
    });
}
async function handleControl(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildOnly,
            ephemeral: true,
        });
        return;
    }
    if (!hasAdminOrOwnerPermission(interaction)) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.noPermissionAdminOrDev,
            ephemeral: true,
        });
        return;
    }
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildUnavailable,
            ephemeral: true,
        });
        return;
    }
    const target = interaction.options.getUser("user", true);
    const newCountRaw = interaction.options.getString("count", true);
    const nextCount = normalizeCountInput(newCountRaw);
    const after = (0, data_1.setCountGuild)(guildId, target.id, nextCount);
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.tag;
    await interaction.reply({
        content: `**${displayName}** のしばかれ回数を **${after} 回** に設定しました。`,
        allowedMentions: { parse: [] },
        ephemeral: true,
    });
}
async function handleImmune(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildOnly,
            ephemeral: true,
        });
        return;
    }
    if (!hasAdminOrOwnerPermission(interaction)) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.noPermissionAdminOrDev,
            ephemeral: true,
        });
        return;
    }
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: messages_1.COMMON_MESSAGES.guildUnavailable,
            ephemeral: true,
        });
        return;
    }
    const subCommand = interaction.options.getSubcommand();
    if (subCommand === "add") {
        const user = interaction.options.getUser("user", true);
        if (user.bot) {
            await interaction.reply({
                content: "BOTはそもそもしばけません。",
                ephemeral: true,
            });
            return;
        }
        const added = (0, data_1.addImmuneId)(guildId, user.id);
        await interaction.reply({
            content: added
                ? `\`${user.tag}\` を免除リストに追加しました。`
                : `\`${user.tag}\` はすでに免除リストに存在します。`,
            allowedMentions: { parse: [] },
            ephemeral: true,
        });
        return;
    }
    if (subCommand === "remove") {
        const user = interaction.options.getUser("user", true);
        const removed = (0, data_1.removeImmuneId)(guildId, user.id);
        await interaction.reply({
            content: removed
                ? `\`${user.tag}\` を免除リストから削除しました。`
                : `\`${user.tag}\` は免除リストにありません。`,
            allowedMentions: { parse: [] },
            ephemeral: true,
        });
        return;
    }
    if (subCommand === "list") {
        const localIds = (0, data_1.getImmuneList)(guildId);
        const globalIds = Array.from(IMMUNE_IDS);
        const localText = localIds.length
            ? localIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
            : "（なし）";
        const globalText = globalIds.length
            ? globalIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
            : "（なし）";
        await interaction.reply({
            embeds: [
                {
                    title: "🛡️ しばき免除リスト",
                    fields: [
                        { name: "ギルド免除", value: localText },
                        { name: "グローバル免除（.env IMMUNE_IDS）", value: globalText },
                    ],
                },
            ],
            allowedMentions: { parse: [] },
            ephemeral: true,
        });
    }
}
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
    if (commandName === commands_1.SLASH_COMMAND.sbk) {
        await handleSbk(interaction);
        return;
    }
    if (commandName === commands_1.SLASH_COMMAND.check) {
        await handleCheck(interaction);
        return;
    }
    if (commandName === commands_1.SLASH_COMMAND.control) {
        await handleControl(interaction);
        return;
    }
    if (commandName === commands_1.SLASH_COMMAND.immune) {
        await handleImmune(interaction);
        return;
    }
    if ((0, handlers_1.isAiSlashCommand)(commandName)) {
        await (0, handlers_1.handleAiSlashCommand)(interaction);
        return;
    }
    const handler = ROOT_SLASH_HANDLERS[commandName];
    if (handler) {
        await handler(interaction);
    }
});
void client.login(TOKEN);
client.on("messageCreate", async (message) => {
    if (message.guildId && (0, data_1.getMaintenanceEnabled)(message.guildId))
        return;
    await (0, music_1.handleMusicMessage)(message);
});
