import { Message } from "discord.js";
import { Player } from "lavalink-client";
import { FIXED_VOLUME } from "../misc/constants";
import { getLavalink } from "../misc/trackUtils";

export async function enforceFixedVolume(
  player: Player,
  context: string,
): Promise<void> {
  try {
    await player.setVolume(FIXED_VOLUME, true);
  } catch (error) {
    console.warn(`[music] setVolume error (${context})`, error);
  }
}

export async function getOrCreatePlayer(
  message: Message,
  voiceChannelId: string,
): Promise<Player> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) {
    throw new Error("Lavalink is not ready for this message");
  }

  let player = lavalink.players.get(guildId);
  if (!player) {
    player = lavalink.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId: message.channelId,
      selfDeaf: true,
      selfMute: false,
      volume: FIXED_VOLUME,
    });
    await player.connect();
  } else {
    if (player.voiceChannelId !== voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId });
    }
    if (!player.connected) {
      await player.connect();
    }
  }

  await enforceFixedVolume(player, "player-connection");
  return player;
}

export async function waitForVoiceConnection(
  player: Player,
  timeoutMs = 15_000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (player.connected) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return Boolean(player.connected);
}
