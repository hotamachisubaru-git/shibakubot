// src/index.ts
import 'dotenv/config';
import { ReadLine } from 'node:readline';
import readline from 'node:readline';
import { LavalinkManager } from 'lavalink-client';
import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  VoiceChannel,
  GuildMember,
  ChannelType,
  Message,
  Interaction,
} from 'discord.js';

import {
  loadGuildStore,
  setCountGuild,
  isImmune,
  addCountGuild,
  getImmuneList,
  addImmuneId,
  removeImmuneId,
  getSbkRange,
} from './data';

//import { initLavalink} from './lavalink';
import { sendLog } from './logging';
import { handleTop } from './commands/top';
import { handleMembers } from './commands/members';
import { handleMenu } from './commands/menu';
import { handleRoom } from './commands/daimongamecenter';
import { handleHelp } from './commands/help';
import { handleReset } from './commands/reset';
import { handleStats } from './commands/stats';
import { handleMusicMessage } from './music';

// ---- クライアント設定 ----
// 🔹 追加: Lavalink をぶら下げたクライアント型
type ShibakuClient = Client & {
  lavalink: LavalinkManager;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
}) as ShibakuClient;

// LavalinkManager をセットアップ（この中で raw イベントも登録される）
//initLavalink(client);

const lavalink = new LavalinkManager({
  nodes: [
    {
      id: 'local',
      host: '127.0.0.1',
      port: 2333,
      authorization: 'youshallnotpass', // application.yml の password
      secure: false,
    },
  ],

  // 🔹 ここは sendPayload ではなく sendToShard
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    guild.shard.send(payload);
  },

  client: {
    id: '0',                    // ここはダミーでOK（後で init で上書き）
    username: 'shibaku-bot',
  },

  // （オプション）お好みで
  autoSkip: true,
  playerOptions: {
    defaultSearchPlatform: 'ytmsearch',
    clientBasedPositionUpdateInterval: 150,
    volumeDecrementer: 0.75,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false,
    },
    onEmptyQueue: {
      destroyAfterMs: 30_000,
    },
  },
  queueOptions: {
    maxPreviousTracks: 25,
  },
});

// client にぶら下げる
client.lavalink = lavalink;
// Discord の Raw イベントを Lavalink に渡す
client.on('raw', (data) => {
  client.lavalink.sendRawData(data);
});


// ---- 定数 ----
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// Ready
client.once(Events.ClientReady, async (b: Client<true>) => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);

  // Lavalink と Bot 情報を紐付け（ヘッダーは ASCII のみ）
  await client.lavalink.init({
    id: b.user.id,
    username: 'shibakubot', // 日本語を入れない
  });
});



