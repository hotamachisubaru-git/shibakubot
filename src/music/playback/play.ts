import { EmbedBuilder, GuildMember, Message, PermissionFlagsBits } from "discord.js";
import { Player } from "lavalink-client";
import {
  getMusicNgWords,
  getMusicRepeat,
  setMusicRepeat,
} from "../../data";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { PREFIX } from "../misc/constants";
import {
  applyTrackDisplayOverrides,
  applyTrackDurationOverride,
  formatTrackDuration,
  getLavalink,
  getTrackDurationMs,
  getTrackTitle,
  markTrackAsRecoveredByYtDlp,
  normalizeYouTubeShortsUrl,
  type PendingTrack,
  type TrackDisplayOverrides,
} from "../misc/trackUtils";
import {
  applyMusicRepeatForPlayer,
  clearAutoStop,
  clearPendingSearch,
  registerRetrySelection,
  setPendingSearch,
} from "../state/state";
import { handleSpotifyPlay, searchKeywordCandidates, searchTracks } from "../search/search";
import { getGuildMusicPlaybackLimit } from "../misc/limits";
import {
  shouldPreferYtDlpDirect,
  shouldAttemptYtDlpFallback,
  YtDlpUserError,
} from "../ytDlp/ytDlpUtils";
import { enforceFixedVolume, getOrCreatePlayer, waitForVoiceConnection } from "./player-connection";
import { FIXED_VOLUME, MAX_SELECTION_RESULTS } from "../misc/constants";
import { buildExternalTrackBlockedMessage, validateTrackForQueue } from "../misc/trackValidation";
import { handleExternalUrlFallback } from "../misc/external-url";

export type HandlePlayOptions = {
  titleFallback?: string;
  forceTitle?: boolean;
  selectedTrack?: PendingTrack;
  selectionContext?: {
    tracks: PendingTrack[];
    query: string;
    selectedIndex: number;
  };
  throwOnNotFound?: boolean;
  displayOverrides?: TrackDisplayOverrides;
  durationOverrideMs?: number | null;
  markAsYtDlpRecoveredFromUrl?: string;
};

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

  await enforceFixedVolume(player, "play");
  await applyMusicRepeatForPlayer(player);

  let track: PendingTrack | undefined = options?.selectedTrack;
  const isHttpUrl = /^https?:\/\//i.test(query);
  const normalizedQuery = isHttpUrl ? normalizeYouTubeShortsUrl(query) : query;

  if (!track && (await handleSpotifyPlay(message, player, normalizedQuery))) {
    return;
  }

  if (!track && isHttpUrl && shouldPreferYtDlpDirect(normalizedQuery)) {
    if (await handleExternalUrlFallback(message, normalizedQuery)) {
      return;
    }
  }

  if (!track) {
    if (!isHttpUrl) {
      const selectionTracks = await searchKeywordCandidates(
        player,
        normalizedQuery,
        message.author,
        MAX_SELECTION_RESULTS,
      );

      if (!selectionTracks.length) {
        await message.reply("🔍 曲が見つかりませんでした…。");
        return;
      }

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

    if (!isAudiostockPreviewUrl(normalizedQuery)) {
      const searchResult = await searchTracks(
        player,
        normalizedQuery,
        message.author,
      );

      if (!searchResult?.tracks?.length) {
        if (await handleExternalUrlFallback(message, normalizedQuery)) {
          return;
        }
        if (options?.throwOnNotFound) {
          throw new Error("TRACK_NOT_FOUND");
        }
        await message.reply("🔍 曲が見つかりませんでした…。");
        return;
      }

      track = searchResult.tracks[0];
    }
  }

  clearPendingSearch(message);
  if (!track && isAudiostockPreviewUrl(normalizedQuery)) {
    track = buildAudiostockPreviewTrack(normalizedQuery);
  }
  if (!track) {
    await message.reply("🔍 曲が見つかりませんでした…。");
    return;
  }

  applyTitleOverrides(track, options);

  const ngWords = getMusicNgWords(guildId);
  const playbackLimit = getGuildMusicPlaybackLimit(guildId);
  const validation = validateTrackForQueue(track, ngWords, playbackLimit);
  if (validation.errorMessage) {
    await message.reply(validation.errorMessage);
    return;
  }
  const hasDuration = validation.hasDuration;

  if (options?.selectionContext) {
    registerRetrySelection(
      message,
      options.selectionContext.tracks,
      options.selectionContext.query,
      options.selectionContext.selectedIndex,
    );
  }

  await player.queue.add(track);
  const displayTitle = getTrackTitle(track);

  if (!player.playing && !player.paused) {
    await player.play();
    if (!hasDuration) {
      await message.reply(
        `▶ 再生開始: **${displayTitle}**（音量: ${FIXED_VOLUME}）\n` +
          `⚠️ 曲の長さを取得できないため、最大 ${playbackLimit.maxTrackMinutes} 分で自動停止します。`,
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

const AUDIOSTOCK_PREVIEW_RE =
  /^https:\/\/cf-audiostock-public-files\.audiostock\.jp\/audio-sample-128kbps\/\d+/i;

function isAudiostockPreviewUrl(url: string): boolean {
  return AUDIOSTOCK_PREVIEW_RE.test(url);
}

function buildAudiostockPreviewTrack(query: string): PendingTrack {
  return {
    encoded: `audiostock_direct_${query}`,
    info: {
      identifier: query,
      title: "Audiostock Preview",
      author: "Audiostock",
      duration: 0,
      uri: query,
      sourceName: "http",
      isSeekable: true,
      isStream: false,
    },
    pluginInfo: {
      sourceName: "http",
      uri: query,
      url: query,
    },
    userData: {},
  } as unknown as PendingTrack;
}

function applyTitleOverrides(
  track: PendingTrack,
  options: HandlePlayOptions | undefined,
): void {
  const titleFallback = options?.titleFallback?.trim();
  const trackTitle = track.info?.title?.trim();
  const isUnknownTitle =
    !trackTitle || trackTitle.toLowerCase() === "unknown title";
  if (titleFallback && (options?.forceTitle || isUnknownTitle)) {
    track.info.title = titleFallback;
  }
  if (options?.displayOverrides) {
    applyTrackDisplayOverrides(track, options.displayOverrides);
  }
  if (options?.durationOverrideMs !== undefined) {
    applyTrackDurationOverride(track, options.durationOverrideMs);
  }
  if (options?.markAsYtDlpRecoveredFromUrl) {
    markTrackAsRecoveredByYtDlp(track, options.markAsYtDlpRecoveredFromUrl);
  }
}
