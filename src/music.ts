// src/music.ts
import { GuildMember, Message } from 'discord.js';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';

const PREFIX = 's!';
// ===== ファイルアップロード用の簡易サーバー設定 =====
const UPLOAD_DIR = path.resolve(process.env.FILE_DIR || './files');
//サーバー起動
const app = express();
app.use('/uploads', express.static(UPLOAD_DIR));
const PORT = Number(process.env.FILE_PORT || 3001);
app.listen(PORT,'0.0.0.0', () => {
  console.log(`📦 Upload file server: http://192.168.11.2:${PORT}/uploads/`);
});



function makeInternalUrl(filename: string) {
  // Lavalink が同じPCならこれが最強
  const base = process.env.UPLOAD_INTERNAL_URL || 'http://192.168.11.2:3001/uploads';
  return `${base}/${filename}`;
}

function makePublicUrl(filename: string) {
  // 人に見せる用（任意）
  const base = process.env.UPLOAD_BASE_URL || 'http://play.hotamachi.jp:3001/uploads';
  return `${base}/${filename}`;
}


/**
 * メッセージコマンドのルーター
 *  s!play / s!skip / s!stop / s!queue/ s!upload
 */
export async function handleMusicMessage(message: Message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const client: any = message.client as any;
  const lavalink = client.lavalink;
  if (!lavalink) return;

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
   } else if (command === 'upload') {
      await handleUpload(message);
}

  } catch (e) {
    console.error('[music] command error', e);
    try { await message.reply('❌ 音楽コマンドの処理中にエラーが発生しました。'); } catch {}
  }
}

/**
 * このギルド用の Lavalink Player を取得 or 作成
 */
async function getOrCreatePlayer(message: Message, voiceChannelId: string) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;
  const FIXED_VOLUME = 20; // デフォルト固定音量（ユーザー個別設定は play 時に反映）
  let player = lavalink.players.get(guildId);

  if (!player) {
   player = await lavalink.createPlayer({
  guildId,
  voiceChannelId,
  textChannelId: message.channelId,
  selfDeaf: true,
  selfMute: false,
  volume: FIXED_VOLUME,
  });

    await player.connect();
  } else if (player.voiceChannelId !== voiceChannelId) {
    await player.updateVoiceChannel(voiceChannelId);
    if (!player.connected) await player.connect();
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

  // ============================
  // ✅ 音量は常に 20 に固定する
  // （ユーザー別/DBの音量は使わない）
  // ============================
  const FIXED_VOLUME = 20;
  try {
    await player.setVolume(FIXED_VOLUME);
  } catch (e) {
    console.warn('[music] setVolume error (play)', e);
  }

  // URLならHTTP、キーワードならYouTube
  const isHttpUrl = /^https?:\/\//i.test(query);

  let result: any;
  if (isHttpUrl) {
    result = await player.search({ query, source: 'http' }, message.author);
  } else {
    result = await player.search({ query, source: 'youtube' }, message.author);
  }

  console.log('[music] search query=', query);
  console.log('[music] isHttpUrl=', isHttpUrl);
  console.log('[music] loadType=', result?.loadType);
  console.log('[music] tracks len=', result?.tracks?.length ?? 0);
  console.log('[music] exception=', (result as any)?.exception);

  if (!result?.tracks?.length) {
    await message.reply('🔍 曲が見つかりませんでした…。');
    return;
  }

  const track = result.tracks[0];
  await player.queue.add(track);

  if (!player.playing && !player.paused) {
    await player.play();
    await message.reply(`▶ 再生開始: **${track.info.title}**（音量: ${FIXED_VOLUME}）`);
  } else {
    const pos = player.queue.tracks.length;
    await message.reply(`⏱ キューに追加しました: **${track.info.title}**（位置: ${pos}）`);
  }
}


/* ---------- s!skip ---------- */
async function handleSkip(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  const hasNext =
    player && (player.current || (player.queue?.tracks?.length ?? 0) > 0);

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
  if (current) lines.push(`▶ 再生中: **${current.info.title}**`);
  if (tracks.length) {
    lines.push('', '📃 キュー:');
    lines.push(...tracks.map((t: any, i: number) => `${i + 1}. **${t.info.title}**`));
  }

  await message.reply(lines.join('\n'));
}

/* ---------- s!upload ---------- */
async function handleUpload(message: Message) {
  if (!message.guildId) {
    await message.reply('⚠️ サーバー内でのみ使用できます。');
    return;
  }

  const att = message.attachments.first();
  if (!att) {
    await message.reply('📎 mp3ファイルを添付して `s!upload` を送ってね。');
    return;
  }

  const originalName = att.name ?? 'upload.mp3';
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.mp3') {
    await message.reply('⚠️ いまは **.mp3** のみ対応です。');
    return;
  }

  // ★ 保存ディレクトリを必ず作る
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const filename = `${id}.mp3`;
  const savePath = path.join(UPLOAD_DIR, filename);

  try {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(savePath, buf);

    const url = makePublicUrl(filename);

   const publicUrl = makePublicUrl(filename);
   const internalUrl = makeInternalUrl(filename);

  await message.reply(
    `✅ アップロード完了: **${originalName}**\n` +
    `🌐 公開URL: ${publicUrl}\n` +
    `▶ 再生します…`
   );

// ★再生は internalUrl を渡す（ここ重要）
await handlePlay(message, internalUrl);


    // ここでそのまま再生（URLをplayへ）
    await handlePlay(message, internalUrl);

  } catch (e) {
    console.error('[music] upload error', e);
    try { fs.existsSync(savePath) && fs.unlinkSync(savePath); } catch {}
    await message.reply('❌ アップロード処理に失敗しました。');
  }
}