// ---- コマンドハンドラ ----
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  // /ping
  if (name === 'ping') {
    const t0 = performance.now();
    await interaction.deferReply({ ephemeral: true });
    const apiPing = Math.round(performance.now() - t0);

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
      await interaction.reply({ content: 'BOTは対象外です。', ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }

    // 免除チェック（ギルド + グローバル）
    const isImmune =
      getImmuneList(gid).includes(user.id) ||
      (IMMUNE_IDS?.includes?.(user.id) ?? false);

    if (isImmune) {
      await interaction.reply({ content: 'このユーザーはしばき免除です。', ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }

    // ギルドごとの上限を参照
    const { min: SBK_MIN, max: SBK_MAX } = getSbkRange(gid);
    const countArg = Math.max(SBK_MIN, Math.min(SBK_MAX, interaction.options.getInteger('count') ?? SBK_MIN));

    const nextCount = addCountGuild(gid, user.id, countArg);
    const member = await interaction.guild!.members.fetch(user.id).catch(() => null);
    const display = member?.displayName ?? user.tag;
    const reason = interaction.options.getString('reason') ?? '理由なし';
    await interaction.reply(
      `**${display}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`
    );

    // ← ここでログ送信（interaction / 実行者 / 対象 / 理由 / 今回 / 累計）
    await sendLog(
      interaction,
      interaction.user.id, // しばいた人
      user.id,             // しばかれた人
      reason,
      countArg,
      nextCount
    );

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

  // 外部ハンドラ
  if (name === 'menu')   { await handleMenu(interaction); return; }
  if (name === 'members'){ await handleMembers(interaction); return; }
  if (name === 'room')   { await handleRoom(interaction); return; }
  if (name === 'help')   { await handleHelp(interaction); return; }
  if (name === 'stats')  { await handleStats(interaction); return; }
  if (name === 'reset')  { await handleReset(interaction); return; }
  if (name === 'top')    { await handleTop(interaction); return; }

  // /control（管理者 / 開発者のみ）
  if (name === 'control') {
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

    const gid = interaction.guildId!;
    const target = interaction.options.getUser('user', true);
    const newCountRaw = interaction.options.getInteger('count', true);
    const newCount = Math.max(0, newCountRaw);
    const after = setCountGuild(gid, target.id, newCount);

    const store = loadGuildStore(gid);
    store.counts[target.id] = newCount;
    

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.tag;

    await interaction.reply({
      content: `**${displayName}** のしばかれ回数を **${newCount} 回** に設定しました。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  // /immune（管理者 / 開発者のみ） …（既存のまま）
  if (name === 'immune') {
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
        await interaction.reply({ content: 'BOTはそもそもしばけません。', ephemeral: true });
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

      const textLocal = ids.length ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n') : '（なし）';
      const textGlobal = global.length ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join('\n') : '（なし）';

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

// ================== コンソールコマンド ==================
// 時間指定を秒・分・時間で書けるようにする
function parseDuration(input: string): number | null {
  const m = input.toLowerCase().match(/^(\d+)(s|m|h)?$/);
  if (!m) return null;

  const value = Number(m[1]);
  const unit = m[2] || 's'; // 省略 → 秒扱い

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return null;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 単体ユーザー: VC移動
async function moveUser(
  guildId: string,
  userId: string,
  channelId: string,
) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null) as GuildMember | null;
  if (!member) {
    console.log('ユーザーが見つかりません。');
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    console.log('指定されたチャンネルIDはVCではありません。');
    return;
  }

  await member.voice.setChannel(channel as VoiceChannel);
  console.log(`✅ ${member.user.tag} を ${channel.name} に移動しました。`);
}

// 単体ユーザー: VC切断
async function disconnectUser(guildId: string, userId: string) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null) as GuildMember | null;
  if (!member) {
    console.log('ユーザーが見つかりません。');
    return;
  }

  if (!member.voice?.channel) {
    console.log('ユーザーはどのVCにも接続していません。');
    return;
  }

  await member.voice.disconnect();
  console.log(`✅ ${member.user.tag} を VC から切断しました。`);
}

// 単体ユーザー: タイムアウト（durationMs=0 以下なら解除）
async function timeoutUser(
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,                 // ★ 追加
) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null) as GuildMember | null;
  if (!member) {
    console.log('ユーザーが見つかりません。');
    return;
  }

  if (!durationMs || durationMs <= 0) {
    await member.timeout(null, 'コンソールコマンドによるタイムアウト解除');
    console.log(`✅ ${member.user.tag} のタイムアウトを解除しました。`);
    return;
  }

  await member.timeout(durationMs, 'コンソールコマンドによるタイムアウト');

  // ★ ここを修正
  const human = label ?? `${durationMs / 1000}秒`;
  console.log(`✅ ${member.user.tag} を ${human} タイムアウトしました。`);
}

// 単体ユーザー: サーバーミュート（任意時間後に自動解除）
async function serverUserMute(
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,                 // ★ 追加
) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  const member = await guild.members.fetch(userId).catch(() => null) as GuildMember | null;
  if (!member) {
    console.log('ユーザーが見つかりません。');
    return;
  }

  if (!member.voice?.channel) {
    console.log('ユーザーはどのVCにも接続していません。');
    return;
  }

  try {
    await member.voice.setMute(true, 'コンソールコマンドによるサーバーミュート');

    const human = label ?? `${durationMs / 1000}秒`;   // ★
    console.log(`✅ ${member.user.tag} を ${human} サーバーミュートしました。`);

    if (durationMs && durationMs > 0) {
      setTimeout(async () => {
        try {
          const refreshed = await guild.members.fetch(userId).catch(() => null) as GuildMember | null;
          if (!refreshed) return;
          if (refreshed.voice?.channel) {
            await refreshed.voice.setMute(false, 'サーバーミュートの自動解除');
            console.log(`✅ ${refreshed.user.tag} のサーバーミュートを解除しました。`);
          }
        } catch (err) {
          console.error('自動解除でエラー:', err);
        }
      }, durationMs);
    }
  } catch (err) {
    console.error('サーバーミュートに失敗しました:', err);
  }
}

// ===== 一括操作系 =====

// ギルド内の全VC参加者を指定VCに移動
async function moveAll(guildId: string, targetChannelId: string) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  const target = await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!target || target.type !== ChannelType.GuildVoice) {
    console.log('指定されたチャンネルIDはVCではありません。');
    return;
  }

  let count = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    const member = vs.member;
    if (!member || member.user.bot) continue; // Bot は除外（必要なら外してOK）

    try {
      await member.voice.setChannel(target as VoiceChannel);
      count++;
    } catch (err) {
      console.error(`移動失敗: ${member.user.tag}`, err);
    }
  }

  console.log(`✅ ${count}人を ${target.name} に移動しました。`);
}

// ギルド内の全VC参加者を切断
async function disconnectAll(guildId: string) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  let count = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    const member = vs.member;
    if (!member || member.user.bot) continue;

    try {
      await member.voice.disconnect();
      count++;
    } catch (err) {
      console.error(`切断失敗: ${member.user.tag}`, err);
    }
  }

  console.log(`✅ ${count}人を VC から切断しました。`);
}

// ギルド内の全VC参加者をサーバーミュート（任意時間後解除）
async function muteAll(
  guildId: string,
  durationMs: number,
  label?: string,                 // ★ 追加
) {
  if (!client.isReady()) throw new Error('Client is not ready');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log('ギルドが見つかりません。');
    return;
  }

  let count = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    const member = vs.member;
    if (!member || member.user.bot) continue;

    try {
      await member.voice.setMute(true, 'コンソールコマンドによる一括サーバーミュート');
      count++;
    } catch (err) {
      console.error(`ミュート失敗: ${member?.user.tag}`, err);
    }
  }

  const human = label ?? `${durationMs / 1000}秒`;    // ★
  console.log(`✅ ${count}人を ${human} サーバーミュートしました。`);

  if (durationMs && durationMs > 0) {
    setTimeout(async () => {
      try {
        let unmuted = 0;
        for (const vs of guild.voiceStates.cache.values()) {
          const member = vs.member;
          if (!member || member.user.bot) continue;
          try {
            if (member.voice.serverMute) {
              await member.voice.setMute(false, '一括サーバーミュートの自動解除');
              unmuted++;
            }
          } catch (err) {
            console.error(`自動解除失敗: ${member?.user.tag}`, err);
          }
        }
        console.log(`✅ 一括サーバーミュートを解除しました。（${unmuted}人）`);
      } catch (err) {
        console.error('一括自動解除でエラー:', err);
      }
    }, durationMs);
  }
}


// ===== コンソール入力受付 =====

console.log('コンソールコマンド:');
console.log('  move <guildId> <userId> <voiceChannelId>');
console.log('  disconnect <guildId> <userId>');
console.log('  timeout <guildId> <userId> <second(s)/minute(s)/hour(s)>');
console.log('  serverMute <guildId> <userId> <second(s)/minute(s)/hour(s)>');
console.log('  moveAll <guildId> <voiceChannelId>');
console.log('  disconnectAll <guildId>');
console.log('  muteAll <guildId> <second(s)/minute(s)/hour(s)>');
console.log('  unmute <guildId> <userId>');
console.log('  addrole <guildId> <userId> <roleId>');
console.log('例: move 123... 234... 345...');
console.log('例: timeout 123... 234... 10m');
console.log('例: serverMute 123... 234... 1h');
console.log('例: moveAll 123... 345...');
console.log('例: muteAll 123... 15m');
console.log('例：unmute 123... 234...');
console.log('help と入力するとコマンド一覧を表示します。');
console.log('------------------------------');


rl.on('line', async (input) => {
  const args = input.trim().split(/\s+/);
  const command = args[0];

  try {
    if (command === 'move' && args.length === 4) {
      await moveUser(args[1], args[2], args[3]);

    } else if (command === 'disconnect' && args.length === 3) {
      await disconnectUser(args[1], args[2]);

    } else if (command === 'timeout' && args.length === 4) {
      const raw = args[3];                            // ★ 元の文字列
      const duration = parseDuration(raw);
      if (duration === null) {
        console.log('duration は 例: 10s, 5m, 2h, 300 (秒) の形式で指定してください。');
        return;
      }
      await timeoutUser(args[1], args[2], duration, raw);   // ★ 4番目に raw を渡す

    } else if (command === 'serverMute' && args.length === 4) {
      const raw = args[3];                            // ★
      const duration = parseDuration(raw);
      if (duration === null) {
        console.log('duration は 例: 10s, 5m, 2h, 300 (秒) の形式で指定してください。');
        return;
      }
      await serverUserMute(args[1], args[2], duration, raw); // ★

    } else if (command === 'muteAll' && args.length === 3) {
      const raw = args[2];                            // ★
      const duration = parseDuration(raw);
      if (duration === null) {
        console.log('duration は 例: 10s, 5m, 2h, 300 (秒) の形式で指定してください。');
        return;
      }
      await muteAll(args[1], duration, raw);               // ★

    } else if (command === 'moveAll' && args.length === 3) {
      await moveAll(args[1], args[2]);

    } else if (command === 'disconnectAll' && args.length === 2) {
      await disconnectAll(args[1]);

    } else if (command === 'unmute' && args.length === 3) {
      // サーバーミュート解除
      if (!client.isReady()) throw new Error('Client is not ready');
      const guild = await client.guilds.fetch(args[1]).catch(() => null);
      if (!guild) {
        console.log('ギルドが見つかりません。');
        return;
      }
      const member = await guild.members.fetch(args[2]).catch(() => null) as GuildMember | null;
      if (!member) {
        console.log('ユーザーが見つかりません。');
        return;
      }
    }  else if (command === " addrole" && args.length === 4) {
      // ロール付与
      if (!client.isReady()) throw new Error('Client is not ready');
      const guild = await client.guilds.fetch(args[1]).catch(() => null);
      if (!guild) {
        console.log('ギルドが見つかりません。');
        return;
      }
      const member = await guild.members.fetch(args[2]).catch(() => null) as GuildMember | null;
      if (!member) {
        console.log('ユーザーが見つかりません。');
        return;
      }
      const role = await guild.roles.fetch(args[3]).catch(() => null);
      if (!role) {
        console.log('ロールが見つかりません。');
        return;
    } else if (member.roles.cache.has(role.id)) {
      console.log(`${member.user.tag} はすでにロール ${role.name} を持っています。`);
      return;
    }  
    
      await member.roles.add(role, 'コンソールコマンドによるロール付与');
      console.log(`✅ ${member.user.tag} にロール ${role.name} を付与しました。`);
    
    
      
      

    } else if (command === 'help') {
      console.log('利用可能なコマンド:');
      console.log('  move <guildId> <userId> <voiceChannelId>   - ユーザーを指定のVCに移動');
      console.log('  disconnect <guildId> <userId>              - ユーザーをVCから切断');
      console.log('  timeout <guildId> <userId> <second(s)/minute(s)/hour(s)>    - ユーザーをタイムアウト（0以下で解除）');
      console.log('  serverMute <guildId> <userId> <second(s)/minute(s)/hour(s)> - サーバーミュート（0以下なら解除なし）');
      console.log('  moveAll <guildId> <voiceChannelId>         - ギルド内の全VC参加者を指定VCへ移動');
      console.log('  disconnectAll <guildId>                    - ギルド内の全VC参加者を切断');
      console.log('  muteAll <guildId> <second(s)/minute(s)/hour(s)>             - ギルド内の全VC参加者を一括サーバーミュート');
      console.log('  unmute <guildId> <userId>      - ユーザーのサーバーミュートを解除');
      console.log('  help                               - このヘルプを表示');
      console.log('  addrole <guildId> <userId> <roleId>         - ユーザーにロールを付与');
    } else if (command) {
      console.log('不明なコマンドです。help で一覧を確認できます。');
    }
  } catch (err) {
    console.error('エラーが発生しました:', err);
  }
});

// index.ts 最後あたり
client.on('messageCreate', async (message: Message)=> {
  await handleMusicMessage(message);
});
