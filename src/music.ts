// src/music.ts
import { GuildMember, Message, PermissionFlagsBits } from "discord.js";
import * as mm from "music-metadata";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import {
  addMusicNgWord,
  clearMusicNgWords,
  getMusicNgWords,
  removeMusicNgWord,
  getMusicEnabled,
  setMusicEnabled,
} from "./data";

const PREFIX = "s!";

const MAX_TRACK_MINUTES = Number(process.env.MUSIC_MAX_MINUTES || 15); // デフォ15分
const MAX_TRACK_MS = MAX_TRACK_MINUTES * 60 * 1000;

// ギルドごとの自動停止タイマー（長さ不明対策・上限厳守）
const autoStopTimers = new Map<string, NodeJS.Timeout>();
const hookedPlayers = new Set<string>();

function clearAutoStop(guildId: string) {
  const t = autoStopTimers.get(guildId);
  if (t) clearTimeout(t);
  autoStopTimers.delete(guildId);
}

function armAutoStop(
  guildId: string,
  player: any,
  ms: number,
  trackId?: string,
) {
  clearAutoStop(guildId);
  const timeout = setTimeout(() => {
    try {
      const cur: any = player.current;
      const curId = cur?.info?.identifier ?? cur?.encoded ?? cur?.track ?? "";
      if (!trackId || curId === trackId) {
        if (player.playing) player.stop();
      }
    } catch {}
  }, ms);
  autoStopTimers.set(guildId, timeout);
}

function hookPlayerOnce(guildId: string, player: any) {
  if (hookedPlayers.has(guildId)) return;
  hookedPlayers.add(guildId);

  const on = (player as any)?.on?.bind(player);
  if (!on) return;

  on("trackStart", (_p: any, track: any) => {
    try {
      const lengthMs = Number(track?.info?.length ?? 0);
      const rawIsStream = track?.info?.isStream ?? track?.isStream;
      const isStream =
        rawIsStream === true || rawIsStream === "true" || rawIsStream === 1;
      const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
      const trackId =
        track?.info?.identifier ?? track?.encoded ?? track?.track ?? "";

      if (isStream || !hasDuration) {
        armAutoStop(guildId, player, MAX_TRACK_MS, trackId);
        return;
      }
      armAutoStop(guildId, player, Math.min(lengthMs, MAX_TRACK_MS), trackId);
    } catch {}
  });

  on("queueEnd", () => clearAutoStop(guildId));
  on("playerDestroy", () => clearAutoStop(guildId));
  on("trackEnd", () => clearAutoStop(guildId));
}
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_SELECTION_RESULTS = 10;
const PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;
const pendingSearches = new Map<
  string,
  {
    tracks: any[];
    query: string;
    expiresAt: number;
  }
>();
// ===== ファイルアップロード用の簡易サーバー設定 =====
const UPLOAD_DIR = path.resolve(process.env.FILE_DIR || "./files");
//サーバー起動
const app = express();
app.use("/uploads", express.static(UPLOAD_DIR));
const PORT = Number(process.env.FILE_PORT || 3001);
app.listen(PORT, "0.0.0.0", () => {
  // console.log(`📦 Upload file server: http://192.168.11.2:${PORT}/uploads/`);
});

function makeInternalUrl(filename: string) {
  // Lavalink が同じPCならこれが最強
  const base =
    process.env.UPLOAD_INTERNAL_URL || "http://192.168.11.2:3001/uploads";
  return `${base}/${filename}`;
}

function makePublicUrl(filename: string) {
  // 人に見せる用（任意）
  const base =
    process.env.UPLOAD_BASE_URL || "http://play.hotamachi.jp:3001/uploads";
  return `${base}/${filename}`;
}

function findNgWordMatch(
  texts: Array<string | undefined>,
  ngWords: string[],
): string | null {
  if (!ngWords.length) return null;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  return ngWords.find((w) => w && haystack.includes(w)) ?? null;
}

function makePendingKey(message: Message) {
  return `${message.guildId}:${message.author.id}`;
}

function getPendingSearch(message: Message) {
  const key = makePendingKey(message);
  const pending = pendingSearches.get(key);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    pendingSearches.delete(key);
    return null;
  }
  return pending;
}

