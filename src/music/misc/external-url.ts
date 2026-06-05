import fs from "node:fs";
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
    await fs.promises.unlink(downloadedTrack.filePath).catch(() => undefined);
    await message.reply(blockedMessage);
    return true;
  }

  const ngWords = getMusicNgWords(guildId);
  const ngMatch = findNgWordMatch(
    [downloadedTrack.title, downloadedTrack.uploader ?? undefined],
    ngWords,
  );
  if (ngMatch) {
    await fs.promises.unlink(downloadedTrack.filePath).catch(() => undefined);
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

  try {
    await import("../playback/play").then(({ handlePlay }) =>
      handlePlay(message, downloadedTrack.internalUrl, playOptions),
    );
  } catch {
    try {
      await import("../playback/play").then(({ handlePlay }) =>
        handlePlay(message, downloadedTrack.publicUrl, playOptions),
      );
    } catch {
      await fs.promises.unlink(downloadedTrack.filePath).catch(() => undefined);
      await message.reply(
        "⚠️ 外部URLの取り込みには成功しましたが、Lavalink から再生できませんでした。",
      );
    }
  }

  return true;
}
