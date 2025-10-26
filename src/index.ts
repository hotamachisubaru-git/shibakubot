// src/index.ts
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  type Interaction, ChannelType, type TextChannel,
  type ChatInputCommandInteraction, PermissionFlagsBits, AttachmentBuilder
} from 'discord.js';
import {
  loadData, addCount, saveData,
  isImmune, getImmuneList, addImmuneId, removeImmuneId
} from './data';
import { handleTop } from './commands/top';

//ヘルパー
// ギルドではニックネーム（displayName）→ なければ user.tag → 最後にID
async function getDisplayName(
  interaction: ChatInputCommandInteraction,
  userId: string
): Promise<string> {
  const g = interaction.guild;
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }
  const u = await interaction.client.users.fetch(userId).catch(() => null);
  return u?.tag ?? userId;
}

// ---- クライアント設定 ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers // /members 用
  ]
});

// ---- 定数 ----
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

client.once(Events.ClientReady, (b) => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

// ---- コマンドハンドラ ----
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

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


  const data = loadData();

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
  if (isImmune(interaction.guildId ?? undefined, user.id, IMMUNE_IDS)) {
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
  const nextCount = addCount(data, user.id, countArg);

  // 表示名（ニックネーム優先）を取得
  const targetName = await getDisplayName(interaction as ChatInputCommandInteraction, user.id);
  const actorName  = await getDisplayName(interaction as ChatInputCommandInteraction, interaction.user.id);

  // 返信（メンション抑止）
  await interaction.reply({
    content: `\`${targetName}\` が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`,
    allowedMentions: { parse: [] }
  });

  // ログ出力（こちらも表示名に変更）
  if (LOG_CHANNEL_ID && interaction.guild) {
    const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (ch && ch.type === ChannelType.GuildText) {
      await (ch as TextChannel).send({
        content:
          `\`${actorName}\` → \`${targetName}\`\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`,
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

  let displayName = user.tag;
  if (interaction.inGuild()) {
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    if (member?.displayName) displayName = member.displayName; // 表示名優先
  }

  await interaction.reply({
    content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
    allowedMentions: { parse: [] },
  });
  return;
}


  // /top
  if (interaction.commandName === 'top') {
    await handleTop(interaction);
    return;
  }

  // /members
  if (interaction.commandName === 'members') {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'サーバー内で使用してください。', ephemeral: true });
      return;
    }
    await interaction.deferReply();

    const guild = interaction.guild!;
    const members = await guild.members.fetch();
    const humans = members.filter((m) => !m.user.bot);

    const rows = humans.map(m => {
    const display = m.displayName || m.user.tag; // ← 表示名優先
    return {
    tag: display,
    id: m.id,
    count: data[m.id] ?? 0
    };
  }).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));


    const top = rows.slice(0, 20);
    const lines = top.map((r, i) => `#${i + 1} \`${r.tag}\` × **${r.count}**`);

    const embed = {
      title: '全メンバーのしばかれ回数（BOT除外）',
      description: lines.join('\n') || 'メンバーがいません（または全員カウント 0）',
      footer: { text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}` }
    };

    const header = 'rank,tag,id,count';
    const csv = [header, ...rows.map((r, i) => `${i + 1},${r.tag},${r.id},${r.count}`)].join('\n');
    const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'members_counts.csv' });

    await interaction.editReply({ embeds: [embed], files: [file], allowedMentions: { parse: [] } });
    return;
  }

  // /control
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

  // /immune
  if (interaction.commandName === 'immune') {
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

    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId!;

    if (sub === 'add') {
      const u = interaction.options.getUser('user', true);
      if (u.bot) {
        await interaction.reply({ content: 'BOTはそもそも人間じゃないのでしばけません。', ephemeral: true });
        return;
      }
      const added = addImmuneId(gid, u.id);
      await interaction.reply({
        content: added ? `\`${u.tag}\` を免除リストに追加しました。` : `\`${u.tag}\` はすでに免除リストに存在します。`,
        allowedMentions: { parse: [] }, ephemeral: true
      });
      return;
    }

    if (sub === 'remove') {
      const u = interaction.options.getUser('user', true);
      const removed = removeImmuneId(gid, u.id);
      await interaction.reply({
        content: removed ? `\`${u.tag}\` を免除リストから削除しました。` : `\`${u.tag}\` は免除リストにありません。`,
        allowedMentions: { parse: [] }, ephemeral: true
      });
      return;
    }

    if (sub === 'list') {
      const ids = getImmuneList(gid);
      const global = IMMUNE_IDS;

      const textLocal =
        ids.length
          ? ids.map((x: string, i: number) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
          : '（なし）';
      const textGlobal =
        global.length
          ? global.map((x: string, i: number) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
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
