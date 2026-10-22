import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeConfig } from "../../config/runtime";
import { DEFAULT_YT_DLP_VERSION } from "../../config/constants";
import { isMissingFileError, removeTemporaryFile } from "../misc/fileCleanup";

let managedBinaryDownloadPromise: Promise<string> | null = null;

const DEFAULT_YT_DLP_SHA256: Readonly<Record<string, string>> = {
  "yt-dlp": "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6",
  "yt-dlp.exe": "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
};

function getManagedBinaryAssetName(): string {
  return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

function getManagedBinaryFilename(): string {
  const version = getRuntimeConfig().ytdlp.version.replace(/[^0-9A-Za-z._-]/g, "-");
  return process.platform === "win32"
    ? `yt-dlp-${version}.exe`
    : `yt-dlp-${version}`;
}

function getManagedBinaryPath(): string {
  return path.join(getRuntimeConfig().ytdlp.cacheDir, getManagedBinaryFilename());
}

function getManagedBinaryDownloadUrl(): string | null {
  if (
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin" ||
    process.platform === "freebsd"
  ) {
    const version = encodeURIComponent(getRuntimeConfig().ytdlp.version);
    const assetName = getManagedBinaryAssetName();
    return `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${assetName}`;
  }
  return null;
}

function getExpectedSha256(): string {
  const runtimeConfig = getRuntimeConfig();
  const configuredSha256 = runtimeConfig.ytdlp.sha256?.trim().toLowerCase();
  if (configuredSha256) {
    if (!/^[0-9a-f]{64}$/.test(configuredSha256)) {
      throw new YtDlpUserError("YT_DLP_SHA256 は64文字のSHA-256値で指定してください。");
    }
    return configuredSha256;
  }

  if (runtimeConfig.ytdlp.version === DEFAULT_YT_DLP_VERSION) {
    return DEFAULT_YT_DLP_SHA256[getManagedBinaryAssetName()];
  }

  throw new YtDlpUserError(
    "デフォルト以外の YT_DLP_VERSION を使う場合は YT_DLP_SHA256 も指定してください。",
  );
}

async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<boolean> {
  return (await calculateFileSha256(filePath)) === expectedSha256;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    // Permission and I/O failures must not silently select another executable.
    throw error;
  }
}

async function saveResponseBodyToFile(response: globalThis.Response, savePath: string): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error("download failed: empty response body");
  }
  const reader = body.getReader();
  const fileHandle = await fs.promises.open(savePath, "w");
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value || chunk.value.length === 0) continue;
      await fileHandle.write(chunk.value);
    }
    completed = true;
  } finally {
    try {
      await fileHandle.close();
    } catch (error) {
      if (completed) throw error;
      console.warn(`[music] failed to close yt-dlp download: ${savePath}`, error);
    }
  }
}

export async function ensureManagedBinary(allowDownload = true): Promise<string> {
  const runtimeConfig = getRuntimeConfig();
  const targetPath = getManagedBinaryPath();
  const expectedSha256 = getExpectedSha256();

  if (await pathExists(targetPath)) {
    if (await verifyFileSha256(targetPath, expectedSha256)) {
      return targetPath;
    }
    try {
      await fs.promises.unlink(targetPath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    if (!allowDownload) {
      throw new YtDlpUserError(
        "キャッシュ済みyt-dlpのSHA-256検証に失敗しました。自動取得を有効にするか、キャッシュを更新してください。",
      );
    }
  } else if (!allowDownload) {
    throw new YtDlpUserError(
      "yt-dlp が見つかりません。YT_DLP_PATH を設定するか、自動取得を有効にしてください。",
    );
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
          throw new Error(`yt-dlp binary download failed: ${response.status} ${response.statusText}`);
        }
        await saveResponseBodyToFile(response, tempPath);
        if (!(await verifyFileSha256(tempPath, expectedSha256))) {
          throw new Error("yt-dlp binary SHA-256 verification failed");
        }
        if (process.platform !== "win32") {
          await fs.promises.chmod(tempPath, 0o755);
        }
        await fs.promises.rename(tempPath, targetPath);
        return targetPath;
      } catch (error) {
        await removeTemporaryFile(tempPath);
        throw error;
      } finally {
        managedBinaryDownloadPromise = null;
      }
    })();
  }

  return managedBinaryDownloadPromise;
}

export function getManagedBinaryPathInternal(): string {
  return getManagedBinaryPath();
}

export class YtDlpUserError extends Error {
  override name = "YtDlpUserError";
}
