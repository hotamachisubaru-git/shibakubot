// src/index.ts
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  type Interaction, ChannelType,
  type TextChannel
} from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';

client.once(Events.ClientReady, b => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! 🏓');
    return;
  }

  if (interaction.commandName === 'sbk') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    // 実行者に返事
    await interaction.reply(`**${user.tag}** がしばかれました。\n 理由: ${reason}`);

    // 任意：ログ送信（ギルドのテキストチャンネルに限定）
    if (LOG_CHANNEL_ID && interaction.guild) {
      const ch = await interaction.guild.channels
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);

      if (ch && ch.type === ChannelType.GuildText) {
        await (ch as TextChannel).send(
          ` ${interaction.user.tag} → ${user.tag}\n 理由: ${reason}`
        );
      }
    }
  }
});

client.login(process.env.TOKEN);
