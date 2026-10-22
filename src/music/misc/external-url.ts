import { Message } from "discord.js";
import { getMusicNgWords } from "../../data";
import { findNgWordMatch } from "./trackUtils";
import { getGuildMusicPlaybackLimit } from "./limits";
import {
  downloadExternalTrack,
  shouldAttemptYtDlpFallback,
  YtDlpUserError,
} from "../ytDlp/ytDlpUtils";
import { buildExternalTrackBlockedMessage } from "./trackValidation";
import { HandlePlayOptions } from "../playback/play";
import { removeTemporaryFile } from "./fileCleanup";

// ---------------------------------------------------------------------------
// handleExternalUrlFallback
// ---------------------------------------------------------------------------

export async function handleExternalUrlFallback(
  message: Message,
  query: string,
): Promise<boolean> {
  if (!shouldAttemptYtDlpFallback(query)) {
    return false;
  }
  const guildId = message.guildId;
  if (!guildId) {
    return false;
  }

  let downloadedTrack;
  try {
    downloadedTrack = await downloadExternalTrack(query);
  } catch (error) {
    if (error instanceof YtDlpUserError) {
      await message.reply(`⚠️ ${error.message}`);
      return true;
    }

    console.warn("[music] yt-dlp fallback error", error);
    await message.reply(
      "⚠️ そのURLは外部サイト取り込みでも再生できませんでした。非公開・地域制限・要ログインの可能性があります。",
    );
    return true;
  }

  const blockedMessage = buildExternalTrackBlockedMessage(
    downloadedTrack.title,
    downloadedTrack.durationMs,
    downloadedTrack.isLive,
    getGuildMusicPlaybackLimit(guildId),
  );
  if (blockedMessage) {
    await removeTemporaryFile(downloadedTrack.filePath);
    await message.reply(blockedMessage);
    return true;
  }

  const ngWords = getMusicNgWords(guildId);
  const ngMatch = findNgWordMatch(
    [downloadedTrack.title, downloadedTrack.uploader ?? undefined],
    ngWords,
  );
  if (ngMatch) {
    await removeTemporaryFile(downloadedTrack.filePath);
    await message.reply("🚫 NGワードが含まれているため再生できません。");
    return true;
  }

  const sourceLabel = downloadedTrack.extractor
    ? ` (${downloadedTrack.extractor})`
    : "";

  await message.reply(
    `✅ 外部URLを取り込みました: **${downloadedTrack.title}**${sourceLabel}\n` +
      `🌐 元URL: ${downloadedTrack.sourceUrl}\n` +
      `▶ 再生します…`,
  );

  const playOptions: HandlePlayOptions = {
    titleFallback: downloadedTrack.title,
    forceTitle: true,
    throwOnNotFound: true,
    durationOverrideMs: downloadedTrack.durationMs,
    markAsYtDlpRecoveredFromUrl: downloadedTrack.sourceUrl,
    displayOverrides: {
      title: downloadedTrack.title,
      author: downloadedTrack.uploader ?? undefined,
      uri: downloadedTrack.sourceUrl,
      artworkUrl: downloadedTrack.artworkUrl,
    },
  };

  const { handlePlay, TrackNotFoundError } = await import("../playback/play");
  try {
    await handlePlay(message, downloadedTrack.internalUrl, playOptions);
  } catch (internalError) {
    // Retry only a failed lookup; queue/play/reply errors can occur after enqueueing.
    if (!(internalError instanceof TrackNotFoundError)) throw internalError;
    console.warn("[music] internal URL lookup failed; trying public URL", internalError);
    try {
      await handlePlay(message, downloadedTrack.publicUrl, playOptions);
    } catch (publicError) {
      if (!(publicError instanceof TrackNotFoundError)) throw publicError;
      console.warn("[music] public URL lookup failed", publicError);
      await removeTemporaryFile(downloadedTrack.filePath);
      await message.reply(
        "⚠️ 外部URLの取り込みには成功しましたが、Lavalink から再生できませんでした。",
      );
    }
  }

  return true;
}
