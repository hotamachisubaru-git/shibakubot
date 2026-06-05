import type { PendingTrack } from "../misc/trackUtils";

export type PendingSearch = {
  tracks: PendingTrack[];
  query: string;
  expiresAt: number;
};

export type RetrySelectionContext = {
  requesterId: string;
  channelId: string;
  query: string;
  remainingTracks: PendingTrack[];
};
