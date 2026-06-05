// spotifyUtils.ts - リファクタリング済み
// 個別ファイルに分割済み:
//   spotifyUtils-types.ts  - 型定義と定数
//   spotifyUtils-parser.ts - URL/URIパース、HTMLメタ抽出
//   spotifyUtils-resolver.ts - 解決ロジック

export type {
  SpotifyEntityType,
  SpotifyTrackMetadata,
  SpotifyResolution,
  SpotifyReference,
} from "./spotifyUtils-types";

export {
  SPOTIFY_TYPES,
  SPOTIFY_FETCH_TIMEOUT_MS,
  SPOTIFY_TRACK_FETCH_CONCURRENCY,
  SPOTIFY_MAX_RESOLVED_TRACKS,
  SPOTIFY_USER_AGENT,
} from "./spotifyUtils-types";

export {
  looksLikeSpotifyInput,
} from "./spotifyUtils-parser";

export {
  resolveSpotifyInput,
  resolveSpotifyReference,
} from "./spotifyUtils-resolver";

export {
  extractMetaContent,
  parseSpotifyReferenceFromUrl,
  parseSpotifyReferenceFromUri,
  parseArtistFromTrackDescription,
  parseCollectionTrackCount,
  escapeRegExp,
  extractTrackUrlsFromCollectionHtml,
} from "./spotifyUtils-parser";

export type { SpotifyEntityType as SpotifyType } from "./spotifyUtils-types";
