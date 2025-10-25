// src/index.ts
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  type Interaction, ChannelType, type TextChannel,
  PermissionFlagsBits, AttachmentBuilder
} from 'discord.js';
import { loadData, addCount, saveData } from './data';
import { handleTop } from './commands/top';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers // ✅ /members に必要
  ]
});

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

client.once(Events.ClientReady, b => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: '測定中...' });
    const sent = await interaction.fetchReply();
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`応答速度: **${ping}ms**`);
    return;
  }

  // 最新データ
  const data = loadData();

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

    const nextCount = addCount(data, user.id, countArg);

    await interaction.reply(
      `**${user.tag}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`
    );

    if (LOG_CHANNEL_ID && interaction.guild) {
      const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await (ch as TextChannel).send(
          `${interaction.user.tag} → ${user.tag}\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`
        );
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
    await handleTop(interaction);
    return;
  }

  // /control（管理者 or 開発者専用）
  if (interaction.commandName === 'control') {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
      return;
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const isOwner = OWNER_IDS.includes(interaction.user.id);
    if (!isAdmin && !isOwner) {
      await interaction.reply({ content: '権限がありません。（管理者または開発者のみ）', ephemeral: true });
      return;
    }

    const target = interaction.options.getUser('user', true);
    const newCountRaw = interaction.options.getInteger('count', true);
    const newCount = Math.max(0, newCountRaw);

    const store = loadData();
    store[target.id] = newCount;
    saveData(store);

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

    const guild = interaction.guild!;
    const members = await guild.members.fetch();
    const humans = members.filter(m => !m.user.bot);

    const store = loadData();
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
    const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'members_counts.csv' });

    await interaction.editReply({
      embeds: [embed],
      files: [file],
      allowedMentions: { parse: [] }
    });
    return;
  }
});

client.login(process.env.TOKEN);
