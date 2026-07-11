import { spawn } from "node:child_process";
import { getRuntimeConfig } from "../../config/runtime";
import { YtDlpUserError, ensureManagedBinary, getManagedBinaryPathInternal, pathExists } from "./ytDlpBinary";

export interface YtDlpResult {
  stdout: string;
  stderr: string;
}

function isCommandNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function getBaseArgs(): string[] {
  return ["--ignore-config", "--no-update", "--abort-on-error"];
}

export function getBaseArgsInternal(): string[] {
  return getBaseArgs();
}

async function executeYtDlpCommand(
  command: string,
  args: string[],
): Promise<YtDlpResult> {
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

export async function runYtDlp(args: string[]): Promise<YtDlpResult> {
  const runtimeConfig = getRuntimeConfig();
  const configuredBinaryPath = runtimeConfig.ytdlp.binaryPath?.trim();

  // 1. 明示的にパスが設定されていればそれを使う
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

  // 2. PATH 上の yt-dlp を試す
  try {
    return await executeYtDlpCommand("yt-dlp", args);
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error;
    }
  }

  // 3. マネージドバイナリが既にあればそれを使う
  const managedBinaryPath = getManagedBinaryPathInternal();
  if (await pathExists(managedBinaryPath)) {
    const verifiedBinaryPath = await ensureManagedBinary(runtimeConfig.ytdlp.autoDownload);
    return executeYtDlpCommand(verifiedBinaryPath, args);
  }

  // 4. 自動ダウンロードして実行
  if (!runtimeConfig.ytdlp.autoDownload) {
    throw new YtDlpUserError(
      "yt-dlp が見つかりません。YT_DLP_PATH を設定するか、yt-dlp を PATH に追加してください。",
    );
  }

  const downloadedBinaryPath = await ensureManagedBinary(true);
  return executeYtDlpCommand(downloadedBinaryPath, args);
}
