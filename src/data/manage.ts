import { SETTING_KEYS } from "../constants/settings";
import { getSetting, setSetting } from "./settings";
import { parseStoredSettingJson } from "./settingJson";

export const MANAGED_USER_CONTENT_MAX_LENGTH = 1000;

export type ManagedUserEntry = Readonly<{
  userId: string;
  content: string;
}>;

function parseManagedUsers(raw: string | null, gid: string): Record<string, string> {
  if (raw === null) return {};

  const parsed = parseStoredSettingJson(raw, gid, SETTING_KEYS.managedUsers);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`[data] Invalid stored managedUsers (guild=${gid}): expected an object`);
  }

  const entries: Record<string, string> = {};
  for (const [userId, content] of Object.entries(parsed)) {
    if (!/^\d{17,20}$/.test(userId) || typeof content !== "string") {
      throw new Error(`[data] Invalid stored managedUsers entry (guild=${gid})`);
    }
    const trimmed = content.trim();
    if (trimmed) entries[userId] = trimmed;
  }
  return entries;
}

function saveManagedUsers(gid: string, entries: Record<string, string>): void {
  const sorted = Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  setSetting(gid, SETTING_KEYS.managedUsers, JSON.stringify(sorted));
}

export function getManagedUserContent(
  gid: string,
  userId: string,
): string | null {
  return parseManagedUsers(getSetting(gid, SETTING_KEYS.managedUsers), gid)[userId] ?? null;
}

export function setManagedUserContent(
  gid: string,
  userId: string,
  content: string,
): string {
  const normalized = content.trim();
  const entries = parseManagedUsers(getSetting(gid, SETTING_KEYS.managedUsers), gid);
  entries[userId] = normalized;
  saveManagedUsers(gid, entries);
  return normalized;
}

export function clearManagedUserContent(gid: string, userId: string): boolean {
  const entries = parseManagedUsers(getSetting(gid, SETTING_KEYS.managedUsers), gid);
  if (!(userId in entries)) return false;
  delete entries[userId];
  saveManagedUsers(gid, entries);
  return true;
}

export function listManagedUserEntries(gid: string): ManagedUserEntry[] {
  return Object.entries(
    parseManagedUsers(getSetting(gid, SETTING_KEYS.managedUsers), gid),
  ).map(([userId, content]) => ({ userId, content }));
}
