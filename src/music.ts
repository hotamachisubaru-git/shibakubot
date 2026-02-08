// src/music.ts
import { GuildMember, Message, PermissionFlagsBits } from "discord.js";
import * as mm from "music-metadata";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  LavalinkManager,
  Player,
  Track,
  UnresolvedTrack,
  type SearchResult,
  type UnresolvedSearchResult,
} from "lavalink-client";
import {
  addMusicNgWord,
  clearMusicNgWords,
  getMusicNgWords,
  removeMusicNgWord,
  getMusicEnabled,
  setMusicEnabled,
} from "./data";

const PREFIX = "s!";
const FIXED_VOLUME = 20;
const MAX_SELECTION_RESULTS = 10;
const PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseCsvIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token): token is string => token.length > 0);
}

function getLavalink(message: Message): LavalinkManager<Player> | null {
  const client = message.client as Message["client"] & {
    lavalink?: LavalinkManager<Player>;
  };
  return client.lavalink ?? null;
}

function getTrackId(track: Track | UnresolvedTrack | null | undefined): string {
  return track?.info.identifier ?? track?.encoded ?? "";
}

function getTrackDurationMs(track: Track | UnresolvedTrack): number {
  const info = track.info as UnresolvedTrack["info"] & { length?: number };
  const rawDuration = info.duration ?? info.length ?? 0;
  return Number(rawDuration);
}

function isStreamTrack(track: Track | UnresolvedTrack): boolean {
  return track.info.isStream === true;
}

function getTrackTitle(track: Track | UnresolvedTrack): string {
  const title = track.info.title?.trim();
  return title && title.length > 0 ? title : "Unknown title";
}

type PendingTrack = Track | UnresolvedTrack;
type LegacyStoppablePlayer = Player & {
  stop?: () => Promise<unknown> | unknown;
};
type PendingSearch = {
  tracks: PendingTrack[];
  query: string;
  expiresAt: number;
};

const MAX_TRACK_MINUTES = parsePositiveInt(process.env.MUSIC_MAX_MINUTES, 15); // デフォ15分
const MAX_TRACK_MS = MAX_TRACK_MINUTES * 60 * 1000;
const OWNER_IDS = parseCsvIds(process.env.OWNER_IDS);

// ギルドごとの自動停止タイマー（長さ不明対策・上限厳守）
const autoStopTimers = new Map<string, NodeJS.Timeout>();
const hookedManagers = new WeakSet<LavalinkManager<Player>>();

function clearAutoStop(guildId: string): void {
  const t = autoStopTimers.get(guildId);
  if (t) clearTimeout(t);
  autoStopTimers.delete(guildId);
}

function stopPlayerNow(player: Player): void {
  const legacyPlayer = player as LegacyStoppablePlayer;
  if (typeof legacyPlayer.stop === "function") {
    void Promise.resolve(legacyPlayer.stop()).catch(() => undefined);
    return;
  }
  void player.stopPlaying(true, false).catch(() => undefined);
}

function armAutoStop(
  guildId: string,
  player: Player,
  ms: number,
  trackId?: string,
): void {
  clearAutoStop(guildId);
  const timeout = setTimeout(() => {
    try {
      const curId = getTrackId(player.queue.current);
      if (!trackId || curId === trackId) {
        if (player.playing) {
          stopPlayerNow(player);
        }
      }
    } catch {}
  }, ms);
  autoStopTimers.set(guildId, timeout);
}

function hookManagerAutoStopOnce(lavalink: LavalinkManager<Player>): void {
  if (hookedManagers.has(lavalink)) return;
  hookedManagers.add(lavalink);

  lavalink.on("trackStart", (player, track) => {
    if (!track) {
      clearAutoStop(player.guildId);
      return;
    }

    const lengthMs = getTrackDurationMs(track);
    const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
    const trackId = getTrackId(track);

    if (!hasDuration) {
      armAutoStop(player.guildId, player, MAX_TRACK_MS, trackId);
      return;
    }
    armAutoStop(player.guildId, player, Math.min(lengthMs, MAX_TRACK_MS), trackId);
  });

  lavalink.on("queueEnd", (player) => clearAutoStop(player.guildId));
  lavalink.on("playerDestroy", (player) => clearAutoStop(player.guildId));
  lavalink.on("trackEnd", (player) => clearAutoStop(player.guildId));
}

const pendingSearches = new Map<string, PendingSearch>();
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

function getPendingSearch(message: Message): PendingSearch | null {
  const key = makePendingKey(message);
  const pending = pendingSearches.get(key);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    pendingSearches.delete(key);
    return null;
  }
  return pending;
}

