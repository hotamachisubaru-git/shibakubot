"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data");
const PAGE_SIZE = 10;
// 通知ゼロ＆リンクなし(backtick)表記
async function getUserLabel(client, id) {
    const u = await client.users.fetch(id).catch(() => null);
    const tag = u?.tag ?? id;
    return `\`${tag}\``;
}
function sliceTop(data, page, pageSize) {
    const entries = Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const clamped = Math.min(Math.max(1, page), totalPages);
    const start = (clamped - 1) * pageSize;
    const items = entries.slice(start, start + pageSize);
    return { items, page: clamped, totalPages };
}
async function buildTopEmbed(client, data, page = 1) {
    const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);
    const lines = await Promise.all(items.map(async (e, idx) => {
        const rankNo = (page - 1) * PAGE_SIZE + (idx + 1);
        const name = await getUserLabel(client, e.id);
        return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    }));
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0xd94848)
        .setAuthor({ name: 'しばきランキング' })
        .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
        .setFooter({ text: `Page ${page}/${totalPages}・更新: ${new Date().toLocaleString('ja-JP')}` });
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
    return { embed, components: [row] };
}
async function handleTop(interaction) {
    // 3秒制限回避：先にACKだけ返す（allowedMentionsはここでは指定しない）
    await interaction.deferReply({
        ephemeral: false, // 公開にしたくなければ true
        withResponse: false, // fetchReply: true でも可
    });
    let page = 1;
    const data = (0, data_1.loadData)();
    const first = await buildTopEmbed(interaction.client, data, page);
    await interaction.editReply({
        embeds: [first.embed],
        components: first.components,
        allowedMentions: { parse: [] },
    });
    const msg = await interaction.fetchReply();
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
        if (btn.customId.startsWith('top_refresh_')) {
            // ここでは特に何もしない（最新データで再描画）
        }
        const updated = await buildTopEmbed(interaction.client, (0, data_1.loadData)(), page);
        await interaction.editReply({
            embeds: [updated.embed],
            components: updated.components,
            allowedMentions: { parse: [] },
        });
    });
    collector.on('end', async () => {
        const disabled = first.components.map((row) => {
            const r = discord_js_1.ActionRowBuilder.from(row);
            r.components.forEach((c) => c.setDisabled(true));
            return r;
        });
        await interaction.editReply({ components: disabled });
    });
}
