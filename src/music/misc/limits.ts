import { getMusicMaxTrackMinutes } from "../../data";

export type MusicPlaybackLimit = Readonly<{
  maxTrackMinutes: number;
  maxTrackMs: number;
}>;

export function getGuildMusicPlaybackLimit(
  guildId: string,
): MusicPlaybackLimit {
  const maxTrackMinutes = getMusicMaxTrackMinutes(guildId);
  return {
    maxTrackMinutes,
    maxTrackMs: maxTrackMinutes * 60_000,
  };
}