function setPendingSearch(
  message: Message,
  tracks: PendingTrack[],
  query: string,
): void {
  const key = makePendingKey(message);
  pendingSearches.set(key, {
    tracks,
    query,
    expiresAt: Date.now() + PENDING_SEARCH_TTL_MS,
  });
}

function clearPendingSearch(message: Message): void {
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

function pickAttachmentName(att: {
  title?: string | null;
  name?: string | null;
  url: string;
}) {
  // title は特殊文字ファイル名のときに Discord が保持する表示名
  const fromTitle = decodeAttachmentName(att.title ?? "");
  if (fromTitle) return fromTitle;

  // 次点で discord.js の name
  const fromName = decodeAttachmentName(att.name ?? "");
  if (fromName) return fromName;

  // name が空のときだけ URL から拾う
  const fromUrl = getAttachmentNameFromUrl(att.url);
  return fromUrl || "upload";
}

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getAttachmentNameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null;

  const extendedMatch = contentDisposition.match(/filename\*\s*=\s*([^;]+)/iu);
  if (extendedMatch?.[1]) {
    const token = stripOptionalQuotes(extendedMatch[1]);
    const parts = token.split("''", 2);
    const encoded = parts.length === 2 ? parts[1] : token;
    try {
      return decodeAttachmentName(decodeURIComponent(encoded));
    } catch {
      return decodeAttachmentName(encoded);
    }
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/iu);
  if (plainMatch?.[1]) {
    return decodeAttachmentName(stripOptionalQuotes(plainMatch[1]));
  }

  return null;
}

function ensureFileExtension(filename: string, ext: string): string {
  if (!ext) return filename;
  return filename.toLowerCase().endsWith(ext) ? filename : `${filename}${ext}`;
}

function toDisplayTrackTitleFromFilename(filename: string): string {
  const parsed = path.parse(filename);
  const fromStem = parsed.name.trim();
  if (fromStem) return fromStem;

  const fromRaw = filename.trim();
  return fromRaw || "upload";
}

function isLikelyOpaqueTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "unknown" || normalized === "unknown title") return true;

  const withoutExt = normalized.replace(/\.[a-z0-9]{2,5}$/iu, "");
  if (/^[0-9a-f]{16,}$/iu.test(withoutExt)) return true;
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(withoutExt)) {
    return true;
  }

  return false;
}

function shouldPreferMetadataTitle(filenameTitle: string): boolean {
  const normalized = filenameTitle.trim().toLowerCase();
  if (normalized === "upload" || normalized === "file") return true;
  return isLikelyOpaqueTitle(filenameTitle);
}

function normalizeYouTubeShortsUrl(input: string) {
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const isYouTube =
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com";
    if (!isYouTube) return input;

    const match = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (!match) return input;

    const id = match[1];
    const out = new URL("https://www.youtube.com/watch");
    out.searchParams.set("v", id);
    const t = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (t) out.searchParams.set("t", t);
    return out.toString();
  } catch {
    return input;
  }
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

  const lavalink = getLavalink(message);
  if (!lavalink) return;
  hookManagerAutoStopOnce(lavalink);

  const guildId = message.guildId;
  if (!guildId) return;

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
    if (!getMusicEnabled(guildId)) {
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
      await handleUpload(message, rest.join(" ").trim());
    } else if (command === "ng" || command === "ngword") {
      await handleNgWordCommand(message, rest);
    } else if (command === "help") {
      await message.reply(
        "🎵 音楽コマンド一覧:\n" +
          "`s!play <URL or キーワード>` - 曲を再生・キューに追加\n" +
          "`s!skip` - 曲をスキップ\n" +
          "`s!stop` - 再生を停止し、VCから退出\n" +
          "`s!queue` - 再生中・キュー中の曲一覧を表示\n" +
          "`s!upload [表示名]` - 音楽ファイルをアップロードして再生（対応形式: mp3, wav, flac, m4a, aac, ogg）\n" +
          "`s!ng <サブコマンド>` - 音楽NGワード管理コマンド（管理者のみ）\n" +
          "（例: `s!ng add <ワード>` / `s!ng remove <ワード>` / `s!ng list` / `s!ng clear`）\n" +
          "`s!disable` (s!d) - 音楽機能を無効化（管理者のみ）\n" +
          "`s!enable` (s!e) - 音楽機能を有効化（管理者のみ）",
      );
    } else if (command === "remove" || command === "delete") {
      await handleRemoveCommand(message, rest);
    } else if (command === "disable" || command === "d") {
      await handleDisable(message);
    } else if (command === "enable" || command === "e") {
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
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) {
    throw new Error("Lavalink is not ready for this message");
  }

  let player = lavalink.players.get(guildId);

  if (!player) {
    player = lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId: message.channelId,
      selfDeaf: true,
      selfMute: false,
      volume: FIXED_VOLUME,
    });

    await player.connect();
  } else if (player.voiceChannelId !== voiceChannelId) {
    await player.changeVoiceState({ voiceChannelId });
    if (!player.connected) await player.connect();
  }

  return player;
}

