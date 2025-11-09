"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const data_1 = require("./data");
const top_1 = require("./commands/top");
const members_1 = require("./commands/members");
const menu_1 = require("./commands/menu");
const daimongamecenter_1 = require("./commands/daimongamecenter");
const help_1 = require("./commands/help");
const reset_1 = require("./commands/reset");
const stats_1 = require("./commands/stats");
// ---- ユーティリティ：表示名（ギルドのニックネーム優先）
async function getDisplayName(interaction, userId) {
    const g = interaction.guild;
    if (g) {
        const m = await g.members.fetch(userId).catch(() => null);
        if (m?.displayName)
            return m.displayName;
    }
    const u = await interaction.client.users.fetch(userId).catch(() => null);
    return u?.tag ?? userId;
}
// ---- クライアント設定 ----
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers],
});
// ---- 定数 ----
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
client.once(discord_js_1.Events.ClientReady, b => {
    console.log(`✅ ログイン完了: ${b.user.tag}`);
});
// ---- コマンドハンドラ ----
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const name = interaction.commandName;
    // /ping
    if (name === 'ping') {
        const t0 = performance.now();
        await interaction.deferReply({ ephemeral: true });
        const apiPing = Math.round(performance.now() - t0);
        let wsPing = interaction.client.ws?.ping ?? -1;
        for (let waited = 0; wsPing < 0 && waited < 5000; waited += 200) {
            await new Promise(r => setTimeout(r, 200));
            wsPing = interaction.client.ws?.ping ?? -1;
        }
        const wsText = wsPing >= 0 ? `${Math.round(wsPing)}ms` : '取得できませんでした';
        await interaction.editReply(`API: **${apiPing}ms** | WS: **${wsText}**`);
        return;
    }
    // /sbk
    if (name === 'sbk') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
            return;
        }
        const gid = interaction.guildId;
        const user = interaction.options.getUser('user', true);
        // BOTは不可
        if (user.bot || user.id === interaction.client.user?.id) {
            await interaction.reply({ content: 'BOTは対象外です。', ephemeral: true, allowedMentions: { parse: [] } });
            return;
        }
        // 免除チェック（グローバル + ギルド）
        if ((0, data_1.isImmune)(gid, user.id) || (IMMUNE_IDS?.includes?.(user.id) ?? false)) {
            await interaction.reply({ content: 'このユーザーはしばき免除です。', ephemeral: true, allowedMentions: { parse: [] } });
            return;
        }
        // ★ ギルドごとの上限を参照
        const { min: SBK_MIN, max: SBK_MAX } = (0, data_1.getSbkRange)(gid);
        const countArg = Math.max(SBK_MIN, Math.min(SBK_MAX, interaction.options.getInteger('count') ?? SBK_MIN));
        const nextCount = (0, data_1.addCountGuild)(gid, user.id, countArg);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const display = member?.displayName ?? user.tag;
        const reason = interaction.options.getString('reason') ?? '理由なし';
        await interaction.reply(`**${display}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`);
        if (LOG_CHANNEL_ID) {
            const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (ch && ch.type === discord_js_1.ChannelType.GuildText) {
                await ch.send(`${interaction.user.tag} → ${display}\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`);
            }
        }
        return;
    }
    // /check
    if (name === 'check') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'サーバー内で使用してください。', ephemeral: true });
            return;
        }
        const gid = interaction.guildId;
        const target = interaction.options.getUser('user', true);
        const store = (0, data_1.loadGuildStore)(gid);
        const count = store.counts[target.id] ?? 0;
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        const displayName = member?.displayName ?? target.tag;
        await interaction.reply({
            content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
            allowedMentions: { parse: [] },
        });
        return;
    }
    // 外部ハンドラ
    if (name === 'menu') {
        await (0, menu_1.handleMenu)(interaction);
        return;
    }
    if (name === 'members') {
        await (0, members_1.handleMembers)(interaction);
        return;
    }
    if (name === 'room') {
        await (0, daimongamecenter_1.handleRoom)(interaction);
        return;
    }
    if (name === 'help') {
        await (0, help_1.handleHelp)(interaction);
        return;
    }
    if (name === 'stats') {
        await (0, stats_1.handleStats)(interaction);
        return;
    }
    if (name === 'reset') {
        await (0, reset_1.handleReset)(interaction);
        return;
    }
    if (name === 'top') {
        await (0, top_1.handleTop)(interaction);
        return;
    }
    // /control（管理者 / 開発者のみ）
    if (name === 'control') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
            return;
        }
        const isAdmin = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ?? false;
        const isOwner = OWNER_IDS.includes(interaction.user.id);
        if (!isAdmin && !isOwner) {
            await interaction.reply({ content: '権限がありません。（管理者または開発者のみ）', ephemeral: true });
            return;
        }
        const gid = interaction.guildId;
        const target = interaction.options.getUser('user', true);
        const newCountRaw = interaction.options.getInteger('count', true);
        const newCount = Math.max(0, newCountRaw);
        const store = (0, data_1.loadGuildStore)(gid);
        store.counts[target.id] = newCount;
        (0, data_1.saveGuildStore)(gid, store);
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        const displayName = member?.displayName ?? target.tag;
        await interaction.reply({
            content: `**${displayName}** のしばかれ回数を **${newCount} 回** に設定しました。`,
            allowedMentions: { parse: [] },
            ephemeral: true,
        });
        return;
    }
    // /immune（管理者 / 開発者のみ） …（既存のまま）
    if (name === 'immune') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
            return;
        }
        const isAdmin = interaction.memberPermissions?.has(discord_js_1.PermissionFlagsBits.Administrator) ?? false;
        const isOwner = OWNER_IDS.includes(interaction.user.id);
        if (!isAdmin && !isOwner) {
            await interaction.reply({ content: '権限がありません。（管理者または開発者のみ）', ephemeral: true });
            return;
        }
        const sub = interaction.options.getSubcommand();
        const gid = interaction.guildId;
        if (sub === 'add') {
            const u = interaction.options.getUser('user', true);
            if (u.bot) {
                await interaction.reply({ content: 'BOTはそもそもしばけません。', ephemeral: true });
                return;
            }
            const added = (0, data_1.addImmuneId)(gid, u.id);
            await interaction.reply({
                content: added ? `\`${u.tag}\` を免除リストに追加しました。` : `\`${u.tag}\` はすでに免除リストに存在します。`,
                allowedMentions: { parse: [] }, ephemeral: true
            });
            return;
        }
        if (sub === 'remove') {
            const u = interaction.options.getUser('user', true);
            const removed = (0, data_1.removeImmuneId)(gid, u.id);
            await interaction.reply({
                content: removed ? `\`${u.tag}\` を免除リストから削除しました。` : `\`${u.tag}\` は免除リストにありません。`,
                allowedMentions: { parse: [] }, ephemeral: true
            });
            return;
        }
        if (sub === 'list') {
            const ids = (0, data_1.getImmuneList)(gid);
            const global = IMMUNE_IDS;
            const textLocal = ids.length ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n') : '（なし）';
            const textGlobal = global.length ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n') : '（なし）';
            await interaction.reply({
                embeds: [{
                        title: '🛡️ しばき免除リスト',
                        fields: [
                            { name: 'ギルド免除', value: textLocal },
                            { name: 'グローバル免除（.env IMMUNE_IDS）', value: textGlobal }
                        ]
                    }],
                allowedMentions: { parse: [] }, ephemeral: true
            });
            return;
        }
    }
});
client.login(process.env.TOKEN);
