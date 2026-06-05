import { getRuntimeConfig } from "../config/runtime";
import { SETTING_KEYS } from "../constants/settings";
import {
  type CounterMap,
  getAllCounts,
  getGuildDbContext,
  getImmuneList,
  parseSettingBoolean,
} from "./store";

export type SbkRange = { min: number; max: number };

const runtimeConfig = getRuntimeConfig();
const SBK_MIN_DEFAULT = runtimeConfig.sbk.min;
const SBK_MAX_DEFAULT = runtimeConfig.sbk.max;
const MUSIC_VOL_DEFAULT = runtimeConfig.music.fixedVolume;
const MUSIC_VOL_MIN = 0;
const MUSIC_VOL_MAX = 20;
const MUSIC_MAX_TRACK_MINUTES_DEFAULT = runtimeConfig.music.maxTrackMinutes;
export const MUSIC_MAX_TRACK_MINUTES_MIN = 1;
export const MUSIC_MAX_TRACK_MINUTES_MAX = Math.floor(2_147_483_647 / 60_000);

export function getSetting(gid: string, key: string): string | null {
  const context = getGuildDbContext(gid);
  if (context.settingsCache.has(key)) {
    return context.settingsCache.get(key) ?? null;
  }

  const row = context.statements.selectSetting.get(key) as
    | { value: string }
    | undefined;
  const value = row?.value ?? null;
  context.settingsCache.set(key, value);
  return value;
}

export function setSetting(
  gid: string,
  key: string,
  value: string | null,
): void {
  const context = getGuildDbContext(gid);

  if (value === null) {
    context.statements.deleteSetting.run(key);
    context.settingsCache.set(key, null);
    return;
  }

  context.statements.upsertSetting.run(key, value);
  context.settingsCache.set(key, value);
}

export function getSbkRange(gid: string): SbkRange {
  let min = Number(getSetting(gid, SETTING_KEYS.sbkMin) ?? SBK_MIN_DEFAULT);
  let max = Number(getSetting(gid, SETTING_KEYS.sbkMax) ?? SBK_MAX_DEFAULT);

  if (!Number.isFinite(min) || min < 1) min = SBK_MIN_DEFAULT;
  if (!Number.isFinite(max) || max < min) max = min;

  min = Math.floor(min);
  max = Math.floor(max);

  return { min, max };
}

export function setSbkRange(
  gid: string,
  min: number,
  max: number,
): SbkRange {
  const context = getGuildDbContext(gid);
  const normalizedMin =
    Number.isFinite(min) && min >= 1 ? Math.floor(min) : SBK_MIN_DEFAULT;
  const normalizedMaxCandidate =
    Number.isFinite(max) ? Math.floor(max) : normalizedMin;
  const normalizedMax = Math.max(normalizedMin, normalizedMaxCandidate);

  context.db.transaction(() => {
    context.statements.upsertSetting.run(
      SETTING_KEYS.sbkMin,
      String(normalizedMin),
    );
    context.statements.upsertSetting.run(
      SETTING_KEYS.sbkMax,
      String(normalizedMax),
    );
  })();

  context.settingsCache.set(SETTING_KEYS.sbkMin, String(normalizedMin));
  context.settingsCache.set(SETTING_KEYS.sbkMax, String(normalizedMax));

  return { min: normalizedMin, max: normalizedMax };
}

export function getUserMusicVolume(gid: string, userId: string): number {
  const row = getGuildDbContext(gid).statements.selectMusicVolume.get(
    userId,
    SETTING_KEYS.musicVolume,
  ) as { value: string } | undefined;

  const value = Number(row?.value ?? MUSIC_VOL_DEFAULT);
  if (!Number.isFinite(value)) {
    return MUSIC_VOL_DEFAULT;
  }

  return Math.min(MUSIC_VOL_MAX, Math.max(MUSIC_VOL_MIN, Math.round(value)));
}

export function setUserMusicVolume(
  gid: string,
  userId: string,
  volume: number,
): number {
  const context = getGuildDbContext(gid);
  const clamped = Math.min(
    MUSIC_VOL_MAX,
    Math.max(MUSIC_VOL_MIN, Math.round(volume)),
  );

  context.statements.upsertMusicVolume.run(
    userId,
    SETTING_KEYS.musicVolume,
    String(clamped),
  );

  return clamped;
}

function normalizeMusicMaxTrackMinutes(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const minutes = Math.floor(parsed);
  if (
    minutes < MUSIC_MAX_TRACK_MINUTES_MIN ||
    minutes > MUSIC_MAX_TRACK_MINUTES_MAX
  ) {
    return null;
  }

  return minutes;
}

