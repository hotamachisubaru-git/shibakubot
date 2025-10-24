// src/index.ts
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  type Interaction, ChannelType, type TextChannel,
  EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType
} from 'discord.js';
import fs from 'fs';
import path from 'path';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';

// ==== データ保存まわり ====
const ROOT_DATA = path.join(process.cwd(), 'data.json');
const LEGACY_DATA = path.join(process.cwd(), 'src', 'data.json');

type CounterMap = Record<string, number>;

function loadData(): CounterMap {
  try {
    if (fs.existsSync(ROOT_DATA)) {
      return JSON.parse(fs.readFileSync(ROOT_DATA, 'utf8'));
    }
    if (fs.existsSync(LEGACY_DATA)) {
      const d = JSON.parse(fs.readFileSync(LEGACY_DATA, 'utf8'));
      fs.writeFileSync(ROOT_DATA, JSON.stringify(d, null, 2));
      return d;
    }
  } catch {}
  return {};
}

function saveData(data: CounterMap) {
  fs.writeFileSync(ROOT_DATA, JSON.stringify(data, null, 2));
}

function addCount(data: CounterMap, userId: string): number {
  const next = (data[userId] ?? 0) + 1;
  data[userId] = next;
  saveData(data);
  return next;
}

function getTop(data: CounterMap, limit = 10): Array<{ id: string; count: number }> {
  return Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ==== /top 用ユーティリティ（トップレベルに配置！）====
const PAGE_SIZE = 10;

async function getUserLabel(client: Client, id: string): Promise<string> {
  try {
    const u = await client.users.fetch(id).catch(() => null);
    const label = u?.tag ?? id;
    // 通知が飛ばないリンク表記
    return `[${label}](https://discord.com/users/${id})`;
  } catch {
    return id;
  }
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

async function buildTopEmbed(client: Client, data: Record<string, number>, page = 1) {
  const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);
  const medal = ['🥇', '🥈', '🥉'];

  const lines = await Promise.all(items.map(async (e, idx) => {
    const rankIcon = medal[idx] ?? `${(page - 1) * PAGE_SIZE + idx + 1}.`;
    const userLabel = await getUserLabel(client, e.id);
    return `${rankIcon} ${userLabel} • 🟡 ${e.count.toLocaleString()}`;
  }));

  const embed = new EmbedBuilder()
    .setTitle('🏛️ Leaderboard')
    .setDescription('View the leaderboard online [here](https://discord.com)')
    .addFields({ name: '\u200B', value: lines.join('\n') || 'まだデータがありません。' })
    .setFooter({ text: `Page ${page}/${totalPages}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`top_prev_${page}`).setLabel('Previous Page').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`top_next_${page}`).setLabel('Next Page').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages),
  );

  return { embed, components: [row] as const, totalPages };
}

// ==== Bot本体 ====
client.once(Events.ClientReady, b => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const data = loadData();

  // /ping
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: '📡 測定中...' });
    const sent = await interaction.fetchReply();
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! 応答速度: **${ping}ms**`);
    return;
  }

  // /sbk
  if (interaction.commandName === 'sbk') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const count = addCount(data, user.id);

    await interaction.reply(`**${user.tag}** がしばかれました！（累計 ${count} 回）\n理由: ${reason}`);

    if (LOG_CHANNEL_ID && interaction.guild) {
      const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await (ch as TextChannel).send(`${interaction.user.tag} → ${user.tag}\n理由: ${reason}\n累計: ${count} 回`);
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
    let page = 1;
    const { embed, components } = await buildTopEmbed(interaction.client, data, page);

    const msg = await interaction.reply({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] }, // ✅ メンション抑止
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

      const updated = await buildTopEmbed(interaction.client, loadData(), page);
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

    return;
  }
});

client.login(process.env.TOKEN);
