import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeConfig } from "../../config/runtime";
import { makeInternalUrl } from "../../utils/makeInternalUrl";
import { makePublicUrl } from "../../utils/makePublicUrl";
import { UPLOAD_DIR } from "../misc/constants";
import {
  getRecoveredTrackOriginalSourceUrl,
  isTrackRecoveredByYtDlp,
  type PendingTrack,
} from "../misc/trackUtils";
import { YtDlpUserError } from "./ytDlpBinary";
import { getBaseArgsInternal, runYtDlp } from "./ytDlpProcess";
import { extractMetadata, type DownloadedTrackMetadata, type YtDlpInfoEntry } from "./ytDlpMetadata";

export { YtDlpUserError } from "./ytDlpBinary";
export { runYtDlp, getBaseArgsInternal } from "./ytDlpProcess";
export { extractMetadata, type DownloadedTrackMetadata, type YtDlpInfoEntry } from "./ytDlpMetadata";

export type DownloadedExternalTrack = Readonly<
  DownloadedTrackMetadata & {
    filePath: string;
    filename: string;
    internalUrl: string;
    publicUrl: string;
  }
>;

export type YtDlpCleanupResult = Readonly<{
  scanned: number;
  deleted: number;
}>;

function isMaxFileSizeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /max[- ]filesize|larger than.*filesize|file is larger/i.test(error.message)
  );
}

export function shouldAttemptYtDlpFallback(inputUrl: string): boolean {
  if (!/^https?:\/\//i.test(inputUrl)) return false;
  const runtimeConfig = getRuntimeConfig();
  const publicBase = runtimeConfig.upload.publicBaseUrl.toString();
  const internalBase = runtimeConfig.upload.internalBaseUrl.toString();
  return !inputUrl.startsWith(publicBase) && !inputUrl.startsWith(internalBase);
}

export function shouldPreferYtDlpDirect(inputUrl: string): boolean {
  if (!/^https?:\/\//i.test(inputUrl)) return false;
  try {
    const url = new URL(inputUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "nicovideo.jp" || host === "nico.ms" || host === "sp.nicovideo.jp";
  } catch {
    return false;
  }
}

function buildYouTubeWatchUrl(identifier: string): string | null {
  const videoId = identifier.trim();
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function getRecoverableTrackUrl(track: PendingTrack): string | null {
  if (isTrackRecoveredByYtDlp(track)) {
    return null;
  }
  const markedSourceUrl = getRecoveredTrackOriginalSourceUrl(track);
  if (markedSourceUrl && shouldAttemptYtDlpFallback(markedSourceUrl)) {
    return markedSourceUrl;
  }
  const sourceName = track.info.sourceName?.trim().toLowerCase();
  const identifier = track.info.identifier?.trim();
  if (sourceName === "youtube" && identifier) {
    return buildYouTubeWatchUrl(identifier);
  }
  if (sourceName === "youtubemusic" && identifier) {
    return buildYouTubeWatchUrl(identifier);
  }
  const rawUri = track.info.uri?.trim();
  if (rawUri && shouldAttemptYtDlpFallback(rawUri)) {
    return rawUri;
  }
  return null;
}

export async function downloadExternalTrack(
  inputUrl: string,
): Promise<DownloadedExternalTrack> {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.ytdlp.enabled) {
    throw new YtDlpUserError(
      "外部動画サイトのURLフォールバックは無効です。YT_DLP_ENABLED を確認してください。",
    );
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  const probeArgs = [
    ...getBaseArgsInternal(),
    "--no-warnings",
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    "-I",
    "1",
    "--",
    inputUrl,
  ];
  const probeResult = await runYtDlp(probeArgs);
  const rawInfo = probeResult.stdout.trim();
  if (!rawInfo) {
    throw new Error("yt-dlp metadata output was empty");
  }

  const info = JSON.parse(rawInfo) as YtDlpInfoEntry;
  const metadata = extractMetadata(info, inputUrl);
  const prefix = `remote-${crypto.randomUUID()}`;
  const outputTemplate = path.join(UPLOAD_DIR, `${prefix}.%(ext)s`);

  try {
    const downloadArgs = [
      ...getBaseArgsInternal(),
      "--no-warnings",
      "--no-part",
      "--no-playlist",
      "--max-filesize",
      `${runtimeConfig.ytdlp.maxFileSizeMb}M`,
      "-I",
      "1",
      "-f",
      "bestaudio/best",
      "-o",
      outputTemplate,
      "--",
      inputUrl,
    ];

    try {
      await runYtDlp(downloadArgs);
    } catch (error) {
      if (isMaxFileSizeError(error)) {
        throw new YtDlpUserError(
          `外部URLから取得できるファイルは最大 ${runtimeConfig.ytdlp.maxFileSizeMb} MBです。`,
        );
      }
      throw error;
    }
    const filePath = await findDownloadedFile(prefix);
    if (!filePath) {
      throw new Error("yt-dlp download completed, but no media file was found");
    }

    const fileStats = await fs.promises.stat(filePath);
    if (fileStats.size > runtimeConfig.ytdlp.maxFileSizeBytes) {
      throw new YtDlpUserError(
        `外部URLから取得できるファイルは最大 ${runtimeConfig.ytdlp.maxFileSizeMb} MBです。`,
      );
    }

    const filename = path.basename(filePath);
    return {
      ...metadata,
      filePath,
      filename,
      internalUrl: makeInternalUrl(filename),
      publicUrl: makePublicUrl(filename),
    };
  } catch (error) {
    await deleteDownloadedArtifacts(prefix);
    throw error;
  }
}

export async function cleanupExpiredYtDlpDownloads(
  now = Date.now(),
): Promise<YtDlpCleanupResult> {
  const maxAgeMs = getRuntimeConfig().ytdlp.tempFileMaxAgeMs;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(UPLOAD_DIR, { withFileTypes: true });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { scanned: 0, deleted: 0 };
    }
    throw error;
  }

  const targets = entries.filter(
    (entry) => entry.isFile() && entry.name.startsWith("remote-"),
  );
  let deleted = 0;

  for (const entry of targets) {
    const filePath = path.join(UPLOAD_DIR, entry.name);
    try {
      const stats = await fs.promises.stat(filePath);
      if (now - stats.mtimeMs < maxAgeMs) continue;
      await fs.promises.unlink(filePath);
      deleted += 1;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        continue;
      }
      console.warn(`[music] failed to clean temporary file: ${entry.name}`, error);
    }
  }

  return { scanned: targets.length, deleted };
}

async function findDownloadedFile(prefix: string): Promise<string | null> {
  const names = await fs.promises.readdir(UPLOAD_DIR);
  const matchedName = names.find((name) => name.startsWith(`${prefix}.`));
  return matchedName ? path.join(UPLOAD_DIR, matchedName) : null;
}

async function deleteDownloadedArtifacts(prefix: string): Promise<void> {
  try {
    const names = await fs.promises.readdir(UPLOAD_DIR);
    const targets = names.filter((name) => name.startsWith(`${prefix}.`));
    await Promise.all(
      targets.map((name) =>
        fs.promises.unlink(path.join(UPLOAD_DIR, name)).catch(() => undefined),
      ),
    );
  } catch {
    // noop
  }
}
