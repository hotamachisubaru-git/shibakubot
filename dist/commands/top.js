"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data"); // データ読み込み関数
const PAGE_SIZE = 10;
// 通知ゼロ＆リンクなしの backtick 表記
async function getUserLabel(client, id) {
    const u = await client.users.fetch(id).catch(() => null);
    const tag = u?.tag ?? id;
    return `\`${tag}\``;
}
function getTopFirstPage(data, pageSize) {
    return Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, pageSize);
}
async function buildTopEmbed(client, data, guildIconUrl = null) {
    const items = getTopFirstPage(data, PAGE_SIZE);
    // 数値順位 (#1, #2, #3 …)
    const lines = await Promise.all(items.map(async (e, idx) => {
        const rankNo = idx + 1;
        const name = await getUserLabel(client, e.id);
        return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    }));
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0xD94848)
        .setAuthor({ name: 'しばきランキング' })
        .setThumbnail(guildIconUrl ?? null)
        .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
        .setFooter({ text: `Page 1/1・更新: ${new Date().toLocaleString('ja-JP')}` });
    // 「更新」ボタンだけ
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('top_refresh')
        .setLabel('更新')
        .setStyle(discord_js_1.ButtonStyle.Success));
    return { embed, components: [row] };
}
// ✅ ここから「ハンドラ部分」を追記
async function handleTop(interaction) {
    const icon = interaction.guild?.iconURL() ?? null;
    const data = (0, data_1.loadData)();
    const { embed, components } = await buildTopEmbed(interaction.client, data, icon);
    const msg = await interaction.reply({
        embeds: [embed],
        components,
        allowedMentions: { parse: [] }
    });
    // 「更新」ボタンのイベントを処理
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 5 * 60000, // 5分
        filter: i => i.user.id === interaction.user.id
    });
    collector.on('collect', async (btn) => {
        if (btn.customId !== 'top_refresh')
            return;
        await btn.deferUpdate();
        const updated = await buildTopEmbed(interaction.client, (0, data_1.loadData)(), icon);
        await msg.edit({
            embeds: [updated.embed],
            components: updated.components,
            allowedMentions: { parse: [] }
        });
    });
    collector.on('end', async () => {
        // 時間切れでボタン無効化
        const disabledRow = new discord_js_1.ActionRowBuilder().addComponents(discord_js_1.ButtonBuilder.from(components[0].components[0]).setDisabled(true));
        await msg.edit({ components: [disabledRow] });
    });
}
