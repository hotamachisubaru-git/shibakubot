// src/index.ts
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  TextChannel,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';

import {
  loadGuildStore,
  saveGuildStore,
  addCountGuild,
  isImmune,
  getImmuneList,
  addImmuneId,
  removeImmuneId,
} from './data';

import { handleTop } from './commands/top';
import { handleMembers } from './commands/members';
import { handleMenu } from './commands/menu';
import { handleRoom } from './commands/daimongamecenter';
import { handleHelp } from './commands/help';
import { handleReset } from './commands/reset';
import { handleStats } from './commands/stats';


// ---- ユーティリティ：表示名（ギルドのニックネーム優先）
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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ---- 定数 ----
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

client.once(Events.ClientReady, b => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

// ---- コマンドハンドラ ----
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  // /ping
  if (name === 'ping') {
    const t0 = performance.now();
    await interaction.deferReply({ ephemeral: true });
    const apiPing = Math.round(performance.now() - t0);

    // WS ping（最大5秒リトライ）
    let wsPing = interaction.client.ws?.ping ?? -1;
    for (let waited = 0; wsPing < 0 && waited < 5000; waited += 200) {
      await new Promise(r => setTimeout(r, 200));
      wsPing = interaction.client.ws?.ping ?? -1;
    }
    const wsText = wsPing >= 0 ? `${Math.round(wsPing)}ms` : '取得できませんでした';
    await interaction.editReply(`API: **${apiPing}ms** | WS: **${wsText}**`);
    return;
  }

  // /sbk
  if (name === 'sbk') {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
      return;
    }
    const gid = interaction.guildId!;
    const user = interaction.options.getUser('user', true);

    // BOTは不可
    if (user.bot || user.id === interaction.client.user?.id) {
      await interaction.reply({
        content: 'BOTは対象外です。',
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
    // 免除チェック（グローバル + ギルド）
if (isImmune(gid, user.id) || (IMMUNE_IDS?.includes?.(user.id) ?? false)) {

      await interaction.reply({
        content: 'このユーザーはしばき免除です。',
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const reason = interaction.options.getString('reason', true);
    const raw = interaction.options.getInteger('count') ?? 1;
    const countArg = Math.max(1, Math.min(100, raw)); // 上限は必要に応じて

    const nextCount = addCountGuild(gid, user.id, countArg);

    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    const display = member?.displayName ?? user.tag;

    await interaction.reply(
      `**${display}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`
    );

    if (LOG_CHANNEL_ID) {
      const ch = await interaction.guild!.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await (ch as TextChannel).send(
          `${interaction.user.tag} → ${display}\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`
        );
      }
    }
    return;
  }

  // /check
  if (name === 'check') {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'サーバー内で使用してください。', ephemeral: true });
      return;
    }
    const gid = interaction.guildId!;
    const target = interaction.options.getUser('user', true);
    const store = loadGuildStore(gid);
    const count = store.counts[target.id] ?? 0;

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.tag;

    await interaction.reply({
      content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // ========================
  // 外部ファイルに振り分ける系
  // ========================

  if (interaction.commandName === 'menu') { await handleMenu(interaction); return; }
  if (interaction.commandName === 'members') { await handleMembers(interaction); return; }
  if (interaction.commandName === 'room') { await handleRoom(interaction); return; }
  if (interaction.commandName === 'help') { await handleHelp(interaction); return; }
  if (interaction.commandName === 'stats') { await handleStats(interaction); return; }
  if (interaction.commandName === 'reset') { await handleReset(interaction); return; }
  if (interaction.commandName === 'top') { await handleTop(interaction); return; }


  // /control（管理者 / 開発者のみ）
  if (name === 'control') {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'このコマンドはサーバー内でのみ使用できます。',
        ephemeral: true,
      });
      return;
    }
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const isOwner = OWNER_IDS.includes(interaction.user.id);
    if (!isAdmin && !isOwner) {
      await interaction.reply({
        content: '権限がありません。（管理者または開発者のみ）',
        ephemeral: true,
      });
      return;
    }

    const gid = interaction.guildId!;
    const target = interaction.options.getUser('user', true);
    const newCountRaw = interaction.options.getInteger('count', true);
    const newCount = Math.max(0, newCountRaw);

    const store = loadGuildStore(gid);
    store.counts[target.id] = newCount;
    saveGuildStore(gid, store);

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.tag;

    await interaction.reply({
      content: `**${displayName}** のしばかれ回数を **${newCount} 回** に設定しました。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  // /immune（管理者 / 開発者のみ）
  if (name === 'immune') {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'このコマンドはサーバー内でのみ使用できます。',
        ephemeral: true,
      });
      return;
    }
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const isOwner = OWNER_IDS.includes(interaction.user.id);
    if (!isAdmin && !isOwner) {
      await interaction.reply({
        content: '権限がありません。（管理者または開発者のみ）',
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId!;

    if (sub === 'add') {
      const u = interaction.options.getUser('user', true);
      if (u.bot) {
        await interaction.reply({ content: 'BOTはそもそもしばけません。', ephemeral: true });
        return;
      }
      const added = addImmuneId(gid, u.id);
      await interaction.reply({
        content: added
          ? `\`${u.tag}\` を免除リストに追加しました。`
          : `\`${u.tag}\` はすでに免除リストに存在します。`,
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }

    if (sub === 'remove') {
      const u = interaction.options.getUser('user', true);
      const removed = removeImmuneId(gid, u.id);
      await interaction.reply({
        content: removed ? `\`${u.tag}\` を免除リストから削除しました。` : `\`${u.tag}\` は免除リストにありません。`,
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const ids = getImmuneList(gid);
      const global = IMMUNE_IDS;

      const textLocal = ids.length
        ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
        : '（なし）';
      const textGlobal = global.length
        ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n')
        : '（なし）';

      await interaction.reply({
        embeds: [
          {
            title: '🛡️ しばき免除リスト',
            fields: [
              { name: 'ギルド免除', value: textLocal },
              { name: 'グローバル免除（.env IMMUNE_IDS）', value: textGlobal },
            ],
          },
        ],
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }
  }
});

client.login(process.env.TOKEN);
