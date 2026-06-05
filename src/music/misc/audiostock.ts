export type AudiostockTrack = Readonly<{
  id: number;
  title: string;
  artist: string;
  previewUrl: string;
  pageUrl: string;
  durationText: string;
}>;

const SEARCH_URL = "https://audiostock.jp/bgm";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractTextContent(html: string, startTag: string, endTag: string): string {
  const startIndex = html.indexOf(startTag);
  if (startIndex === -1) return "";
  const contentStart = startIndex + startTag.length;
  const endIndex = html.indexOf(endTag, contentStart);
  if (endIndex === -1) return "";
  return html.slice(contentStart, endIndex).replace(/<[^>]+>/g, "").trim();
}

function parseDurationToMs(durationText: string): number {
  const parts = durationText.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return (minutes * 60 + seconds) * 1000;
    }
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return (hours * 3600 + minutes * 60 + seconds) * 1000;
    }
  }
  return 0;
}

async function resolvePreviewUrl(playUrl: string): Promise<string | null> {
  try {
    const response = await fetch(playUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (location) return location;
    // 直接 body が返ってくる場合もある
    if (response.ok && response.headers.get("content-type")?.startsWith("audio/")) {
      return playUrl;
    }
    return null;
  } catch {
    return null;
  }
}

export async function searchAudiostock(
  keyword: string,
  limit: number,
): Promise<AudiostockTrack[]> {
  const params = new URLSearchParams();
  params.set("audio_search[keywords]", keyword);

  let html: string;
  try {
    const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      console.warn("[audiostock] search failed:", response.status, response.statusText);
      return [];
    }
    html = await response.text();
  } catch (error) {
    console.warn("[audiostock] search error:", error);
    return [];
  }

  const tracks: AudiostockTrack[] = [];
  // 各作品ブロックは <div class="player-audio-inner player-item ..."> で囲まれている
  const itemRegex =
    /<div class="player-audio-inner player-item[^"]*">[\s\S]*?<\/div>\s*<\/div>/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null && tracks.length < limit) {
    const block = match[0];

    // data-audio_url
    const audioUrlMatch = block.match(/data-audio_url="([^"]+)"/);
    if (!audioUrlMatch) continue;
    const playUrl = audioUrlMatch[1];

    // data-logging_audio_id
    const idMatch = block.match(/data-logging_audio_id="(\d+)"/);
    const id = idMatch ? Number.parseInt(idMatch[1], 10) : 0;

    // タイトル: .player-audio-info-main > a
    const titleMatch = block.match(
      /<div class="player-audio-info-main"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/,
    );
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // アーティスト: .player-audio-user-name
    const artistMatch = block.match(
      /<a class="user-icon-text player-audio-user-name"[^>]*>[\s\S]*?>([\s\S]*?)<\/a>/,
    );
    const artist = artistMatch
      ? artistMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    // 長さ: .time_label
    const timeMatch = block.match(
      /<p class="player-audio-time time_label"[^>]*>[\s\S]*?<span>[\s\S]*?<\/span>\s*([\d:]+)\s*<\/p>/,
    );
    const durationText = timeMatch ? timeMatch[1].trim() : "";

    if (!id || !title) continue;

    const previewUrl = await resolvePreviewUrl(playUrl);
    if (!previewUrl) continue;

    tracks.push({
      id,
      title,
      artist,
      previewUrl,
      pageUrl: `https://audiostock.jp/audio/${id}`,
      durationText,
    });
  }

  return tracks;
}

export function buildAudiostockTrackInfo(
  track: AudiostockTrack,
): {
  title: string;
  author: string;
  uri: string;
  artworkUrl: string | null;
  durationMs: number;
} {
  return {
    title: track.title,
    author: track.artist || "Audiostock",
    uri: track.previewUrl,
    artworkUrl: null,
    durationMs: parseDurationToMs(track.durationText),
  };
}
