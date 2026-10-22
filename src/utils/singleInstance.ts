import fs from "node:fs";
import path from "node:path";

type LockMetadata = Readonly<{
  pid: number;
  createdAt: string;
  argv: string[];
  cwd: string;
}>;

const LOCK_INFO_FILE = "instance.json";

function getDefaultLockDirectory(): string {
  return path.resolve(process.cwd(), "data", "runtime", "bot-instance.lock");
}

function getLockInfoPath(lockDirectory: string): string {
  return path.join(lockDirectory, LOCK_INFO_FILE);
}

function isDirectory(pathname: string): boolean {
  try {
    return fs.statSync(pathname).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw error;
  }
}

function parseLockMetadata(raw: string): LockMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LockMetadata> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const pid = typeof parsed.pid === "number" ? parsed.pid : null;
    if (pid === null || !Number.isInteger(pid) || pid <= 0) {
      return null;
    }

    return {
      pid,
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date(0).toISOString(),
      argv: Array.isArray(parsed.argv)
        ? parsed.argv.filter((value): value is string => typeof value === "string")
        : [],
      cwd: typeof parsed.cwd === "string" ? parsed.cwd : "",
    };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function readLockMetadata(lockPath: string): LockMetadata | null {
  try {
    const metadataPath = isDirectory(lockPath)
      ? getLockInfoPath(lockPath)
      : lockPath;
    return parseLockMetadata(fs.readFileSync(metadataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function buildLockMetadata(): LockMetadata {
  return {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    argv: process.argv,
    cwd: process.cwd(),
  };
}

function writeLockMetadata(lockPath: string): void {
  const fd = fs.openSync(lockPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(buildLockMetadata(), null, 2)}\n`, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function releaseLock(lockPath: string): void {
  const metadata = readLockMetadata(lockPath);
  if (metadata && metadata.pid !== process.pid) {
    return;
  }

  fs.rmSync(lockPath, { recursive: isDirectory(lockPath), force: true });
}

export function ensureSingleInstance(lockPath = getDefaultLockDirectory()): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      // openSync(..., "wx") reserves the lock path atomically.  The previous
      // directory-then-metadata approach had a gap where concurrent starts
      // could delete each other's not-yet-written lock directories.
      writeLockMetadata(lockPath);
      break;
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code !== "EEXIST" && errno.code !== "EISDIR") {
        throw error;
      }

      const metadata = readLockMetadata(lockPath);
      if (metadata && isProcessAlive(metadata.pid)) {
        const startedAt = metadata.createdAt || "unknown";
        throw new Error(
          `[runtime] another bot instance is already running (pid=${metadata.pid}, startedAt=${startedAt}). Stop the existing process before starting a new one.`,
        );
      }

      if (!metadata) {
        throw new Error(
          `[runtime] bot instance lock exists but is not valid: ${lockPath}. Refusing to remove it because another startup may be initializing. Confirm no bot is running, then remove this lock and start again.`,
        );
      }

      // A valid lock whose owner no longer exists is safe to reclaim.  Retrying
      // the exclusive create keeps the hand-off atomic when multiple starters
      // discover the same stale lock.
      fs.rmSync(lockPath, { recursive: isDirectory(lockPath), force: true });
    }
  }

  let released = false;
  const cleanup = (): void => {
    if (released) {
      return;
    }
    released = true;
    try {
      releaseLock(lockPath);
    } catch (error) {
      // Cleanup must not replace the original exit status or interrupt shutdown.
      console.warn("[runtime] failed to release bot instance lock", { lockPath }, error);
    }
  };

  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.once("beforeExit", cleanup);
}
