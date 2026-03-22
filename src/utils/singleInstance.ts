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

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLockMetadata(lockDirectory: string): LockMetadata | null {
  try {
    const raw = fs.readFileSync(getLockInfoPath(lockDirectory), "utf8");
    const parsed = JSON.parse(raw) as Partial<LockMetadata>;
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
  } catch {
    return null;
  }
}

function writeLockMetadata(lockDirectory: string): void {
  const metadata: LockMetadata = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    argv: process.argv,
    cwd: process.cwd(),
  };

  fs.writeFileSync(
    getLockInfoPath(lockDirectory),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

function releaseLock(lockDirectory: string): void {
  const metadata = readLockMetadata(lockDirectory);
  if (metadata && metadata.pid !== process.pid) {
    return;
  }

  fs.rmSync(lockDirectory, { recursive: true, force: true });
}

export function ensureSingleInstance(lockDirectory = getDefaultLockDirectory()): void {
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true });

  try {
    fs.mkdirSync(lockDirectory);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "EEXIST") {
      throw error;
    }

    const metadata = readLockMetadata(lockDirectory);
    if (metadata && isProcessAlive(metadata.pid)) {
      const startedAt = metadata.createdAt || "unknown";
      throw new Error(
        `[runtime] another bot instance is already running (pid=${metadata.pid}, startedAt=${startedAt}). Stop the existing process before starting a new one.`,
      );
    }

    fs.rmSync(lockDirectory, { recursive: true, force: true });
    fs.mkdirSync(lockDirectory);
  }

  writeLockMetadata(lockDirectory);

  let released = false;
  const cleanup = (): void => {
    if (released) {
      return;
    }
    released = true;
    releaseLock(lockDirectory);
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
