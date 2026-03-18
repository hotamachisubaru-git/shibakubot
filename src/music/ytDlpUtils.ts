import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeConfig } from "../config/runtime";
import { makeInternalUrl } from "../utils/makeInternalUrl";
import { makePublicUrl } from "../utils/makePublicUrl";
import { MAX_TRACK_MINUTES, MAX_TRACK_MS, UPLOAD_DIR } from "./constants";
import {
  getRecoveredTrackOriginalSourceUrl,
  isTrackRecoveredByYtDlp,
  type PendingTrack,
} from "./trackUtils";

type YtDlpInfoEntry = Readonly<Record<string, unknown>>;

export type DownloadedExternalTrack = Readonly<{
  title: string;
  uploader: string | null;
  sourceUrl: string;
  artworkUrl: string | null;
  extractor: string | null;
  durationMs: number | null;
  isLive: boolean;
  filePath: string;
  filename: string;
  internalUrl: string;
  publicUrl: string;
}>;

export class YtDlpUserError extends Error {}

let managedBinaryDownloadPromise: Promise<string> | null = null;

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCommandNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function getManagedBinaryFilename(): string {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function getManagedBinaryPath(): string {
  return path.join(getRuntimeConfig().ytdlp.cacheDir, getManagedBinaryFilename());
}

function getManagedBinaryDownloadUrl(): string | null {
  if (process.platform === "win32") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  }

  if (
    process.platform === "linux" ||
    process.platform === "darwin" ||
    process.platform === "freebsd"
  ) {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  }

  return null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
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

async function ensureManagedBinary(): Promise<string> {
  const runtimeConfig = getRuntimeConfig();
  const targetPath = getManagedBinaryPath();

  if (await pathExists(targetPath)) {
    return targetPath;
  }

  const downloadUrl = getManagedBinaryDownloadUrl();
  if (!downloadUrl) {
    throw new YtDlpUserError(
      "このOSでは yt-dlp の自動取得に対応していません。YT_DLP_PATH を設定してください。",
    );
  }

  if (!managedBinaryDownloadPromise) {
    managedBinaryDownloadPromise = (async () => {
      await fs.promises.mkdir(runtimeConfig.ytdlp.cacheDir, { recursive: true });

      const tempPath = `${targetPath}.download-${process.pid}-${Date.now()}`;
      try {
        const response = await fetch(downloadUrl, {
          signal: AbortSignal.timeout(runtimeConfig.ytdlp.timeoutMs),
        });
        if (!response.ok) {
          throw new Error(
            `yt-dlp binary download failed: ${response.status} ${response.statusText}`,
          );
        }

        await saveResponseBodyToFile(response, tempPath);
        if (process.platform !== "win32") {
          await fs.promises.chmod(tempPath, 0o755);
        }
        await fs.promises.rename(tempPath, targetPath);
        return targetPath;
      } catch (error) {
        try {
          await fs.promises.unlink(tempPath);
        } catch {
          // noop
        }
        throw error;
      } finally {
        managedBinaryDownloadPromise = null;
      }
    })();
  }

  return managedBinaryDownloadPromise;
}

function getBaseArgs(): string[] {
  return ["--ignore-config", "--no-update", "--abort-on-error"];
}

async function executeYtDlpCommand(
  command: string,
  args: string[],
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  const timeoutMs = getRuntimeConfig().ytdlp.timeoutMs;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      child.kill();
      finish(() => {
        reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish(() => {
        reject(error);
      });
    });

    child.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        const detail = stderr.trim() || stdout.trim() || `exit code ${code ?? "unknown"}`;
        reject(new Error(`yt-dlp failed: ${detail}`));
      });
    });
  });
}