function setPendingSearch(message: Message, tracks: any[], query: string) {
  const key = makePendingKey(message);
  pendingSearches.set(key, {
    tracks,
    query,
    expiresAt: Date.now() + PENDING_SEARCH_TTL_MS,
  });
}

function clearPendingSearch(message: Message) {
  pendingSearches.delete(makePendingKey(message));
}

function formatTrackDuration(lengthMs: number) {
  if (!Number.isFinite(lengthMs) || lengthMs <= 0) return "";
  const totalSeconds = Math.floor(lengthMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function decodeAttachmentName(name: string) {
  if (!/%[0-9A-Fa-f]{2}/.test(name)) return name;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function getAttachmentNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").pop() ?? "";
    return decodeAttachmentName(base);
  } catch {
    return "";
  }
}

function pickAttachmentName(att: { name?: string | null; url: string }) {
  // まずは discord.js の name を信じる（これが一番正しいことが多い）
  const fromName = decodeAttachmentName(att.name ?? "");
  if (fromName) return fromName;

  // name が空のときだけ URL から拾う
  const fromUrl = getAttachmentNameFromUrl(att.url);
  return fromUrl || "upload";
}

function trimId3Text(value: string) {
  return value.replace(/\0/g, "").trim();
}

function swapUtf16ByteOrder(value: Buffer) {
  const swapped = Buffer.allocUnsafe(value.length);
  for (let i = 0; i + 1 < value.length; i += 2) {
    swapped[i] = value[i + 1];
    swapped[i + 1] = value[i];
  }
  if (value.length % 2 === 1) {
    swapped[value.length - 1] = value[value.length - 1];
  }
  return swapped;
}

function decodeId3Text(data: Buffer, encodingByte: number) {
  if (!data.length) return "";
  switch (encodingByte) {
    case 0:
      return data.toString("latin1");
    case 1: {
      if (data.length >= 2) {
        const bom = data.readUInt16BE(0);
        if (bom === 0xfffe) return data.slice(2).toString("utf16le");
        if (bom === 0xfeff)
          return swapUtf16ByteOrder(data.slice(2)).toString("utf16le");
      }
      return data.toString("utf16le");
    }
    case 2:
      return swapUtf16ByteOrder(data).toString("utf16le");
    case 3:
      return data.toString("utf8");
    default:
      return data.toString("utf8");
  }
}

function decodeSynchsafeInt(bytes: Buffer) {
  if (bytes.length < 4) return 0;
  return (
    ((bytes[0] & 0x7f) << 21) |
    ((bytes[1] & 0x7f) << 14) |
    ((bytes[2] & 0x7f) << 7) |
    (bytes[3] & 0x7f)
  );
}

function readId3v2Title(buffer: Buffer) {
  if (buffer.length < 10) return null;
  if (buffer.toString("ascii", 0, 3) !== "ID3") return null;
  const version = buffer[3];
  if (version !== 3 && version !== 4) return null;

  const flags = buffer[5];
  const tagSize = decodeSynchsafeInt(buffer.slice(6, 10));
  let offset = 10;

  if (flags & 0x40) {
    if (offset + 4 <= buffer.length) {
      if (version === 3) {
        const extSize = buffer.readUInt32BE(offset);
        offset += 4 + extSize;
      } else {
        const extSize = decodeSynchsafeInt(buffer.slice(offset, offset + 4));
        offset += extSize;
      }
    }
  }

  const tagEnd = Math.min(buffer.length, offset + tagSize);
  while (offset + 10 <= tagEnd) {
    const frameId = buffer.toString("ascii", offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
    const frameSize =
      version === 4
        ? decodeSynchsafeInt(buffer.slice(offset + 4, offset + 8))
        : buffer.readUInt32BE(offset + 4);
    if (!frameSize) break;

    const frameDataStart = offset + 10;
    const frameDataEnd = frameDataStart + frameSize;
    if (frameDataEnd > buffer.length) break;

    if (frameId === "TIT2") {
      const encodingByte = buffer[frameDataStart];
      const title = trimId3Text(
        decodeId3Text(
          buffer.slice(frameDataStart + 1, frameDataEnd),
          encodingByte,
        ),
      );
      return title || null;
    }

    offset = frameDataEnd;
  }

  return null;
}

function readId3v1Title(buffer: Buffer) {
  if (buffer.length < 128) return null;
  const start = buffer.length - 128;
  if (buffer.toString("ascii", start, start + 3) !== "TAG") return null;
  const raw = buffer.slice(start + 3, start + 33).toString("latin1");
  const title = trimId3Text(raw);
  return title || null;
}

function getId3TitleFromBuffer(buffer: Buffer) {
  return readId3v2Title(buffer) ?? readId3v1Title(buffer);
}

/**
 * メッセージコマンドのルーター
 *  s!play / s!skip / s!stop / s!queue / s!upload / s!ng
 */
export async function handleMusicMessage(message: Message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const client: any = message.client as any;
  const lavalink = client.lavalink;
  if (!lavalink) return;

  const [cmd, ...rest] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);
  const command = cmd?.toLowerCase();

  // 音楽機能が無効の場合、disable/enable以外は拒否
  if (
    command !== "disable" &&
    command !== "enable" &&
    command !== "d" &&
    command !== "e"
  ) {
    if (!getMusicEnabled(message.guildId!)) {
      await message.reply(
        "⚠️ 音楽機能が無効化されています。管理者権限で `s!enable` で有効化してください。",
      );
      return;
    }
  }

  try {
    if (command === "play") {
      const query = rest.join(" ").trim();
      if (!query) {
        await message.reply(
          "🎵 再生したい曲の URL か キーワード を入力してください。",
        );
        return;
      }
      const pick = query.match(/^(10|[1-9])$/);
      if (pick) {
        const pending = getPendingSearch(message);
        if (pending) {
          const index = Number(pick[1]) - 1;
          const track = pending.tracks[index];
          if (!track) {
            await message.reply(
              `?? 選択番号は 1〜${pending.tracks.length} で指定してください。`,
            );
            return;
          }
          clearPendingSearch(message);
          await handlePlay(message, query, { selectedTrack: track });
          return;
        }
        await message.reply(
          "⚠️ その番号を選択できる候補がありません。先に s!play で曲を検索してください。",
        );
        return;
      }
      await handlePlay(message, query);
    } else if (command === "skip") {
      await handleSkip(message);
    } else if (command === "stop") {
      await handleStop(message);
    } else if (command === "queue") {
      await handleQueue(message);
    } else if (command === "upload") {
      await handleUpload(message);
    } else if (command === "ng" || command === "ngword") {
      await handleNgWordCommand(message, rest);
    } else if (command === "help") {
      await message.reply(
        "🎵 音楽コマンド一覧:\n" +
          "`s!play <URL or キーワード>` - 曲を再生・キューに追加\n" +
          "`s!skip` - 曲をスキップ\n" +
          "`s!stop` - 再生を停止し、VCから退出\n" +
          "`s!queue` - 再生中・キュー中の曲一覧を表示\n" +
          "`s!upload` - 音楽ファイルをアップロードして再生（対応形式: mp3, wav, flac, m4a, aac, ogg）\n" +
          "`s!ng <サブコマンド>` - 音楽NGワード管理コマンド（管理者のみ）\n" +
          "（例: `s!ng add <ワード>` / `s!ng remove <ワード>` / `s!ng list` / `s!ng clear`）\n" +
          "`s!disable` (s!e) - 音楽機能を無効化（管理者のみ）\n" +
          "`s!enable` (s!d) - 音楽機能を有効化（管理者のみ）",
      );
    } else if (command === "remove" || command === "delete") {
      await handleRemoveCommand(message, rest);
    } else if (command === "disable" || command === "e") {
      await handleDisable(message);
    } else if (command === "enable" || command === "d") {
      await handleEnable(message);
    }
  } catch (e) {
    console.error("[music] command error", e);
    try {
      await message.reply("❌ 音楽コマンドの処理中にエラーが発生しました。");
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

  // ★ 各プレイヤーにイベントフック（自動停止タイマー）
  hookPlayerOnce(guildId, player);

  return player;
}

/* ---------- s!play ---------- */
async function handlePlay(
  message: Message,
  query: string,
  options?: {
    titleFallback?: string;
    forceTitle?: boolean;
    selectedTrack?: any;
  },
) {
  const member = message.member as GuildMember | null;
  const voice = member?.voice?.channel;
  if (!voice) {
    await message.reply("⚠️ 先にボイスチャンネルに参加してください。");
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
    console.warn("[music] setVolume error (play)", e);
  }

  let track: any = options?.selectedTrack;

  const isHttpUrl = /^https?:\/\//i.test(query);
  if (!track) {
    let result: any;
    // ★URLかキーワードかで searchQuery を確定させる
    const searchQuery = isHttpUrl ? query : `ytsearch:${query}`;

    try {
      result = await player.search({ query: searchQuery }, message.author);
    } catch (e) {
      console.warn("[music] search error", e);
    }

    if (!result?.tracks?.length) {
      await message.reply("🔍 曲が見つかりませんでした…。");
      return;
    }

    if (!isHttpUrl) {
      const selectionTracks = result.tracks.slice(0, MAX_SELECTION_RESULTS);
      setPendingSearch(message, selectionTracks, query);
      const lines = selectionTracks.map((t: any, i: number) => {
        const title = t.info?.title ?? "Unknown title";
        const author = t.info?.author ? ` - ${t.info.author}` : "";
        const duration = formatTrackDuration(Number(t.info?.length ?? 0));
        const durationText = duration ? ` (${duration})` : "";
        return `${i + 1}. ${title}${author}${durationText}`;
      });
      await message.reply(
        `🔎 候補が見つかりました。番号で選んでください。\n` +
          `${lines.join("\n")}\n` +
          `\n\`s!play 1\`〜\`s!play ${lines.length}\``,
      );
      return;
    }

    track = result.tracks[0];
  }

  clearPendingSearch(message);
  if (!track) {
    await message.reply("🔍 曲が見つかりませんでした…。");
    return;
  }

  const lengthMs = Number(track.info?.duration ?? track.info?.length ?? 0);


  const searchQuery = isHttpUrl ? query : `ytsearch:${query}`;

  const result = await player.search({ query: searchQuery }, message.author);

  //console.log(
   // "[music] title=",
    //track.info?.title,
    //"length=",
    //track.info?.length,
    //"duration=",
    //(track.info as any)?.duration,
    //"track.length=",
    //(track as any)?.length,
    //"isStream=",
    //(track.info as any)?.isStream,
  //);

  const rawIsStream = (track.info as any)?.isStream ?? (track as any)?.isStream;
  const isStream =
    rawIsStream === true || rawIsStream === "true" || rawIsStream === 1;
  const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;

  const titleFallback = options?.titleFallback?.trim();
  const trackTitle = track.info?.title?.trim();
  const isUnknownTitle =
    !trackTitle || trackTitle.toLowerCase() === "unknown title";
  if (titleFallback && (options?.forceTitle || isUnknownTitle)) {
    track.info.title = titleFallback;
  }

  // ライブ/ストリームっぽいものは弾く（必要なら許可に変えられる）
  if (isStream) {
    await message.reply(
      `🚫 ライブ配信/長さ不明の曲は再生できません。（最大 ${MAX_TRACK_MINUTES} 分まで）`,
    );
    return;
  }

  // ★ 長さが取れない曲も許可（ただし最大15分で自動停止）
  if (!hasDuration) {
    // 停止タイマーは trackStart フックで張られます
  }

  if (hasDuration && lengthMs > MAX_TRACK_MS) {
    const mins = Math.floor(lengthMs / 60000);
    const secs = Math.floor((lengthMs % 60000) / 1000);
    await message.reply(
      `🚫 この曲は長すぎます（${mins}:${secs.toString().padStart(2, "0")}）。最大 ${MAX_TRACK_MINUTES} 分までです。`,
    );
    return;
  }

  const ngWords = getMusicNgWords(message.guildId!);
  const ngMatch = findNgWordMatch(
    [track.info?.title, track.info?.author],
    ngWords,
  );
  if (ngMatch) {
    await message.reply("🚫 NGワードが含まれているため再生できません。");
    return;
  }

  await player.queue.add(track);

  if (!player.playing && !player.paused) {
    await player.play();
    if (!hasDuration) {
      await message.reply(
        `▶ 再生開始: **${track.info.title}**（音量: ${FIXED_VOLUME}）\n` +
          `⚠️ 曲の長さを取得できないため、最大 ${MAX_TRACK_MINUTES} 分で自動停止します。`,
      );
    } else {
      await message.reply(
        `▶ 再生開始: **${track.info.title}**（音量: ${FIXED_VOLUME}）`,
      );
    }
  } else {
    const pos = player.queue.tracks.length;
    await message.reply(
      `⏱ キューに追加しました: **${track.info.title}**（位置: ${pos}）`,
    );
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
    await message.reply("⏹ スキップできる曲がありません。");
    return;
  }

  clearAutoStop(guildId);
  await player.skip();
  await message.reply("⏭ 曲をスキップしました。");
}

/* ---------- s!stop ---------- */
async function handleStop(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply("⏹ 既に停止しています。");
    return;
  }

  clearAutoStop(guildId);
  await player.destroy();
  await message.reply("⏹ 再生を停止し、VCから退出しました。");
}

/* ---------- s!queue ---------- */
async function handleQueue(message: Message) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply("📭 再生中・キュー中の曲はありません。");
    return;
  }

  const current = player.current;
  const tracks = player.queue?.tracks ?? [];

  if (!current && !tracks.length) {
    await message.reply("📭 再生中・キュー中の曲はありません。");
    return;
  }

  const lines: string[] = [];
  if (current) lines.push(`▶ 再生中: **${current.info.title}**`);
  if (tracks.length) {
    lines.push("", "📃 キュー:");
    lines.push(
      ...tracks.map((t: any, i: number) => `${i + 1}. **${t.info.title}**`),
    );
  }

  await message.reply(lines.join("\n"));
}

