import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
} from "discord.js";
import { getRuntimeConfig } from "./config/runtime";
import { handleChatInputInteraction } from "./discord/interactionRouter";
import { getMaintenanceEnabled } from "./data";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink, waitForLavalinkReady } from "./lavalink";
import { handleMusicMessage } from "./music";
import { recoverPlaybackWithYtDlp } from "./music/playbackRecovery";

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

startFileServer();

const client = initLavalink(
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  }),
);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);

  client.lavalink.nodeManager.on("connect", (node) => {
    console.log(`[lavalink] node connected: ${node.id}`);
  });
  client.lavalink.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`[lavalink] node disconnected: ${node.id}`, reason);
  });
  client.lavalink.nodeManager.on("error", (node, error, payload) => {
    console.error(`[lavalink] node error: ${node.id}`, error, payload);
  });
  client.lavalink.on("trackError", (player, track, payload) => {
    console.error(
      `[music] track error guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      {
        message: payload?.exception?.message ?? "unknown",
        severity: payload?.exception?.severity ?? "unknown",
        cause: payload?.exception?.cause ?? "unknown",
      },
    );
    void recoverPlaybackWithYtDlp(client, player, track, payload);
  });
  client.lavalink.on("trackStuck", (player, track, payload) => {
    console.error(
      `[music] track stuck guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      payload,
    );
    void recoverPlaybackWithYtDlp(client, player, track, payload);
  });

  await waitForLavalinkReady();

  await client.lavalink.init({
    id: readyClient.user.id,
    username: runtimeConfig.lavalink.username,
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleChatInputInteraction(interaction);
});

void client.login(TOKEN);

client.on("messageCreate", async (message: Message) => {
  if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
  await handleMusicMessage(message);
});
