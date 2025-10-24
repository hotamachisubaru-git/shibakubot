import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const token = process.env.TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('疎通できるか確認を行います。'),

  new SlashCommandBuilder()
    .setName('sbk')
    .setDescription('指定したユーザーをしばく。')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('しばく相手')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('しばく理由')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('count')
        .setDescription('しばく回数（省略時は1）')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('指定したユーザーが何回しばかれたか確認する。')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('確認対象')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('しばかれランキングを表示する。'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('⏫ コマンド登録中...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ 登録完了');
  } catch (err) {
    console.error('❌ 登録失敗:', err);
  }
})();
