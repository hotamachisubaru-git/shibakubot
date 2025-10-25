"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const data_1 = require("./data");
const top_1 = require("./commands/top");
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers // ✅ /members に必要
    ]
});
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
client.once(discord_js_1.Events.ClientReady, b => {
    console.log(`✅ ログイン完了: ${b.user.tag}`);
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    // /ping
    if (interaction.commandName === 'ping') {
        await interaction.reply({ content: '測定中...' });
        const sent = await interaction.fetchReply();
        const ping = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`応答速度: **${ping}ms**`);
        return;
    }
    // 最新データ
    const data = (0, data_1.loadData)();
    // /sbk
    if (interaction.commandName === 'sbk') {
        const user = interaction.options.getUser('user', true);
        // ✅ すべてのBOT（自分含む）を除外
        if (user.bot || user.id === interaction.client.user?.id) {
            await interaction.reply({
                content: 'BOTをしばくことはできません。ざまぁｗ',
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
            return;
        }
        const reason = interaction.options.getString('reason', true);
        const raw = interaction.options.getInteger('count') ?? 1;
        const countArg = Math.min(9223372036854775807, Math.max(1, raw));
        const nextCount = (0, data_1.addCount)(data, user.id, countArg);
        await interaction.reply(`**${user.tag}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`);
        if (LOG_CHANNEL_ID && interaction.guild) {
            const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (ch && ch.type === discord_js_1.ChannelType.GuildText) {
                await ch.send(`${interaction.user.tag} → ${user.tag}\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`);
            }
        }
        return;
    }
    // /check
    if (interaction.commandName === 'check') {
        const user = interaction.options.getUser('user', true);
        const count = data[user.id] ?? 0;
        await interaction.reply(`**${user.tag}** は今までに ${count} 回 しばかれました。`);
        return;
    }
    // /top（別ファイルに委譲）
    if (interaction.commandName === 'top') {
        await (0, top_1.handleTop)(interaction);
        return;
    }
    // /control（管理者 or 開発者専用）
    if (interaction.commandName === 'control') {
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
        const target = interaction.options.getUser('user', true);
        const newCountRaw = interaction.options.getInteger('count', true);
        const newCount = Math.max(0, newCountRaw);
        const store = (0, data_1.loadData)();
        store[target.id] = newCount;
        (0, data_1.saveData)(store);
        await interaction.reply({
            content: `\`${target.tag}\` のしばかれ回数を **${newCount} 回** に設定しました。`,
            allowedMentions: { parse: [] }
        });
        return;
    }
    // /members（BOT除外 全メンバーの回数表示）
    if (interaction.commandName === 'members') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'サーバー内で使用してください。', ephemeral: true });
            return;
        }
        await interaction.deferReply();
        const guild = interaction.guild;
        const members = await guild.members.fetch();
        const humans = members.filter(m => !m.user.bot);
        const store = (0, data_1.loadData)();
        const rows = humans.map(m => ({
            tag: m.user.tag,
            id: m.id,
            count: store[m.id] ?? 0
        })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
        const top = rows.slice(0, 20);
        const lines = top.map((r, i) => `#${i + 1} \`${r.tag}\` × **${r.count}**`);
        const embed = {
            title: '👥 全メンバーのしばかれ回数（BOT除外）',
            description: lines.join('\n') || 'メンバーがいません（または全員カウント 0）',
            footer: { text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}` }
        };
        const header = 'rank,tag,id,count';
        const csv = [header, ...rows.map((r, i) => `${i + 1},${r.tag},${r.id},${r.count}`)].join('\n');
        const file = new discord_js_1.AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'members_counts.csv' });
        await interaction.editReply({
            embeds: [embed],
            files: [file],
            allowedMentions: { parse: [] }
        });
        return;
    }
});
client.login(process.env.TOKEN);
