// src/music.ts
import { GuildMember, Message } from 'discord.js';

const PREFIX = 's!';

// ===== ユーザーごとの音量プリセット =====
const MIN_VOL = 0;
const MAX_VOL = 200;
const DEFAULT_VOL = 100;

// guildId -> (userId -> volume[%])
const userVolumes = new Map<string, Map<string, number>>();

function getUserVolume(guildId: string, userId: string): number {
  const g = userVolumes.get(guildId);
  return g?.get(userId) ?? DEFAULT_VOL;
}

function setUserVolume(guildId: string, userId: string, vol: number) {
  let g = userVolumes.get(guildId);
  if (!g) {
    g = new Map<string, number>();
    userVolumes.set(guildId, g);
  }
  g.set(userId, vol);
}

/**
 * メッセージコマンドのルーター
 *  s!play / s!skip / s!stop / s!queue / s!vol
 */
export async function handleMusicMessage(message: Message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const client: any = message.client as any;
  const lavalink = client.lavalink;
  if (!lavalink) {
    // lavalink 未初期化なら何もしない
    return;
  }

  const [cmd, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = cmd?.toLowerCase();

  try {
    if (command === 'play') {
      const query = rest.join(' ');
      if (!query) {
        await message.reply('🎵 再生したい曲の URL か キーワード を入力してください。');
        return;
      }
      await handlePlay(message, query);

    } else if (command === 'skip') {
      await handleSkip(message);

    } else if (command === 'stop') {
      await handleStop(message);

    } else if (command === 'queue') {
      await handleQueue(message);

    } else if (command === 'vol') {
      // s!vol           → 現在(自分の)設定表示
      // s!vol 80        → 80% に設定
      await handleVolume(message, rest[0]);
    }
  } catch (e) {
    console.error('[music] command error', e);
    try {
      await message.reply('❌ 音楽コマンドの処理中にエラーが発生しました。');
    } catch {}
  }
}

/**
 * このギルド用の Lavalink Player を取得 or 作成
 */
async function getOrCreatePlayer(message: Message, voiceChannelId: string) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  // 既存プレイヤー取得
  let player = lavalink.players.get(guildId);

  // なければ作成
  if (!player) {
    player = await lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId: message.channelId,
      selfDeaf: true,
      selfMute: false,
      volume: DEFAULT_VOL, // 初期値
    });
    await player.connect();
  } else if (player.voiceChannelId !== voiceChannelId) {
    // 別の VC に居たら移動
    await player.updateVoiceChannel(voiceChannelId);
    if (!player.connected) {
      await player.connect();
    }
  }

  return player;
}

/* ---------- s!play ---------- */
async function handlePlay(message: Message, query: string) {
  const member = message.member as GuildMember | null;
  const voice = member?.voice?.channel;
  if (!voice) {
    await message.reply('⚠️ 先にボイスチャンネルに参加してください。');
    return;
  }

  const client: any = message.client as any;
  const lavalink = client.lavalink;

  const player = await getOrCreatePlayer(message, voice.id);

  // 呼び出した人のプリセット音量を反映
  const volPref = getUserVolume(message.guildId!, message.author.id);
  try {
    await player.setVolume(volPref);
  } catch (e) {
    console.warn('[music] setVolume error (play)', e);
  }

  // 🔍 検索（URL/キーワード両対応）
  const result = await player.search(
    { query, source: 'youtube' },   // URL でもキーワードでも OK
    message.author,                 // requester
  );

  if (!result || !result.tracks?.length) {
    await message.reply('🔍 曲が見つかりませんでした…。');
    return;
  }

  // 1曲だけ採用（URLならその動画、キーワードなら先頭）
  const track = result.tracks[0];

  await player.queue.add(track);

  if (!player.playing && !player.paused) {
    // 何も再生してなければすぐ再生
    await player.play();
    await message.reply(`▶ 再生開始: **${track.info.title}**（音量: ${volPref}%）`);
  } else {
    // 既に再生中ならキューへ
    const pos = player.queue.tracks.length;
    await message.reply(`⏱ キューに追加しました: **${track.info.title}**（位置: ${pos}）`);
  }
}

/* ---------- s!vol ---------- */
async function handleVolume(message: Message, volArg?: string) {
  if (!message.guildId) {
    await message.reply('⚠️ サーバー内でのみ使用できます。');
    return;
  }

  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;
  const userId = message.author.id;

  const player = lavalink.players.get(guildId);

  // 引数なし → 現在の自分の設定 + 実際のプレイヤー音量を表示
  if (!volArg) {
    const pref = getUserVolume(guildId, userId);
    const currentPlayerVol = player?.volume ?? pref;

    await message.reply(
      `🔊 あなたの音量設定: **${pref}%**\n` +
      `🎧 現在のプレイヤー音量: **${currentPlayerVol}%**\n` +
      '※ 実際に流れる音量は VC 全員共通です（最後に s!vol を実行した人の設定が適用されます）。'
    );
    return;
  }

  const num = Number(volArg);
  if (!Number.isFinite(num)) {
    await message.reply('⚠️ 音量は 0〜100 の数値で指定してください。例: `s!vol 80`');
    return;
  }

  const clamped = Math.min(MAX_VOL, Math.max(MIN_VOL, Math.round(num)));

  // 自分のプリセットを保存
  setUserVolume(guildId, userId, clamped);

  // プレイヤーがあれば即反映（＝このギルド全体の音量が変わる）
  if (player) {
    try {
      await player.setVolume(clamped);
    } catch (e) {
      console.warn('[music] setVolume error (vol)', e);
    }
  }

  await message.reply(
    `🔊 あなたの音量設定を **${clamped}%** にしました。\n` +
    'このギルドのプレイヤーも同じ音量に変更されています。'
  );
}

/* ---------- s!skip ---------- */
async function handleSkip(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  const hasNext =
    player &&
    (player.current || (player.queue && player.queue.tracks && player.queue.tracks.length));

  if (!hasNext) {
    await message.reply('⏹ スキップできる曲がありません。');
    return;
  }

  await player.skip();
  await message.reply('⏭ 曲をスキップしました。');
}

/* ---------- s!stop ---------- */
async function handleStop(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply('⏹ 既に停止しています。');
    return;
  }

  await player.destroy();
  await message.reply('⏹ 再生を停止し、VCから退出しました。');
}

/* ---------- s!queue ---------- */
async function handleQueue(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply('📭 再生中・キュー中の曲はありません。');
    return;
  }

  const current = player.current;
  const tracks = player.queue?.tracks ?? [];

  if (!current && !tracks.length) {
    await message.reply('📭 再生中・キュー中の曲はありません。');
    return;
  }

  const lines: string[] = [];
  if (current) {
    lines.push(`▶ 再生中: **${current.info.title}**`);
  }
  if (tracks.length) {
    lines.push('', '📃 キュー:');
    lines.push(
      ...tracks.map((t: any, i: number) => `${i + 1}. **${t.info.title}**`),
    );
  }

  await message.reply(lines.join('\n'));
}
