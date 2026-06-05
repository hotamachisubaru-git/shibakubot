import { SPOTIFY_USER_AGENT, SPOTIFY_FETCH_TIMEOUT_MS, SPOTIFY_TRACK_FETCH_CONCURRENCY, SPOTIFY_MAX_RESOLVED_TRACKS } from "./spotifyUtils-types";
import type { SpotifyReference, SpotifyTrackMetadata, SpotifyResolution } from "./spotifyUtils-types";
import { parseSpotifyReferenceFromUri, parseSpotifyReferenceFromUrl, extractMetaContent, parseArtistFromTrackDescription, parseCollectionTrackCount, extractTrackUrlsFromCollectionHtml } from "./spotifyUtils-parser";

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

export async function resolveSpotifyReference(input: string): Promise<SpotifyReference | null> {
  return (
    parseSpotifyReferenceFromUri(input) ??
    parseSpotifyReferenceFromUrl(input) ??
    (await resolveSpotifyRedirect(input))
  );
}

export async function fetchSpotifyHtml(url: string): Promise<string> {
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

async function resolveSpotifyTrack(url: string): Promise<SpotifyTrackMetadata | null> {
  try {
    const html = await fetchSpotifyHtml(url);
    return parseSpotifyTrackMetadata(html, url);
  } catch {
    return null;
  }
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