export function getDefaultMusicMaxTrackMinutes(): number {
  return MUSIC_MAX_TRACK_MINUTES_DEFAULT;
}

export function getMusicMaxTrackMinutesOverride(gid: string): number | null {
  const raw = getSetting(gid, SETTING_KEYS.musicMaxTrackMinutes);
  if (raw === null) {
    return null;
  }

  return normalizeMusicMaxTrackMinutes(raw);
}

export function getMusicMaxTrackMinutes(gid: string): number {
  return (
    getMusicMaxTrackMinutesOverride(gid) ??
    MUSIC_MAX_TRACK_MINUTES_DEFAULT
  );
}

export function setMusicMaxTrackMinutes(
  gid: string,
  minutes: number,
): number {
  const normalized =
    normalizeMusicMaxTrackMinutes(minutes) ?? MUSIC_MAX_TRACK_MINUTES_DEFAULT;
  setSetting(gid, SETTING_KEYS.musicMaxTrackMinutes, String(normalized));
  return normalized;
}

export function clearMusicMaxTrackMinutes(gid: string): void {
  setSetting(gid, SETTING_KEYS.musicMaxTrackMinutes, null);
}

function normalizeNgWord(word: string): string {
  return word.trim().toLowerCase();
}

function saveMusicNgWords(gid: string, words: string[]): string[] {
  const normalized = Array.from(
    new Set(words.map(normalizeNgWord).filter((word) => word.length > 0)),
  ).sort();
  setSetting(gid, SETTING_KEYS.musicNgWords, JSON.stringify(normalized));
  return normalized;
}

export function getMusicNgWords(gid: string): string[] {
  const raw = getSetting(gid, SETTING_KEYS.musicNgWords);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((word) => typeof word === "string")
          .map((word) => normalizeNgWord(word))
          .filter((word) => word.length > 0),
      ),
    ).sort();
  } catch {
    return [];
  }
}

export function addMusicNgWord(
  gid: string,
  word: string,
): { added: boolean; list: string[] } {
  const current = getMusicNgWords(gid);
  const normalized = normalizeNgWord(word);
  if (!normalized) return { added: false, list: current };
  if (current.includes(normalized)) return { added: false, list: current };

  return {
    added: true,
    list: saveMusicNgWords(gid, [...current, normalized]),
  };
}

export function removeMusicNgWord(
  gid: string,
  word: string,
): { removed: boolean; list: string[] } {
  const current = getMusicNgWords(gid);
  const normalized = normalizeNgWord(word);
  if (!normalized) return { removed: false, list: current };

  const next = current.filter((entry) => entry !== normalized);
  if (next.length === current.length) {
    return { removed: false, list: current };
  }

  return {
    removed: true,
    list: saveMusicNgWords(gid, next),
  };
}

export function clearMusicNgWords(gid: string): void {
  setSetting(gid, SETTING_KEYS.musicNgWords, JSON.stringify([]));
}

export function getMusicEnabled(gid: string): boolean {
  return parseSettingBoolean(getSetting(gid, SETTING_KEYS.musicEnabled), true);
}

export function setMusicEnabled(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.musicEnabled, enabled ? "true" : "false");
}

export function getMusicRepeat(gid: string): boolean {
  return parseSettingBoolean(
    getSetting(gid, SETTING_KEYS.musicRepeat),
    false,
  );
}

export function setMusicRepeat(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.musicRepeat, enabled ? "true" : "false");
}

export function getMaintenanceEnabled(gid: string): boolean {
  return parseSettingBoolean(
    getSetting(gid, SETTING_KEYS.maintenanceEnabled),
    false,
  );
}

export function setMaintenanceEnabled(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.maintenanceEnabled, enabled ? "true" : "false");
}

export function getAiChatEnabled(gid: string): boolean {
  return parseSettingBoolean(getSetting(gid, SETTING_KEYS.aiChatEnabled), true);
}

export function setAiChatEnabled(gid: string, enabled: boolean): void {
  setSetting(gid, SETTING_KEYS.aiChatEnabled, enabled ? "true" : "false");
}

export function loadGuildStore(gid: string): {
  counts: CounterMap;
  immune: string[];
  settings: { sbkMin: number; sbkMax: number };
} {
  const { min, max } = getSbkRange(gid);
  return {
    counts: getAllCounts(gid),
    immune: getImmuneList(gid),
    settings: { sbkMin: min, sbkMax: max },
  };
}
