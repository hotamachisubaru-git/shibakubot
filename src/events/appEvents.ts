import { Events, Client, VoiceState } from "discord.js";
import { getMaintenanceEnabled, isIgnoredUser } from "../data";
import { handleMusicMessage } from "../music";
import { handleAutocompleteInteraction, handleChatInputInteraction } from "../discord/interactionRouter";

export function setupAppEventHandlers(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocompleteInteraction(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await handleChatInputInteraction(interaction);
  });

  client.on("messageCreate", async (message) => {
    if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
    if (message.guildId && isIgnoredUser(message.guildId, message.author.id)) return;
    await handleMusicMessage(message);
  });

  client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
    if (newState.id !== client.user?.id && oldState.id !== client.user?.id) return;

    const state = newState.id === client.user?.id ? newState : oldState;
    console.log(
      `[voice] bot state guild=${state.guild.id}`,
      {
        oldChannelId: oldState.channelId ?? null,
        newChannelId: newState.channelId ?? null,
        selfMute: newState.selfMute,
        selfDeaf: newState.selfDeaf,
        serverMute: newState.serverMute,
        serverDeaf: newState.serverDeaf,
        suppress: newState.suppress,
        streaming: newState.streaming,
        requestToSpeakTimestamp: newState.requestToSpeakTimestamp,
      },
    );
  });
}
