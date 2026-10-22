import { spawn } from "node:child_process";
import { getRuntimeConfig } from "../../config/runtime";
import { YtDlpUserError, ensureManagedBinary, getManagedBinaryPathInternal, pathExists } from "./ytDlpBinary";

export interface YtDlpResult {
  stdout: string;
  stderr: string;
}

const announcedYtDlpCommands = new Set<string>();

function isCommandNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function getBaseArgs(): string[] {
  const args = ["--ignore-config", "--no-update", "--abort-on-error"];
  const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);

  // Deno is enabled by default in yt-dlp. When the Bot itself runs on a
  // supported Node.js version, also make that runtime available for YouTube's
  // JavaScript challenge solver so a separate Deno install is not mandatory.
  if (Number.isFinite(nodeMajorVersion) && nodeMajorVersion >= 22) {
    args.push("--js-runtimes", `node:${process.execPath}`);
  }

  return args;
}

export function getBaseArgsInternal(): string[] {
  return getBaseArgs();
}

async function executeYtDlpCommand(
  command: string,
  args: string[],
): Promise<YtDlpResult> {
  const timeoutMs = getRuntimeConfig().ytdlp.timeoutMs;

  if (!announcedYtDlpCommands.has(command)) {
    announcedYtDlpCommands.add(command);
    console.log(`[music] yt-dlp executable: ${command}`);
  }

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
        reject(new Error(`yt-dlp failed (${command}): ${detail}`));
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

  // 2. バージョンとSHA-256を管理できるマネージドバイナリを優先する。
  // PATH上の古いディストリビューション版が、YT_DLP_VERSIONで指定した
  // バージョンを意図せず上書きしないようにする。
  const managedBinaryPath = getManagedBinaryPathInternal();
  if (await pathExists(managedBinaryPath)) {
    const verifiedBinaryPath = await ensureManagedBinary(runtimeConfig.ytdlp.autoDownload);
    return executeYtDlpCommand(verifiedBinaryPath, args);
  }

  // 3. 自動取得が有効なら指定バージョンを取得して実行する。
  if (runtimeConfig.ytdlp.autoDownload) {
    const downloadedBinaryPath = await ensureManagedBinary(true);
    return executeYtDlpCommand(downloadedBinaryPath, args);
  }

  // 4. 自動取得を明示的に無効化した場合のみ、PATH上のバイナリへ
  // フォールバックする。
  try {
    return await executeYtDlpCommand("yt-dlp", args);
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error;
    }
  }

  throw new YtDlpUserError(
    "yt-dlp が見つかりません。YT_DLP_PATH を設定するか、YT_DLP_AUTO_DOWNLOAD を有効にしてください。",
  );
}
