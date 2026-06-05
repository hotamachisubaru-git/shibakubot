import { EmbedBuilder, Message } from "discord.js";
import { getLavalink, getTrackDurationMs, getTrackTitle, type PendingTrack } from "../misc/trackUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_PLAYING_BAR_SEGMENTS = 16;
const NOW_PLAYING_COLOR = 0x57f287;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatNowPlayingTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function buildNowPlayingBar(
  positionMs: number,
  durationMs: number,
  paused: boolean,
): string {
  const stateIcon = paused ? "⏸" : "▶";
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return `${stateIcon} ${"▱".repeat(NOW_PLAYING_BAR_SEGMENTS)}`;
  }

  const ratio = clamp(positionMs / durationMs, 0, 1);
  const markerIndex = Math.floor(ratio * (NOW_PLAYING_BAR_SEGMENTS - 1));
  const bar = Array.from({ length: NOW_PLAYING_BAR_SEGMENTS }, (_, index) => {
    if (index === markerIndex) return "🔘";
    return index < markerIndex ? "▰" : "▱";
  }).join("");

  return `${stateIcon} ${bar}`;
}

function pickNowPlayingArtwork(track: PendingTrack): string | null {
  return track.info.artworkUrl ?? track.pluginInfo.artworkUrl ?? null;
}

function getNowPlayingSourceLabel(track: PendingTrack): string {
  const author = track.info.author?.trim();
  if (author) return author;
  const sourceName = track.info.sourceName?.trim();
  return sourceName || "不明";
}

// ---------------------------------------------------------------------------
// handleNowPlaying
// ---------------------------------------------------------------------------

export async function handleNowPlaying(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  const current = player?.queue.current;
  if (!player || !current) {
    await message.reply("📭 再生中の曲はありません。");
    return;
  }

  const durationMs = getTrackDurationMs(current);
  const hasDuration = Number.isFinite(durationMs) && durationMs > 0;
  const currentPositionMs = hasDuration
    ? clamp(player.position, 0, durationMs)
    : Math.max(player.position, 0);
  const title = getTrackTitle(current);
  const sourceLabel = getNowPlayingSourceLabel(current);
  const artworkUrl = pickNowPlayingArtwork(current);
  const trackUrlRaw = current.info.uri?.trim();
  const trackUrl = trackUrlRaw && isHttpUrl(trackUrlRaw) ? trackUrlRaw : null;
  const userDisplayName = message.member?.displayName ?? message.author.username;

  const progressLine = buildNowPlayingBar(
    currentPositionMs,
    hasDuration ? durationMs : 0,
    player.paused,
  );
  const durationLabel = hasDuration ? formatNowPlayingTime(durationMs) : "LIVE";
  const timeLine = `\`${formatNowPlayingTime(currentPositionMs)}/${durationLabel}\``;

  const embed = new EmbedBuilder()
    .setColor(NOW_PLAYING_COLOR)
    .setAuthor({
      name: userDisplayName,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTitle(truncateText(title, 256))
    .setDescription(`${progressLine}\n${timeLine}\n出典: ${sourceLabel}`);

  if (trackUrl) {
    embed.setURL(trackUrl);
  }
  if (artworkUrl) {
    embed.setThumbnail(artworkUrl);
  }
  if (player.paused) {
    embed.setFooter({ text: "一時停止中" });
  }

  await message.reply({ embeds: [embed] });
}