async function runYtDlp(
  args: string[],
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  const runtimeConfig = getRuntimeConfig();
  const configuredBinaryPath = runtimeConfig.ytdlp.binaryPath?.trim();

  if (configuredBinaryPath) {
    try {
      return await executeYtDlpCommand(configuredBinaryPath, args);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        throw new YtDlpUserError(
          `YT_DLP_PATH に指定された実行ファイルが見つかりません: ${configuredBinaryPath}`,
        );
      }
      throw error;
    }
  }

  try {
    return await executeYtDlpCommand("yt-dlp", args);
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error;
    }
  }

  const managedBinaryPath = getManagedBinaryPath();
  if (await pathExists(managedBinaryPath)) {
    return executeYtDlpCommand(managedBinaryPath, args);
  }

  if (!runtimeConfig.ytdlp.autoDownload) {
    throw new YtDlpUserError(
      "yt-dlp が見つかりません。YT_DLP_PATH を設定するか、yt-dlp を PATH に追加してください。",
    );
  }

  const downloadedBinaryPath = await ensureManagedBinary();
  return executeYtDlpCommand(downloadedBinaryPath, args);
}

function pickPrimaryEntry(info: YtDlpInfoEntry): YtDlpInfoEntry {
  const entries = Array.isArray(info.entries)
    ? info.entries.filter(
        (entry): entry is YtDlpInfoEntry =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

  return entries[0] ?? info;
}

function extractMetadata(info: YtDlpInfoEntry, inputUrl: string) {
  const primary = pickPrimaryEntry(info);
  const title =
    toText(primary.fulltitle) ??
    toText(primary.title) ??
    toText(info.title) ??
    "remote media";
  const uploader =
    toText(primary.channel) ??
    toText(primary.uploader) ??
    toText(primary.creator) ??
    toText(info.channel) ??
    toText(info.uploader) ??
    null;
  const sourceUrl =
    toText(primary.webpage_url) ??
    toText(primary.original_url) ??
    toText(info.webpage_url) ??
    inputUrl;
  const artworkUrl =
    toText(primary.thumbnail) ?? toText(info.thumbnail) ?? null;
  const extractor =
    toText(primary.extractor_key) ??
    toText(primary.extractor) ??
    toText(info.extractor_key) ??
    toText(info.extractor) ??
    null;
  const durationSeconds =
    toNullableNumber(primary.duration) ?? toNullableNumber(info.duration);
  const liveStatus =
    toText(primary.live_status)?.toLowerCase() ??
    toText(info.live_status)?.toLowerCase() ??
    "";
  const isLive =
    primary.is_live === true ||
    info.is_live === true ||
    liveStatus === "is_live" ||
    liveStatus === "is_upcoming" ||
    liveStatus === "post_live";

  return {
    title,
    uploader,
    sourceUrl,
    artworkUrl,
    extractor,
    durationMs:
      durationSeconds !== null ? Math.max(0, Math.round(durationSeconds * 1000)) : null,
    isLive,
  };
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

  const rawUri = track.info.uri?.trim();
  if (rawUri && shouldAttemptYtDlpFallback(rawUri)) {
    return rawUri;
  }

  const sourceName = track.info.sourceName?.trim().toLowerCase();
  const identifier = track.info.identifier?.trim();
  if (sourceName === "youtube" && identifier) {
    return buildYouTubeWatchUrl(identifier);
  }

  if (sourceName === "youtubemusic" && identifier) {
    return buildYouTubeWatchUrl(identifier);
  }

  return null;
}

export function buildExternalTrackBlockedMessage(
  title: string,
  durationMs: number | null,
  isLive: boolean,
): string | null {
  if (isLive || durationMs === null) {
    return `🚫 ライブ配信/長さ不明の曲は再生できません。（最大 ${MAX_TRACK_MINUTES} 分まで）`;
  }

  if (durationMs > MAX_TRACK_MS) {
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    return `🚫 **${title}** は長すぎます（${mins}:${secs
      .toString()
      .padStart(2, "0")}）。最大 ${MAX_TRACK_MINUTES} 分までです。`;
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
    ...getBaseArgs(),
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
      ...getBaseArgs(),
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
