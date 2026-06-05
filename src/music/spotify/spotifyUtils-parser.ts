import { SPOTIFY_TYPES } from "./spotifyUtils-types";
import type { SpotifyEntityType, SpotifyReference } from "./spotifyUtils-types";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#x60;/gi, "`");
}

export function extractMetaContent(html: string, key: string): string | null {
  const escapedKey = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const content = match?.[1]?.trim();
    if (content) return decodeHtmlEntities(content);
  }

  return null;
}

export function parseArtistFromTrackDescription(
  description: string | null,
  trackTitle: string,
): string | null {
  if (!description) return null;

  const parts = description
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  if (parts[1] === trackTitle) {
    return parts[0] || null;
  }

  return parts[0] || null;
}

export function parseCollectionTrackCount(description: string | null): number | null {
  if (!description) return null;

  const match = description.match(/\b(\d+)\s+(?:items|songs)\b/i);
  if (!match) return null;

  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

export function parseSpotifyReferenceFromUrl(urlText: string): SpotifyReference | null {
  try {
    const url = new URL(urlText);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "open.spotify.com") {
      return null;
    }

    const segments = url.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (!segments.length) return null;

    const startIndex = segments[0].startsWith("intl-") ? 1 : 0;
    for (let index = startIndex; index < segments.length - 1; index += 1) {
      const typeCandidate = segments[index];
      if (!SPOTIFY_TYPES.has(typeCandidate as SpotifyEntityType)) continue;

      const id = segments[index + 1];
      if (!id) return null;

      const type = typeCandidate as SpotifyEntityType;
      return {
        type,
        url: `https://open.spotify.com/${type}/${id}`,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function parseSpotifyReferenceFromUri(input: string): SpotifyReference | null {
  const match = input.trim().match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)$/i);
  if (!match) return null;

  const type = match[1].toLowerCase() as SpotifyEntityType;
  const id = match[2];
  return {
    type,
    url: `https://open.spotify.com/${type}/${id}`,
  };
}

export function looksLikeSpotifyInput(input: string): boolean {
  const value = input.trim();
  return (
    /^spotify:(track|album|playlist):/i.test(value) ||
    /^https?:\/\/(?:www\.)?(?:open\.spotify\.com|spotify\.link|spoti\.fi)\//i.test(
      value,
    )
  );
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractTrackUrlsFromCollectionHtml(html: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const pattern =
    /<meta[^>]+(?:property|name)=["']music:song["'][^>]+content=["'](https:\/\/open\.spotify\.com\/track\/[^"']+)[["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    results.push(value);
  }

  return results;
}
