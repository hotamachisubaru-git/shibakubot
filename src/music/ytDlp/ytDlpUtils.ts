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
      "-I",
      "1",
      "-f",
      "bestaudio/best",
      "-o",
      outputTemplate,
      "--",
      inputUrl,
    ];

    await runYtDlp(downloadArgs);
    const filePath = await findDownloadedFile(prefix);
    if (!filePath) {
      throw new Error("yt-dlp download completed, but no media file was found");
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