/* ---------- s!ng ---------- */
async function handleNgWordCommand(message: Message, args: string[]) {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const sub = args[0]?.toLowerCase();
  const isAdmin =
    message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const isOwner = message.guild?.ownerId === message.author.id;
  const isDev = OWNER_IDS.includes(message.author.id);
  const canManage = isAdmin || isOwner || isDev;

  if (!sub || sub === "help") {
    await message.reply(
      "使い方: `s!ng add <word>` / `s!ng remove <word>` / `s!ng list` / `s!ng clear`",
    );
    return;
  }

  if (sub === "list") {
    const list = getMusicNgWords(message.guildId);
    if (!list.length) {
      await message.reply("📭 NGワードは登録されていません。");
      return;
    }
    const lines = list.map((w, i) => `${i + 1}. ${w}`).join("\n");
    await message.reply(`🚫 NGワード一覧:\n${lines}`);
    return;
  }

  if (!canManage) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  if (sub === "add") {
    const word = args.slice(1).join(" ").trim();
    if (!word) {
      await message.reply("⚠️ 追加するワードを指定してください。");
      return;
    }
    const result = addMusicNgWord(message.guildId!, word);
    await message.reply(
      result.added
        ? `✅ NGワードを追加しました: **${word}**`
        : `⚠️ すでに登録済みです: **${word}**`,
    );
    return;
  }

  if (sub === "remove" || sub === "del" || sub === "delete") {
    const word = args.slice(1).join(" ").trim();
    if (!word) {
      await message.reply("⚠️ 削除するワードを指定してください。");
      return;
    }
    const result = removeMusicNgWord(message.guildId!, word);
    await message.reply(
      result.removed
        ? `✅ NGワードを削除しました: **${word}**`
        : `⚠️ NGワードにありません: **${word}**`,
    );
    return;
  }

  if (sub === "clear") {
    clearMusicNgWords(message.guildId!);
    await message.reply("✅ NGワードをすべて削除しました。");
    return;
  }

  await message.reply(
    "⚠️ コマンドが不明です。`s!ng help` で使い方を確認できます。",
  );
}

