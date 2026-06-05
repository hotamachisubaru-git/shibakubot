// src/commands/menu/helpers.ts
import fs from "fs";
import path from "path";
import { safeCount } from "./format";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  const fixed = idx === 0 ? size.toFixed(0) : size.toFixed(size >= 10 ? 0 : 1);
  return `${fixed} ${units[idx]}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length) parts.push(`${hours}h`);
  if (minutes || parts.length) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatTimestamp(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join("") +
    "-" +
    [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join("")
  );
}

export function listBackupFiles(dir: string, limit: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort().reverse();
  return files.slice(0, limit).map((name) => {
    const full = path.join(dir, name);
    const size = fs.existsSync(full) ? formatBytes(fs.statSync(full).size) : "0 B";
    return `${name} (${size})`;
  });
}

export function copyDbWithWal(src: string, dest: string): string[] {
  if (!fs.existsSync(src)) return [];
  ensureDir(path.dirname(dest));
  const copied: string[] = [];
  fs.copyFileSync(src, dest);
  copied.push(dest);
  for (const suffix of ["-wal", "-shm"]) {
    const walSrc = `${src}${suffix}`;
    if (fs.existsSync(walSrc)) {
      const walDest = `${dest}${suffix}`;
      fs.copyFileSync(walSrc, walDest);
      copied.push(walDest);
    }
  }
  return copied;
}

export function looksLikeSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

export function pickUnionValue<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
