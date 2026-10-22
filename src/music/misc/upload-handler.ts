import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Message } from "discord.js";
import { PREFIX } from "./constants";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_EXTENSIONS_LABEL,
  CONTENT_TYPE_TO_EXTENSION,
  UPLOAD_DIR,
} from "./constants";
import {
  getMusicNgWords,
} from "../../data";
import { findNgWordMatch } from "./trackUtils";
import {
  ensureFileExtension,
  getSupportedAttachmentExtension,
  getAttachmentNameFromContentDisposition,
  getId3TitleFromFile,
  isLikelyOpaqueTitle,
  pickAttachmentName,
  shouldPreferMetadataTitle,
  toDisplayTrackTitleFromFilename,
} from "./uploadUtils";
import { makeInternalUrl } from "../../utils/makeInternalUrl";
import { makePublicUrl } from "../../utils/makePublicUrl";
import { handlePlay, TrackNotFoundError } from "../playback/play";
import { getRuntimeConfig } from "../../config/runtime";
import { removeTemporaryFile } from "./fileCleanup";

export class UploadTooLargeError extends Error {
  override name = "UploadTooLargeError";
}

function getContentLength(response: globalThis.Response): number | null {
  const rawValue = response.headers.get("content-length");
  if (!rawValue) return null;
  const value = Number.parseInt(rawValue, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// Lazy load music-metadata
let musicMetadataModulePromise: Promise<typeof import("music-metadata")> | null = null;

function loadMusicMetadataModule(): Promise<typeof import("music-metadata")> {
  if (!musicMetadataModulePromise) {
    musicMetadataModulePromise = import("music-metadata");
  }
  return musicMetadataModulePromise;
}

// ---------------------------------------------------------------------------
// saveResponseBodyToFile
// ---------------------------------------------------------------------------

export async function saveResponseBodyToFile(
  response: globalThis.Response,
  savePath: string,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error("download failed: empty response body");
  }

  const reader = body.getReader();
  const fileHandle = await fs.promises.open(savePath, "w");
  let writtenBytes = 0;
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value || chunk.value.length === 0) continue;
      writtenBytes += chunk.value.length;
      if (writtenBytes > maxBytes) {
        try {
          await reader.cancel("upload size limit exceeded");
        } catch (error) {
          console.warn("[music] failed to cancel oversized upload", error);
        }
        throw new UploadTooLargeError("upload size limit exceeded");
      }
      await fileHandle.write(chunk.value);
    }
    completed = true;
  } finally {
    try {
      await fileHandle.close();
    } catch (error) {
      if (completed) throw error;
      console.warn(`[music] failed to close upload: ${savePath}`, error);
    }
  }
}

// ---------------------------------------------------------------------------
// handleUpload
// ---------------------------------------------------------------------------

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

  const uploadConfig = getRuntimeConfig().music;
  if (attachment.size > uploadConfig.uploadMaxBytes) {
    await message.reply(
      `⚠️ アップロードできるファイルは最大 ${uploadConfig.uploadMaxMb} MBです。`,
    );
    return;
  }

  const attachmentName = pickAttachmentName(attachment);
  const ext = getSupportedAttachmentExtension(
    attachmentName,
    attachment.contentType,
    ALLOWED_EXTENSIONS,
    CONTENT_TYPE_TO_EXTENSION,
  );
  if (!ext) {
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
  let playbackAttempted = false;

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = getContentLength(response);
    if (
      contentLength !== null &&
      contentLength > uploadConfig.uploadMaxBytes
    ) {
      throw new UploadTooLargeError("upload size limit exceeded");
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

    await saveResponseBodyToFile(
      response,
      savePath,
      uploadConfig.uploadMaxBytes,
    );

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
    } catch (error) {
      // Metadata is optional; retain the ID3/filename fallback and its failure reason.
      console.warn("[music] upload metadata parsing failed; trying ID3/filename", error);
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

    playbackAttempted = true;
    try {
      await handlePlay(message, internalUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
        throwOnNotFound: true,
      });
    } catch (internalError) {
      if (!(internalError instanceof TrackNotFoundError)) throw internalError;
      console.warn("[music] upload internal URL lookup failed; trying public URL", internalError);
      await handlePlay(message, publicUrl, {
        titleFallback: playbackTitle,
        forceTitle: true,
        throwOnNotFound: true,
      });
    }
  } catch (error) {
    console.error("[music] upload error", error);
    // Once playback was attempted, a queue or reply failure may follow a successful
    // enqueue. Preserve the file unless lookup explicitly confirmed no track.
    if (!playbackAttempted || error instanceof TrackNotFoundError) {
      await removeTemporaryFile(savePath);
    }
    const failureMessage = error instanceof UploadTooLargeError
      ? `⚠️ アップロードできるファイルは最大 ${uploadConfig.uploadMaxMb} MBです。`
      : playbackAttempted
        ? "⚠️ アップロード後の再生処理でエラーが発生しました。"
        : "❌ アップロード処理に失敗しました。";
    try {
      await message.reply(failureMessage);
    } catch (replyError) {
      console.warn("[music] upload error reply failed, fallback to send", replyError);
      if ("send" in message.channel) {
        await message.channel.send(failureMessage);
      }
    }
  }
}
