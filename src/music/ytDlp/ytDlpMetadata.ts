export type YtDlpInfoEntry = Readonly<Record<string, unknown>>;

export interface DownloadedTrackMetadata {
  title: string;
  uploader: string | null;
  sourceUrl: string;
  artworkUrl: string | null;
  extractor: string | null;
  durationMs: number | null;
  isLive: boolean;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickPrimaryEntry(info: YtDlpInfoEntry): YtDlpInfoEntry {
  const entries = Array.isArray(info.entries)
    ? info.entries.filter(
        (entry): entry is YtDlpInfoEntry =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  return entries[0] ?? info;
}

export function extractMetadata(info: YtDlpInfoEntry, inputUrl: string): DownloadedTrackMetadata {
  const primary = pickPrimaryEntry(info);
  const title =
    toText(primary.fulltitle) ??
    toText(primary.title) ??
    toText(info.title) ??
    "remote media";
  const uploader =
    toText(primary.channel) ??
    toText(primary.uploader) ??
    toText(primary.creator) ??
    toText(info.channel) ??
    toText(info.uploader) ??
    null;
  const sourceUrl =
    toText(primary.webpage_url) ??
    toText(primary.original_url) ??
    toText(info.webpage_url) ??
    inputUrl;
  const artworkUrl =
    toText(primary.thumbnail) ?? toText(info.thumbnail) ?? null;
  const extractor =
    toText(primary.extractor_key) ??
    toText(primary.extractor) ??
    toText(info.extractor_key) ??
    toText(info.extractor) ??
    null;
  const durationSeconds =
    toNullableNumber(primary.duration) ?? toNullableNumber(info.duration);
  const liveStatus =
    toText(primary.live_status)?.toLowerCase() ??
    toText(info.live_status)?.toLowerCase() ??
    "";
  const isLive =
    primary.is_live === true ||
    info.is_live === true ||
    liveStatus === "is_live" ||
    liveStatus === "is_upcoming" ||
    liveStatus === "post_live";

  return {
    title,
    uploader,
    sourceUrl,
    artworkUrl,
    extractor,
    durationMs:
      durationSeconds !== null ? Math.max(0, Math.round(durationSeconds * 1000)) : null,
    isLive,
  };
}
