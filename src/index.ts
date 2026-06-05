import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { getRuntimeConfig } from "./config/runtime";
import { registerConsoleCommands } from "./consoleCommands/index.js";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink, waitForLavalinkReady } from "./lavalink";
import { setupLavalinkEventHandlers } from "./events/lavalinkHandlers";
import { setupAppEventHandlers } from "./events/appEvents";
import { ensureSingleInstance } from "./utils/singleInstance";

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;
export const nodeStatsLogCounters = new Map<string, number>();

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

ensureSingleInstance();
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
registerConsoleCommands(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);
  setupLavalinkEventHandlers(client);
  await waitForLavalinkReady();
  await client.lavalink.init({
    id: readyClient.user.id,
    username: runtimeConfig.lavalink.username,
  });
  setupAppEventHandlers(client);
});

void client.login(TOKEN);
