"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data");
const PAGE_SIZE = 10;
/** ギルドでは displayName（ニックネーム）→ なければ user.tag → 最後にID */
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
function paginate(data, page, pageSize) {
    const entries = Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const p = Math.min(Math.max(page, 1), totalPages);
    const start = (p - 1) * pageSize;
    const items = entries.slice(start, start + pageSize);
    return { items, page: p, totalPages };
}
async function buildTopEmbed(interaction, page) {
    const store = (0, data_1.loadData)();
    const { items, totalPages } = paginate(store, page, PAGE_SIZE);
    const lines = await Promise.all(items.map(async (e, idx) => {
        const rankNo = (page - 1) * PAGE_SIZE + idx + 1;
        const name = await getDisplayName(interaction, e.id); // ← 表示名優先
        // メンション通知は飛ばさない（バッククォート）
        return `#${rankNo} \`${name}\` × **${e.count.toLocaleString()}**`;
    }));
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0xd94848)
        .setAuthor({ name: 'しばきランキング' })
        .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
        .setFooter({
        text: `Page ${page}/${totalPages}・更新: ${new Date().toLocaleString('ja-JP')}`,
    });
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`top_prev_${page}`)
        .setLabel('前へ')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page <= 1), new discord_js_1.ButtonBuilder()
        .setCustomId(`top_next_${page}`)
        .setLabel('次へ')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setDisabled(page >= totalPages), new discord_js_1.ButtonBuilder()
        .setCustomId(`top_refresh_${page}`)
        .setLabel('更新')
        .setStyle(discord_js_1.ButtonStyle.Success));
    return { embed, components: [row], totalPages };
}
/** /top のハンドラ（エクスポート） */
async function handleTop(interaction) {
    // 先にACK（公開でOK。非公開にしたいなら ephemeral: true）
    await interaction.deferReply();
    let page = 1;
    const first = await buildTopEmbed(interaction, page);
    const msg = await interaction.editReply({
        embeds: [first.embed],
        components: first.components,
        allowedMentions: { parse: [] },
    });
    // ボタン操作（実行者のみ・60秒）
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === interaction.user.id,
    });
    collector.on('collect', async (btn) => {
        await btn.deferUpdate();
        if (btn.customId.startsWith('top_prev_'))
            page = Math.max(1, page - 1);
        if (btn.customId.startsWith('top_next_'))
            page = page + 1;
        if (btn.customId.startsWith('top_refresh_'))
            page = page; // そのまま再描画
        const updated = await buildTopEmbed(interaction, page);
        await msg.edit({
            embeds: [updated.embed],
            components: updated.components,
            allowedMentions: { parse: [] },
        });
    });
    collector.on('end', async () => {
        // タイムアウトでボタン無効化
        const disabled = (await buildTopEmbed(interaction, page)).components.map((row) => {
            const r = discord_js_1.ActionRowBuilder.from(row);
            r.components.forEach((c) => c.setDisabled(true));
            return r;
        });
        await msg.edit({ components: disabled });
    });
}
