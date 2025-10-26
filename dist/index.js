"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
require("dotenv/config");
const discord_js_1 = require("discord.js");
const data_1 = require("./data");
const top_1 = require("./commands/top");
//ヘルパー
// ギルドではニックネーム（displayName）→ なければ user.tag → 最後にID
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
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMembers // /members 用
    ]
});
// ---- 定数 ----
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
client.once(discord_js_1.Events.ClientReady, (b) => {
    console.log(`✅ ログイン完了: ${b.user.tag}`);
});
// ---- コマンドハンドラ ----
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    // /ping
    // /ping
    if (interaction.commandName === 'ping') {
        const t0 = performance.now();
        await interaction.deferReply({ ephemeral: true });
        const apiPing = Math.round(performance.now() - t0);
        // WS Pingが未計測(-1)なら最大5秒まで待機して再取得
        let wsPing = interaction.client.ws?.ping ?? -1;
        const maxWait = 5000; // 最大5秒
        const interval = 200; // チェック間隔200ms
        let waited = 0;
        while (wsPing < 0 && waited < maxWait) {
            await new Promise(r => setTimeout(r, interval));
            wsPing = interaction.client.ws?.ping ?? -1;
            waited += interval;
        }
        const wsText = wsPing >= 0 ? `${Math.round(wsPing)}ms` : '取得できませんでした';
        await interaction.editReply(`API: **${apiPing}ms** | WS: **${wsText}**`);
        return;
    }
    const data = (0, data_1.loadData)();
    // /sbk
    if (interaction.commandName === 'sbk') {
        const user = interaction.options.getUser('user', true);
        // BOT（自分含む）は不可
        if (user.bot || user.id === interaction.client.user?.id) {
            await interaction.reply({
                content: 'BOTをしばくことはできません。',
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
            return;
        }
        // 免除チェック
        if ((0, data_1.isImmune)(interaction.guildId ?? undefined, user.id, IMMUNE_IDS)) {
            await interaction.reply({
                content: 'このユーザーはしばき免除です。',
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
            return;
        }
        const reason = interaction.options.getString('reason', true);
        const raw = interaction.options.getInteger('count') ?? 1;
        // 上限設定（1〜10）
        const MIN = 1;
        const MAX = 10;
        if (raw > MAX) {
            await interaction.reply({
                content: `1回でしばけるのは最大 **${MAX} 回** までです！`,
                ephemeral: true,
                allowedMentions: { parse: [] }
            });
            return;
        }
        const countArg = Math.max(MIN, raw);
        // カウント追加
        const nextCount = (0, data_1.addCount)(data, user.id, countArg);
        // 表示名（ニックネーム優先）を取得
        const targetName = await getDisplayName(interaction, user.id);
        const actorName = await getDisplayName(interaction, interaction.user.id);
        // 返信（メンション抑止）
        await interaction.reply({
            content: `\`${targetName}\` が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`,
            allowedMentions: { parse: [] }
        });
        // ログ出力（こちらも表示名に変更）
        if (LOG_CHANNEL_ID && interaction.guild) {
            const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (ch && ch.type === discord_js_1.ChannelType.GuildText) {
                await ch.send({
                    content: `\`${actorName}\` → \`${targetName}\`\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`,
                    allowedMentions: { parse: [] }
                });
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
    // /top
    if (interaction.commandName === 'top') {
        await (0, top_1.handleTop)(interaction);
        return;
    }
    // /members
    if (interaction.commandName === 'members') {
        if (!interaction.inGuild()) {
            await interaction.reply({ content: 'サーバー内で使用してください。', ephemeral: true });
            return;
        }
        await interaction.deferReply();
        const guild = interaction.guild;
        const members = await guild.members.fetch();
        const humans = members.filter((m) => !m.user.bot);
        const rows = humans.map((m) => ({
            tag: m.user.tag,
            id: m.id,
            count: data[m.id] ?? 0
        })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
        const top = rows.slice(0, 20);
        const lines = top.map((r, i) => `#${i + 1} \`${r.tag}\` × **${r.count}**`);
        const embed = {
            title: '全メンバーのしばかれ回数（BOT除外）',
            description: lines.join('\n') || 'メンバーがいません（または全員カウント 0）',
            footer: { text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}` }
        };
        const header = 'rank,tag,id,count';
        const csv = [header, ...rows.map((r, i) => `${i + 1},${r.tag},${r.id},${r.count}`)].join('\n');
        const file = new discord_js_1.AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'members_counts.csv' });
        await interaction.editReply({ embeds: [embed], files: [file], allowedMentions: { parse: [] } });
        return;
    }
    // /control
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
    // /immune
    if (interaction.commandName === 'immune') {
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
                await interaction.reply({ content: 'BOTはそもそも人間じゃないのでしばけません。', ephemeral: true });
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
            const textLocal = ids.length
                ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
                : '（なし）';
            const textGlobal = global.length
                ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
                : '（なし）';
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
