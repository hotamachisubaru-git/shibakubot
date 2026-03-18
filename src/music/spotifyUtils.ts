type SpotifyEntityType = "track" | "album" | "playlist";

export type SpotifyTrackMetadata = Readonly<{
  title: string;
  artist: string;
  spotifyUrl: string;
  artworkUrl: string | null;
  durationMs: number;
}>;

export type SpotifyResolution = Readonly<{
  type: SpotifyEntityType;
  sourceUrl: string;
  title: string;
  tracks: readonly SpotifyTrackMetadata[];
  truncated: boolean;
}>;

const SPOTIFY_TYPES = new Set<SpotifyEntityType>(["track", "album", "playlist"]);
const SPOTIFY_FETCH_TIMEOUT_MS = 15_000;
const SPOTIFY_TRACK_FETCH_CONCURRENCY = 6;
const SPOTIFY_MAX_RESOLVED_TRACKS = 100;
const SPOTIFY_USER_AGENT = "curl/8.0.1";

type SpotifyReference = Readonly<{
  type: SpotifyEntityType;
  url: string;
}>;

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

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html: string, key: string): string | null {
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

function parseArtistFromTrackDescription(
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

function parseCollectionTrackCount(description: string | null): number | null {
  if (!description) return null;

  const match = description.match(/\b(\d+)\s+(?:items|songs)\b/i);
  if (!match) return null;

  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function parseSpotifyReferenceFromUrl(urlText: string): SpotifyReference | null {
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

function parseSpotifyReferenceFromUri(input: string): SpotifyReference | null {
  const match = input.trim().match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)$/i);
  if (!match) return null;

  const type = match[1].toLowerCase() as SpotifyEntityType;
  const id = match[2];
  return {
    type,
    url: `https://open.spotify.com/${type}/${id}`,
  };
}

async function resolveSpotifyRedirect(input: string): Promise<SpotifyReference | null> {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "spotify.link" && host !== "spoti.fi") {
      return null;
    }

    const response = await fetch(input, {
      headers: {
        "user-agent": SPOTIFY_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(SPOTIFY_FETCH_TIMEOUT_MS),
    });

    return parseSpotifyReferenceFromUrl(response.url);
  } catch {
    return null;
  }
}

async function resolveSpotifyReference(input: string): Promise<SpotifyReference | null> {
  return (
    parseSpotifyReferenceFromUri(input) ??
    parseSpotifyReferenceFromUrl(input) ??
    (await resolveSpotifyRedirect(input))
  );
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

async function fetchSpotifyHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": SPOTIFY_USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(SPOTIFY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`spotify fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseSpotifyTrackMetadata(
  html: string,
  spotifyUrl: string,
): SpotifyTrackMetadata | null {
  const title = extractMetaContent(html, "og:title");
  if (!title) return null;

  const description =
    extractMetaContent(html, "og:description") ??
    extractMetaContent(html, "description");
  const artist =
    parseArtistFromTrackDescription(description, title) ??
    extractMetaContent(html, "music:musician_description") ??
    "Spotify";
  const artworkUrl = extractMetaContent(html, "og:image");
  const durationSec = Number(extractMetaContent(html, "music:duration") ?? "0");

  return {
    title,
    artist,
    spotifyUrl,
    artworkUrl,
    durationMs:
      Number.isFinite(durationSec) && durationSec > 0
        ? Math.round(durationSec * 1000)
        : 0,
  };
}

function extractTrackUrlsFromCollectionHtml(html: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const pattern =
    /<meta[^>]+(?:property|name)=["']music:song["'][^>]+content=["'](https:\/\/open\.spotify\.com\/track\/[^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const value = match[1]?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    results.push(value);
  }

  return results;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function resolveSpotifyTrack(url: string): Promise<SpotifyTrackMetadata | null> {
  try {
    const html = await fetchSpotifyHtml(url);
    return parseSpotifyTrackMetadata(html, url);
  } catch {
    return null;
  }
}

async function resolveSpotifyCollection(
  reference: SpotifyReference,
): Promise<SpotifyResolution | null> {
  const html = await fetchSpotifyHtml(reference.url);
  const title = extractMetaContent(html, "og:title") ?? "Spotify collection";
  const expectedTrackCount = parseCollectionTrackCount(
    extractMetaContent(html, "description") ??
      extractMetaContent(html, "og:description"),
  );
  const trackUrls = extractTrackUrlsFromCollectionHtml(html);
  if (!trackUrls.length) return null;

  const truncatedByLimit = trackUrls.length > SPOTIFY_MAX_RESOLVED_TRACKS;
  const targets = trackUrls.slice(0, SPOTIFY_MAX_RESOLVED_TRACKS);
  const tracks = await mapWithConcurrency(
    targets,
    SPOTIFY_TRACK_FETCH_CONCURRENCY,
    async (trackUrl) => resolveSpotifyTrack(trackUrl),
  );
  const resolvedTracks = tracks.filter(
    (track): track is SpotifyTrackMetadata => Boolean(track),
  );
  if (!resolvedTracks.length) return null;

  return {
    type: reference.type,
    sourceUrl: reference.url,
    title,
    tracks: resolvedTracks,
    truncated:
      truncatedByLimit ||
      resolvedTracks.length < trackUrls.length ||
      (expectedTrackCount !== null && resolvedTracks.length < expectedTrackCount),
  };
}

export async function resolveSpotifyInput(
  input: string,
): Promise<SpotifyResolution | null> {
  const reference = await resolveSpotifyReference(input);
  if (!reference) return null;

  if (reference.type === "track") {
    const track = await resolveSpotifyTrack(reference.url);
    if (!track) return null;

    return {
      type: "track",
      sourceUrl: reference.url,
      title: track.title,
      tracks: [track],
      truncated: false,
    };
  }

  return resolveSpotifyCollection(reference);
}
