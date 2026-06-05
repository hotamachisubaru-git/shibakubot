import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeConfig } from "../../config/runtime";

let managedBinaryDownloadPromise: Promise<string> | null = null;

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
  if (process.platform === "linux" || process.platform === "darwin" || process.platform === "freebsd") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  }
  return null;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function saveResponseBodyToFile(response: globalThis.Response, savePath: string): Promise<void> {
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

export async function ensureManagedBinary(): Promise<string> {
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
          throw new Error(`yt-dlp binary download failed: ${response.status} ${response.statusText}`);
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

export function getManagedBinaryPathInternal(): string {
  return getManagedBinaryPath();
}

export class YtDlpUserError extends Error {
  override name = "YtDlpUserError";
}
