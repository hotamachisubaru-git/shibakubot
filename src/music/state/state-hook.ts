import { LavalinkManager, Player, type TrackEndEvent, type TrackStuckEvent, type TrackExceptionEvent } from "lavalink-client";
import { clearAutoStop } from "./state-autoStop";
import { reapplyMusicRepeatOnQueueEnd, clearRepeatTimer } from "./state-repeat";
import type { PendingTrack } from "../misc/trackUtils";

const hookedManagers = new WeakSet<LavalinkManager<Player>>();

export function hookManagerAutoStopOnce(lavalink: LavalinkManager<Player>): void {
  if (hookedManagers.has(lavalink)) return;
  hookedManagers.add(lavalink);

  lavalink.on("trackStart", (player, track) => {
    clearAutoStop(player.guildId);
    if (track) {
      // trackStart で autoStop をリセットし、後続の armAutoStopForTrack で再設定される
    }
  });

  lavalink.on("queueEnd", (player, track, payload) => {
    clearAutoStop(player.guildId);
    reapplyMusicRepeatOnQueueEnd(player, track, payload);
  });

  lavalink.on("playerDestroy", (player) => {
    clearAutoStop(player.guildId);
    clearRepeatTimer(player.guildId);
  });

  lavalink.on("trackEnd", (player) => {
    clearAutoStop(player.guildId);
  });
}
