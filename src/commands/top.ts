// src/commands/top.ts
import {
  Client, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, type ChatInputCommandInteraction
} from 'discord.js';
import { loadData } from '../data'; // データ読み込み関数

const PAGE_SIZE = 10;

// 通知ゼロ＆リンクなしの backtick 表記
async function getUserLabel(client: Client, id: string): Promise<string> {
  const u = await client.users.fetch(id).catch(() => null);
  const tag = u?.tag ?? id;
  return `\`${tag}\``;
}

function getTopFirstPage(data: Record<string, number>, pageSize: number) {
  return Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, pageSize);
}

async function buildTopEmbed(
  client: Client,
  data: Record<string, number>,
  guildIconUrl: string | null = null
) {
  const items = getTopFirstPage(data, PAGE_SIZE);

  // 数値順位 (#1, #2, #3 …)
  const lines = await Promise.all(
    items.map(async (e, idx) => {
      const rankNo = idx + 1;
      const name = await getUserLabel(client, e.id);
      return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0xD94848)
    .setAuthor({ name: 'しばきランキング' })
    .setThumbnail(guildIconUrl ?? null)
    .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
    .setFooter({ text: `Page 1/1・更新: ${new Date().toLocaleString('ja-JP')}` });

  // 「更新」ボタンだけ
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('top_refresh')
      .setLabel('更新')
      .setStyle(ButtonStyle.Success)
  );

  return { embed, components: [row] };
}

// ✅ ここから「ハンドラ部分」を追記
export async function handleTop(interaction: ChatInputCommandInteraction) {
  const icon = interaction.guild?.iconURL() ?? null;
  const data = loadData();
  const { embed, components } = await buildTopEmbed(interaction.client, data, icon);

  const msg = await interaction.reply({
    embeds: [embed],
    components,
    allowedMentions: { parse: [] }
  });

  // 「更新」ボタンのイベントを処理
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60_000, // 5分
    filter: i => i.user.id === interaction.user.id
  });

  collector.on('collect', async btn => {
    if (btn.customId !== 'top_refresh') return;
    await btn.deferUpdate();
    const updated = await buildTopEmbed(interaction.client, loadData(), icon);
    await msg.edit({
      embeds: [updated.embed],
      components: updated.components,
      allowedMentions: { parse: [] }
    });
  });

  collector.on('end', async () => {
    // 時間切れでボタン無効化
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(components[0].components[0]).setDisabled(true)
    );
    await msg.edit({ components: [disabledRow] });
  });
}
