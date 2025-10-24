// src/commands/top.ts
import {
  Client, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, type ChatInputCommandInteraction
} from 'discord.js';
 // src/commands/top.ts
import { loadData } from '../data'; // ← 相対パスを修正

const PAGE_SIZE = 10;

// 通知ゼロ＆リンクなしの backtick 表記
async function getUserLabel(client: Client, id: string): Promise<string> {
  const u = await client.users.fetch(id).catch(() => null);
  const tag = u?.tag ?? id;
  return `\`${tag}\``;
}

function sliceTop(data: Record<string, number>, page: number, pageSize: number) {
  const entries = Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const clamped = Math.min(Math.max(page, 1), totalPages);
  const start = (clamped - 1) * pageSize;
  const items = entries.slice(start, start + pageSize);

  return { items, page: clamped, totalPages };
}

async function buildTopEmbed(
  client: Client,
  data: Record<string, number>,
  page = 1,
  guildIconUrl: string | null = null
) {
  const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);
  const badges = ['🜁', '🜂', '🜃'];

  const lines = await Promise.all(
    items.map(async (e, idx) => {
      const rankNo = (page - 1) * PAGE_SIZE + idx + 1;
      const rank = badges[idx] ?? `#${rankNo}`;
      const name = await getUserLabel(client, e.id);
      return `${rank} ${name} × **${e.count.toLocaleString()}**`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0xD94848)
    .setAuthor({ name: 'しばきランキング' })
    .setThumbnail(guildIconUrl ?? null) // ← undefined ではなく null を渡す
    .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
    .setFooter({ text: `Page ${page}/${totalPages} • 更新: ${new Date().toLocaleString('ja-JP')}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`top_prev_${page}`).setLabel('前へ').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`top_next_${page}`).setLabel('次へ').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages),
  );

  return { embed, components: [row], totalPages };
}

export async function handleTop(interaction: ChatInputCommandInteraction) {
  let page = 1;
  const icon = interaction.guild?.iconURL() ?? null; // ← null に正規化
  const data = loadData();
  const { embed, components } = await buildTopEmbed(interaction.client, data, page, icon);

  const msg = await interaction.reply({
    embeds: [embed],
    components,
    allowedMentions: { parse: [] }
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: i => i.user.id === interaction.user.id,
  });

  collector.on('collect', async btn => {
    await btn.deferUpdate();
    if (btn.customId.startsWith('top_prev_')) page = Math.max(1, page - 1);
    if (btn.customId.startsWith('top_next_')) page += 1;

    const updated = await buildTopEmbed(interaction.client, loadData(), page, icon);
    await msg.edit({
      embeds: [updated.embed],
      components: updated.components,
      allowedMentions: { parse: [] },
    });
  });

  collector.on('end', async () => {
    const disabled = components.map(row => {
      const r = ActionRowBuilder.from(row) as ActionRowBuilder<ButtonBuilder>;
      r.components.forEach((c: any) => c.setDisabled(true));
      return r;
    });
    await msg.edit({ components: disabled });
  });
}
