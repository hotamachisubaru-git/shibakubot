import { LavalinkManager, Player } from "lavalink-client";
import { clearAutoStop, refreshAutoStopForPlayer } from "./state-autoStop";
import { replayMusicRepeatIfNeeded, clearRepeatTimer, syncMusicRepeatForPlayer } from "./state-repeat";

const hookedManagers = new WeakSet<LavalinkManager<Player>>();

export function hookManagerAutoStopOnce(lavalink: LavalinkManager<Player>): void {
  if (hookedManagers.has(lavalink)) return;
  hookedManagers.add(lavalink);

  lavalink.on("playerCreate", (player) => {
    syncMusicRepeatForPlayer(player);
  });

  lavalink.on("trackStart", (player) => {
    clearRepeatTimer(player.guildId);
    clearAutoStop(player.guildId);
    syncMusicRepeatForPlayer(player);
    refreshAutoStopForPlayer(player);
  });

  lavalink.on("queueEnd", (player, track, payload) => {
    clearAutoStop(player.guildId);
    replayMusicRepeatIfNeeded(player, track, payload);
  });

  lavalink.on("playerDestroy", (player) => {
    clearAutoStop(player.guildId);
    clearRepeatTimer(player.guildId);
  });

  lavalink.on("trackEnd", (player, track, payload) => {
    clearAutoStop(player.guildId);
    replayMusicRepeatIfNeeded(player, track, payload);
  });
}
