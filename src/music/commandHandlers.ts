import {
  EmbedBuilder,
  GuildMember,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  Player,
  type SearchResult,
  type UnresolvedSearchResult,
} from "lavalink-client";
import {
  addMusicNgWord,
  clearMusicNgWords,
  getMusicNgWords,
  removeMusicNgWord,
  setMusicEnabled,
} from "../data";
import { MUSIC_TEXT_COMMAND } from "../constants/commands";
import { makeInternalUrl } from "../utils/makeInternalUrl";
import { makePublicUrl } from "../utils/makePublicUrl";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_EXTENSIONS_LABEL,
  CONTENT_TYPE_TO_EXTENSION,
  FIXED_VOLUME,
  MAX_SELECTION_RESULTS,
  MAX_TRACK_MINUTES,
  MAX_TRACK_MS,
  OWNER_IDS,
  PREFIX,
  UPLOAD_DIR,
} from "./constants";
import {
  findNgWordMatch,
  formatTrackDuration,
  getLavalink,
  getTrackDurationMs,
  getTrackTitle,
  isStreamTrack,
  normalizeYouTubeShortsUrl,
  type PendingTrack,
} from "./trackUtils";
import { clearAutoStop, clearPendingSearch, setPendingSearch } from "./state";
import {
  ensureFileExtension,
  getAttachmentNameFromContentDisposition,
  getId3TitleFromFile,
  isLikelyOpaqueTitle,
  pickAttachmentName,
  shouldPreferMetadataTitle,
  toDisplayTrackTitleFromFilename,
} from "./uploadUtils";
import { hasAdminGuildOwnerOrDevPermission } from "../utils/permissions";

export type HandlePlayOptions = {
  titleFallback?: string;
  forceTitle?: boolean;
  selectedTrack?: PendingTrack;
  throwOnNotFound?: boolean;
};

const NOW_PLAYING_BAR_SEGMENTS = 16;
const NOW_PLAYING_COLOR = 0x57f287;
type MusicMetadataModule = typeof import("music-metadata");

let musicMetadataModulePromise: Promise<MusicMetadataModule> | null = null;

function loadMusicMetadataModule(): Promise<MusicMetadataModule> {
  if (!musicMetadataModulePromise) {
    musicMetadataModulePromise = import("music-metadata");
  }
  return musicMetadataModulePromise;
}

async function saveResponseBodyToFile(
  response: globalThis.Response,
  savePath: string,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error("download failed: empty response body");
  }

  const reader = body.getReader();
  const fileHandle = await fs.promises.open(savePath, "w");
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value || chunk.value.length === 0) continue;
      await fileHandle.write(chunk.value);
    }
  } finally {
    await fileHandle.close();
  }
}

function canManageMusic(message: Message): boolean {
  return hasAdminGuildOwnerOrDevPermission(
    {
      memberPermissions: message.member?.permissions ?? null,
      user: message.author,
      guild: message.guild,
    },
    OWNER_IDS,
  );
}

async function getOrCreatePlayer(
  message: Message,
  voiceChannelId: string,
): Promise<Player> {
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
  } else {
    if (player.voiceChannelId !== voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId });
    }
    if (!player.connected) {
      await player.connect();
    }
  }

  return player;
}

async function waitForVoiceConnection(
  player: Player,
  timeoutMs = 15_000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (player.connected) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return Boolean(player.connected);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatNowPlayingTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function buildNowPlayingBar(
  positionMs: number,
  durationMs: number,
  paused: boolean,
): string {
  const stateIcon = paused ? "⏸" : "▶";
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return `${stateIcon} ${"▱".repeat(NOW_PLAYING_BAR_SEGMENTS)}`;
  }

  const ratio = clamp(positionMs / durationMs, 0, 1);
  const markerIndex = Math.floor(ratio * (NOW_PLAYING_BAR_SEGMENTS - 1));
  const bar = Array.from({ length: NOW_PLAYING_BAR_SEGMENTS }, (_, index) => {
    if (index === markerIndex) return "🔘";
    return index < markerIndex ? "▰" : "▱";
  }).join("");

  return `${stateIcon} ${bar}`;
}

function pickNowPlayingArtwork(track: PendingTrack): string | null {
  return track.info.artworkUrl ?? track.pluginInfo.artworkUrl ?? null;
}

function getNowPlayingSourceLabel(track: PendingTrack): string {
  const author = track.info.author?.trim();
  if (author) return author;
  const sourceName = track.info.sourceName?.trim();
  return sourceName || "不明";
}

