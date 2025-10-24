// src/index.ts
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Events,
  type Interaction, ChannelType, type TextChannel
} from 'discord.js';
import { loadData, addCount } from './data';
import { handleTop } from './commands/top';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';

client.once(Events.ClientReady, b => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /ping
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: '測定中...' });
    const sent = await interaction.fetchReply();
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`応答速度: **${ping}ms**`);
    return;
  }

  // 最新データ
  const data = loadData();

  // /sbk
  if (interaction.commandName === 'sbk') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const countArg = interaction.options.getInteger('count') ?? 1;

    const nextCount = addCount(data, user.id, countArg);

    await interaction.reply(`**${user.tag}** が ${countArg} 回 しばかれました！（累計 ${nextCount} 回）\n理由: ${reason}`);

    if (LOG_CHANNEL_ID && interaction.guild) {
      const ch = await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await (ch as TextChannel).send(
          `${interaction.user.tag} → ${user.tag}\n理由: ${reason}\n今回: ${countArg} 回\n累計: ${nextCount} 回`
        );
      }
    }
    return;
  }

  // /check
  if (interaction.commandName === 'check') {
    const user = interaction.options.getUser('user', true);
    const count = data[user.id] ?? 0;
    await interaction.reply(`**${user.tag}** は今までに ${count} 回 しばかれました。`);
    return;
  }

  // /top（別ファイルに委譲）
  if (interaction.commandName === 'top') {
    await handleTop(interaction);
    return;
  }
});

client.login(process.env.TOKEN);
