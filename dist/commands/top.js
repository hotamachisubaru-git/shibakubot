"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data"); // ✅ 新しいデータ管理を使用
const PAGE_SIZE = 10;
/** ギルドでは displayName（ニックネーム） → なければ user.tag → 最後にID */
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
async function handleTop(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({
            content: 'このコマンドはサーバー内でのみ使用できます。',
            ephemeral: true
        });
        return;
    }
    const gid = interaction.guildId;
    const store = (0, data_1.loadGuildStore)(gid); // ✅ ギルドごとに読み込み
    const entries = Object.entries(store.counts);
    if (entries.length === 0) {
        await interaction.reply('まだ誰も しばかれていません。');
        return;
    }
    // ソート＆ランキング作成
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    let page = 0;
    const makePage = async (page) => {
        const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const lines = await Promise.all(slice.map(async ([userId, count], i) => {
            const rank = page * PAGE_SIZE + i + 1;
            const name = await getDisplayName(interaction, userId);
            return `#${rank} ${name} × **${count}**`;
        }));
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('しばきランキング')
            .setDescription(lines.join('\n'))
            .setFooter({
            text: `Page ${page + 1}/${Math.ceil(sorted.length / PAGE_SIZE)} • 更新: ${new Date().toLocaleString('ja-JP')}`
        });
        return embed;
    };
    const embed = await makePage(0);
    if (sorted.length <= PAGE_SIZE) {
        await interaction.reply({ embeds: [embed] });
        return;
    }
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(discord_js_1.ButtonStyle.Secondary));
    const msg = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true
    });
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000
    });
    collector.on('collect', async (btn) => {
        if (btn.user.id !== interaction.user.id) {
            await btn.reply({ content: 'このボタンは実行者専用です。', ephemeral: true });
            return;
        }
        page = btn.customId === 'next'
            ? (page + 1) % Math.ceil(sorted.length / PAGE_SIZE)
            : (page - 1 + Math.ceil(sorted.length / PAGE_SIZE)) % Math.ceil(sorted.length / PAGE_SIZE);
        const newEmbed = await makePage(page);
        await btn.update({ embeds: [newEmbed] });
    });
    collector.on('end', async () => {
        await msg.edit({ components: [] });
    });
}