export async function handleNowPlaying(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  const current = player?.queue.current;
  if (!player || !current) {
    await message.reply("📭 再生中の曲はありません。");
    return;
  }

  const durationMs = getTrackDurationMs(current);
  const hasDuration = Number.isFinite(durationMs) && durationMs > 0;
  const currentPositionMs = hasDuration
    ? clamp(player.position, 0, durationMs)
    : Math.max(player.position, 0);
  const title = getTrackTitle(current);
  const sourceLabel = getNowPlayingSourceLabel(current);
  const artworkUrl = pickNowPlayingArtwork(current);
  const trackUrlRaw = current.info.uri?.trim();
  const trackUrl = trackUrlRaw && isHttpUrl(trackUrlRaw) ? trackUrlRaw : null;
  const userDisplayName = message.member?.displayName ?? message.author.username;

  const progressLine = buildNowPlayingBar(
    currentPositionMs,
    hasDuration ? durationMs : 0,
    player.paused,
  );
  const durationLabel = hasDuration ? formatNowPlayingTime(durationMs) : "LIVE";
  const timeLine = `\`[${formatNowPlayingTime(currentPositionMs)}/${durationLabel}]\``;

  const embed = new EmbedBuilder()
    .setColor(NOW_PLAYING_COLOR)
    .setAuthor({
      name: userDisplayName,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTitle(truncateText(title, 256))
    .setDescription(`${progressLine}\n${timeLine}\n出典: ${sourceLabel}`);

  if (trackUrl) {
    embed.setURL(trackUrl);
  }
  if (artworkUrl) {
    embed.setThumbnail(artworkUrl);
  }
  if (player.paused) {
    embed.setFooter({ text: "一時停止中" });
  }

  await message.reply({ embeds: [embed] });
}

export async function handlePlay(
  message: Message,
  query: string,
  options?: HandlePlayOptions,
): Promise<void> {
  const lavalink = getLavalink(message);
  if (!lavalink?.useable) {
    await message.reply(
      "⚠️ Lavalinkに接続できていません。数秒待ってから再試行してください。",
    );
    return;
  }

  const member = message.member as GuildMember | null;
  const voice = member?.voice?.channel;
  const guildId = message.guildId;
  if (!voice) {
    await message.reply("⚠️ 先にボイスチャンネルに参加してください。");
    return;
  }
  if (!guildId) return;
  const botMember = message.guild?.members.me;
  if (!botMember) {
    await message.reply("⚠️ Botのメンバー情報を取得できません。");
    return;
  }

  const botPerms = voice.permissionsFor(botMember);
  if (!botPerms?.has(PermissionFlagsBits.Connect)) {
    await message.reply("⚠️ このVCに接続する権限（Connect）がありません。");
    return;
  }
  if (!botPerms.has(PermissionFlagsBits.Speak)) {
    await message.reply("⚠️ このVCで発言する権限（Speak）がありません。");
    return;
  }

  const player = await getOrCreatePlayer(message, voice.id);
  let connected = await waitForVoiceConnection(player);
  if (!connected) {
    try {
      await player.connect();
    } catch (error) {
      console.warn("[music] reconnect error (play)", error);
    }
    connected = await waitForVoiceConnection(player, 5_000);
  }
  if (!connected) {
    await message.reply(
      "⚠️ VC接続に失敗しました。BotのVC権限（Connect/Speak）と、サーバー側ネットワーク/ファイアウォール設定を確認してください。",
    );
    return;
  }

  try {
    await player.setVolume(FIXED_VOLUME);
  } catch (error) {
    console.warn("[music] setVolume error (play)", error);
  }

  let track: PendingTrack | undefined = options?.selectedTrack;

  const isHttpUrl = /^https?:\/\//i.test(query);
  const normalizedQuery = isHttpUrl ? normalizeYouTubeShortsUrl(query) : query;
  if (!track) {
    let result: SearchResult | UnresolvedSearchResult | null = null;
    const searchQuery = isHttpUrl
      ? normalizedQuery
      : `ytsearch:${normalizedQuery}`;

    try {
      result = await player.search({ query: searchQuery }, message.author);
    } catch (error) {
      console.warn("[music] search error", error);
    }

    if (!result?.tracks?.length) {
      if (options?.throwOnNotFound) {
        throw new Error("TRACK_NOT_FOUND");
      }
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
        `🔎 いくつか候補が見つかったよ。この中から選んでくれると嬉しいなって。この中にない場合はURLで再生してみてね。\n` +
          `${lines.join("\n")}\n` +
          `\n\`${PREFIX}${MUSIC_TEXT_COMMAND.play} 1\`〜\`${PREFIX}${MUSIC_TEXT_COMMAND.play} ${lines.length}\``,
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

  if (shouldBlockStream) {
    await message.reply(
      `🚫 ライブ配信/長さ不明の曲は再生できません。（最大 ${MAX_TRACK_MINUTES} 分まで）`,
    );
    return;
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

export async function handleSkip(message: Message): Promise<void> {
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
  await player.skip(0, false);
  await message.reply("⏭ 曲をスキップしました。");
}

export async function handleStop(message: Message): Promise<void> {
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

export async function handleQueue(message: Message): Promise<void> {
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

export async function handleNgWordCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const sub = args[0]?.toLowerCase();
  const canManage = canManageMusic(message);

  if (!sub || sub === "help") {
    await message.reply(
      `使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} add <word>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} remove <word>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} list\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} clear\``,
    );
    return;
  }

  if (sub === "list") {
    const list = getMusicNgWords(guildId);
    if (!list.length) {
      await message.reply("📭 NGワードは登録されていません。");
      return;
    }
    const lines = list.map((word, index) => `${index + 1}. ${word}`).join("\n");
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
    `⚠️ コマンドが不明です。\`${PREFIX}${MUSIC_TEXT_COMMAND.ng} help\` で使い方を確認できます。`,
  );
}

export async function handleUpload(
  message: Message,
  customTitleRaw?: string,
): Promise<void> {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply("📎 ファイルを添付してね。");
    return;
  }

  const attachmentName = pickAttachmentName(attachment);
  let ext = path.extname(attachmentName).toLowerCase();
  if (!ext && attachment.contentType) {
    ext = CONTENT_TYPE_TO_EXTENSION[attachment.contentType] ?? "";
  }
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    await message.reply(`⚠️ 対応形式は **${ALLOWED_EXTENSIONS_LABEL}** です。`);
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

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const filename = `${id}${ext}`;
  const savePath = path.join(UPLOAD_DIR, filename);

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`download failed: ${response.status} ${response.statusText}`);
    }

    let displayName = initialDisplayName;
    const headerName = getAttachmentNameFromContentDisposition(
      response.headers.get("content-disposition"),
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

    await saveResponseBodyToFile(response, savePath);

    const filenameTitle = toDisplayTrackTitleFromFilename(displayName);
    let playbackTitle = customTitle || filenameTitle;
    let metadataTitle: string | null = null;

    try {
      const musicMetadata = await loadMusicMetadataModule();
      const metadata = await musicMetadata.parseFile(savePath, {
        skipCovers: true,
      });
      const title = metadata.common.title?.trim();
      if (title) metadataTitle = title;
    } catch {
      // noop
    }

    if (!metadataTitle) {
      const id3Title = (await getId3TitleFromFile(savePath))?.trim();
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

    const publicUrl = makePublicUrl(filename);
    const internalUrl = makeInternalUrl(filename);

    await message.reply(
      `✅ アップロード完了: **${playbackTitle}**\n` +
        `🌐 公開URL: ${publicUrl}\n` +
        `▶ 再生します…`,
    );

    try {
      await handlePlay(message, internalUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
        throwOnNotFound: true,
      });
    } catch {
      await handlePlay(message, publicUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
      });
    }
  } catch (error) {
    console.error("[music] upload error", error);
    try {
      await fs.promises.unlink(savePath);
    } catch {
      // noop
    }
    try {
      await message.reply("❌ アップロード処理に失敗しました。");
    } catch (replyError) {
      console.warn("[music] upload error reply failed, fallback to send", replyError);
      if ("send" in message.channel) {
        await message.channel.send("❌ アップロード処理に失敗しました。");
      }
    }
  }
}

export async function handleRemoveCommand(
  message: Message,
  rest: string[],
): Promise<void> {
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
      `⚠️ 削除する曲の番号を指定してください。（例: \`${PREFIX}${MUSIC_TEXT_COMMAND.remove} 2\`）`,
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

export async function handleDisable(message: Message): Promise<void> {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  if (!canManageMusic(message)) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  setMusicEnabled(message.guildId, false);
  await message.reply("🔇 音楽機能を無効化しました。");
}

export async function handleEnable(message: Message): Promise<void> {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  if (!canManageMusic(message)) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  setMusicEnabled(message.guildId, true);
  await message.reply("🔊 音楽機能を有効化しました。");
}