/* ---------- s!play ---------- */
async function handlePlay(
  message: Message,
  query: string,
  options?: {
    titleFallback?: string;
    forceTitle?: boolean;
    selectedTrack?: PendingTrack;
  },
): Promise<void> {
  const member = message.member as GuildMember | null;
  const voice = member?.voice?.channel;
  const guildId = message.guildId;
  if (!voice) {
    await message.reply("⚠️ 先にボイスチャンネルに参加してください。");
    return;
  }
  if (!guildId) return;

  const player = await getOrCreatePlayer(message, voice.id);

  // ============================
  // ✅ 音量は常に 20 に固定する
  // （ユーザー別/DBの音量は使わない）
  // ============================
  try {
    await player.setVolume(FIXED_VOLUME);
  } catch (e) {
    console.warn("[music] setVolume error (play)", e);
  }

  let track: PendingTrack | undefined = options?.selectedTrack;

  const isHttpUrl = /^https?:\/\//i.test(query);
  const normalizedQuery = isHttpUrl ? normalizeYouTubeShortsUrl(query) : query;
  if (!track) {
    let result: SearchResult | UnresolvedSearchResult | null = null;
    // ★URLかキーワードかで searchQuery を確定させる
    const searchQuery = isHttpUrl
      ? normalizedQuery
      : `ytsearch:${normalizedQuery}`;

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
      const lines = selectionTracks.map((candidate, index) => {
        const title = getTrackTitle(candidate);
        const author = candidate.info.author ? ` - ${candidate.info.author}` : "";
        const duration = formatTrackDuration(getTrackDurationMs(candidate));
        const durationText = duration ? ` (${duration})` : "";
        return `${index + 1}. ${title}${author}${durationText}`;
      });
      await message.reply(
        `🔎 いくつか候補が見つかったよ。この中から選んでね。ない場合はURLで再生してみて。\n` +
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

  const lengthMs = getTrackDurationMs(track);
  const isStream = isStreamTrack(track);
  const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
  const shouldBlockStream = isStream && !hasDuration;

  const titleFallback = options?.titleFallback?.trim();
  const trackTitle = track.info?.title?.trim();
  const isUnknownTitle =
    !trackTitle || trackTitle.toLowerCase() === "unknown title";
  if (titleFallback && (options?.forceTitle || isUnknownTitle)) {
    track.info.title = titleFallback;
  }

  // ライブ/ストリームっぽいものは弾く（必要なら許可に変えられる）
  if (shouldBlockStream) {
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

  const ngWords = getMusicNgWords(guildId);
  const ngMatch = findNgWordMatch(
    [track.info?.title, track.info?.author],
    ngWords,
  );
  if (ngMatch) {
    await message.reply("🚫 NGワードが含まれているため再生できません。");
    return;
  }

  await player.queue.add(track);
  const displayTitle = getTrackTitle(track);

  if (!player.playing && !player.paused) {
    await player.play();
    if (!hasDuration) {
      await message.reply(
        `▶ 再生開始: **${displayTitle}**（音量: ${FIXED_VOLUME}）\n` +
          `⚠️ 曲の長さを取得できないため、最大 ${MAX_TRACK_MINUTES} 分で自動停止します。`,
      );
    } else {
      await message.reply(
        `▶ 再生開始: **${displayTitle}**（音量: ${FIXED_VOLUME}）`,
      );
    }
  } else {
    const pos = player.queue.tracks.length;
    await message.reply(
      `⏱ キューに追加しました: **${displayTitle}**（位置: ${pos}）`,
    );
  }
}

/* ---------- s!skip ---------- */
async function handleSkip(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  const hasPlayableTrack =
    player &&
    (Boolean(player.queue.current) || (player.queue?.tracks?.length ?? 0) > 0);

  if (!hasPlayableTrack) {
    await message.reply("⏹ スキップできる曲がありません。");
    return;
  }

  clearAutoStop(guildId);
  // lavalink-client は「次キュー0件 + throwError=true」で RangeError を投げるため、
  // 最後の1曲だけ再生中でも安全にスキップできるよう throwError=false で呼ぶ。
  await player.skip(0, false);
  await message.reply("⏭ 曲をスキップしました。");
}

/* ---------- s!stop ---------- */
async function handleStop(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

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
async function handleQueue(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply("📭 再生中・キュー中の曲はありません。");
    return;
  }

  const current = player.queue.current;
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
      ...tracks.map(
        (track, index) => `${index + 1}. **${getTrackTitle(track)}**`,
      ),
    );
  }

  await message.reply(lines.join("\n"));
}

/* ---------- s!ng ---------- */
async function handleNgWordCommand(message: Message, args: string[]) {
  const guildId = message.guildId;
  if (!guildId) {
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
    const list = getMusicNgWords(guildId);
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
    const result = addMusicNgWord(guildId, word);
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
    const result = removeMusicNgWord(guildId, word);
    await message.reply(
      result.removed
        ? `✅ NGワードを削除しました: **${word}**`
        : `⚠️ NGワードにありません: **${word}**`,
    );
    return;
  }

  if (sub === "clear") {
    clearMusicNgWords(guildId);
    await message.reply("✅ NGワードをすべて削除しました。");
    return;
  }

  await message.reply(
    "⚠️ コマンドが不明です。`s!ng help` で使い方を確認できます。",
  );
}

/* ---------- s!upload ---------- */
async function handleUpload(message: Message, customTitleRaw?: string) {
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

  const attachmentName = pickAttachmentName(att);
  let ext = path.extname(attachmentName).toLowerCase();
  if (!ext && att.contentType) {
    ext = contentTypeToExt[att.contentType] ?? "";
  }
  if (!ext || !allowedExts.includes(ext)) {
    await message.reply(`⚠️ 対応形式は **${allowedExtsLabel}** です。`);
    return;
  }
  const initialDisplayName = ensureFileExtension(attachmentName, ext);

  const ngWords = getMusicNgWords(message.guildId);
  const customTitle = customTitleRaw?.trim() ?? "";
  if (customTitle) {
    const customTitleNg = findNgWordMatch([customTitle], ngWords);
    if (customTitleNg) {
      await message.reply(
        "🚫 指定した表示名はNGワードが含まれているため使用できません。",
      );
      return;
    }
  }

  const ngMatch = findNgWordMatch([initialDisplayName], ngWords);
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

    let displayName = initialDisplayName;
    const headerName = getAttachmentNameFromContentDisposition(
      res.headers.get("content-disposition"),
    );
    if (headerName) {
      const headerDisplayName = ensureFileExtension(headerName, ext);
      const currentTitle = toDisplayTrackTitleFromFilename(displayName);
      const headerTitle = toDisplayTrackTitleFromFilename(headerDisplayName);
      if (!isLikelyOpaqueTitle(headerTitle) || isLikelyOpaqueTitle(currentTitle)) {
        displayName = headerDisplayName;
      }
    }

    if (displayName !== initialDisplayName) {
      const ngMatchFromHeader = findNgWordMatch([displayName], ngWords);
      if (ngMatchFromHeader) {
        await message.reply(
          "🚫 このファイル名はNGワードが含まれているためアップロードできません。",
        );
        return;
      }
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const filenameTitle = toDisplayTrackTitleFromFilename(displayName);
    let playbackTitle = customTitle || filenameTitle;
    let metadataTitle: string | null = null;

    try {
      const meta = await mm.parseBuffer(buf, att.contentType ?? undefined);
      const title = meta.common.title?.trim();
      if (title) metadataTitle = title;
      if (!metadataTitle) {
        const id3Title = getId3TitleFromBuffer(buf)?.trim();
        if (id3Title) metadataTitle = id3Title;
      }
    } catch {
      const id3Title = getId3TitleFromBuffer(buf)?.trim();
      if (id3Title) metadataTitle = id3Title;
    }

    if (
      metadataTitle &&
      !customTitle &&
      shouldPreferMetadataTitle(filenameTitle) &&
      !isLikelyOpaqueTitle(metadataTitle)
    ) {
      playbackTitle = metadataTitle;
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
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

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
  if (!removed) {
    await message.reply("⚠️ 指定した曲を削除できませんでした。");
    return;
  }
  await message.reply(`🗑 キューから削除しました: **${getTrackTitle(removed)}**`);
}

/* ---------- s!disable (s!d) ---------- */
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

/* ---------- s!enable (s!e) ---------- */
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
