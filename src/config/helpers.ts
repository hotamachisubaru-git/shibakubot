import path from "node:path";
import {
  DEFAULT_FILE_HOST,
  DISABLED_TEXT_VALUES,
} from "./constants";
import { parseText } from "../utils/env";
import type { UrlBaseConfig } from "./types";

export function parseOptionalText(raw: string | undefined): string | undefined {
  const value = parseText(raw);
  if (!value || isDisabledTextValue(value)) {
    return undefined;
  }
  return value;
}

function isDisabledTextValue(value: string): boolean {
  return DISABLED_TEXT_VALUES.has(value.trim().toLowerCase());
}

export function parseModelAutoDetectNames(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  const value = parseText(raw);
  if (!value) {
    return [...fallback];
  }
  if (isDisabledTextValue(value)) {
    return [];
  }
  const values = parseText(raw)?.split(",").map((s) => s.trim()).filter(Boolean) || [];
  return values.length > 0 ? values : [...fallback];
}

export function parseModelAutoDetectNamesWithFallback(
  raw: string | undefined,
  fallback: readonly string[],
): readonly string[] {
  const value = parseText(raw);
  if (!value) {
    return [...fallback];
  }
  if (isDisabledTextValue(value)) {
    return [];
  }
  const values = parseText(raw)?.split(",").map((s) => s.trim()).filter(Boolean) || [];
  return values.length > 0 ? values : [...fallback];
}

export function resolveGuildValue(
  valuesByGuild: ReadonlyMap<string, string>,
  guildId: string | null | undefined,
  fallback: string | undefined,
): string | undefined {
  const normalizedGuildId = guildId?.trim();
  if (!normalizedGuildId) {
    return fallback;
  }
  return valuesByGuild.get(normalizedGuildId) ?? fallback;
}

function normalizeUrl(raw: string | undefined, fallback: string): URL {
  const value = parseText(raw);
  if (!value) return new URL(fallback);
  try {
    return new URL(value);
  } catch {
    return new URL(fallback);
  }
}

export function buildUploadUrlConfig(fileHost: string, filePort: number): UrlBaseConfig {
  const fallbackPublic = `http://localhost:${filePort}/uploads/`;
  const fallbackInternal = `http://127.0.0.1:${filePort}/uploads/`;
  const publicBase = normalizeUploadBaseUrl(
    process.env.UPLOAD_BASE_URL ?? process.env.FILE_BASE_URL,
    fallbackPublic,
  );
  const internalBase = normalizeUploadBaseUrl(
    process.env.UPLOAD_INTERNAL_URL,
    fallbackInternal,
  );
  if (!parseText(process.env.UPLOAD_INTERNAL_URL)) {
    const canUseFileHost =
      fileHost !== DEFAULT_FILE_HOST &&
      fileHost !== "localhost" &&
      fileHost !== "127.0.0.1" &&
      fileHost !== "0.0.0.0" &&
      fileHost !== "::";
    if (canUseFileHost) {
      return {
        publicBaseUrl: publicBase,
        internalBaseUrl: new URL(`http://${fileHost}:${filePort}/uploads/`),
      };
    }
  }
  return {
    publicBaseUrl: publicBase,
    internalBaseUrl: internalBase,
  };
}

function normalizeUploadBaseUrl(raw: string | undefined, fallback: string): URL {
  const url = normalizeUrl(raw, fallback);
  if (url.pathname === "/") {
    url.pathname = "/uploads/";
    return url;
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}
