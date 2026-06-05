export type SpotifyEntityType = "track" | "album" | "playlist";

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

export type SpotifyReference = Readonly<{
  type: SpotifyEntityType;
  url: string;
}>;

export const SPOTIFY_TYPES = new Set<SpotifyEntityType>(["track", "album", "playlist"]);
export const SPOTIFY_FETCH_TIMEOUT_MS = 15_000;
export const SPOTIFY_TRACK_FETCH_CONCURRENCY = 6;
export const SPOTIFY_MAX_RESOLVED_TRACKS = 100;
export const SPOTIFY_USER_AGENT = "curl/8.0.1";