/* ---------- s!upload ---------- */
async function handleUpload(message: Message) {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const allowedExts = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"];
  const allowedExtsLabel = allowedExts
    .map((ext) => ext.replace(".", ""))
    .join(", ");
  const contentTypeToExt: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
  };

  const att = message.attachments.first();
  if (!att) {
    await message.reply("📎 ファイルを添付してね。");
    return;
  }

  const originalName = pickAttachmentName(att);
  let ext = path.extname(originalName).toLowerCase();
  if (!ext && att.contentType) {
    ext = contentTypeToExt[att.contentType] ?? "";
  }
  if (!ext || !allowedExts.includes(ext)) {
    await message.reply(`⚠️ 対応形式は **${allowedExtsLabel}** です。`);
    return;
  }
  const displayName = ext
    ? originalName.toLowerCase().endsWith(ext)
      ? originalName
      : `${originalName}${ext}`
    : originalName;

  const ngWords = getMusicNgWords(message.guildId);
  const ngMatch = findNgWordMatch([displayName], ngWords);
  if (ngMatch) {
    await message.reply(
      "🚫 このファイル名はNGワードが含まれているためアップロードできません。",
    );
    return;
  }

  // ★ 保存ディレクトリを必ず作る
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const filename = `${id}${ext}`;
  const savePath = path.join(UPLOAD_DIR, filename);

  try {
    const res = await fetch(att.url);
    if (!res.ok)
      throw new Error(`download failed: ${res.status} ${res.statusText}`);

    const buf = Buffer.from(await res.arrayBuffer());
    let playbackTitle = displayName;

    try {
      const meta = await mm.parseBuffer(buf, att.contentType ?? undefined);
      const title = meta.common.title?.trim();
      if (title) playbackTitle = title;
    } catch (e) {
      // メタ取得失敗しても無視でOK
    }

    fs.writeFileSync(savePath, buf);

    const publicUrl = makePublicUrl(filename);
    const internalUrl = makeInternalUrl(filename);

    await message.reply(
      `✅ アップロード完了: **${playbackTitle}**\n` +
        `🌐 公開URL: ${publicUrl}\n` +
        `▶ 再生します…`,
    );

    // ★再生は internalUrl を渡す（ここ重要）
    try {
      await handlePlay(message, internalUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
      });
    } catch {
      await handlePlay(message, publicUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
      });
    }
  } catch (e) {
    console.error("[music] upload error", e);
    try {
      fs.existsSync(savePath) && fs.unlinkSync(savePath);
    } catch {}
    await message.reply("❌ アップロード処理に失敗しました。");
  }
}
async function handleRemoveCommand(message: Message, rest: string[]) {
  const client: any = message.client as any;
  const lavalink = client.lavalink;
  const guildId = message.guildId!;

  const player = lavalink.players.get(guildId);
  if (!player || !player.queue?.tracks?.length) {
    await message.reply("⏹ キューに曲がありません。");
    return;
  }

  const indexStr = rest[0];
  if (!indexStr || !/^\d+$/.test(indexStr)) {
    await message.reply(
      "⚠️ 削除する曲の番号を指定してください。（例: `s!remove 2`）",
    );
    return;
  }

  const index = Number(indexStr) - 1;
  if (index < 0 || index >= player.queue.tracks.length) {
    await message.reply(
      `⚠️ 番号は 1〜${player.queue.tracks.length} で指定してください。`,
    );
    return;
  }

  const removed = player.queue.tracks.splice(index, 1)[0];
  await message.reply(`🗑 キューから削除しました: **${removed.info.title}**`);
}

/* ---------- s!disable (s!e) ---------- */
async function handleDisable(message: Message) {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const isAdmin =
    message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const isOwner = message.guild?.ownerId === message.author.id;
  const isDev = OWNER_IDS.includes(message.author.id);
  if (!isAdmin && !isOwner && !isDev) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  setMusicEnabled(message.guildId, false);
  await message.reply("🔇 音楽機能を無効化しました。");
}

/* ---------- s!enable (s!d) ---------- */
async function handleEnable(message: Message) {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const isAdmin =
    message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const isOwner = message.guild?.ownerId === message.author.id;
  const isDev = OWNER_IDS.includes(message.author.id);
  if (!isAdmin && !isOwner && !isDev) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  setMusicEnabled(message.guildId, true);
  await message.reply("🔊 音楽機能を有効化しました。");
}
