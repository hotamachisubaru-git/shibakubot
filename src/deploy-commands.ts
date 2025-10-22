// src/deploy-commands.ts
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const TOKEN = process.env.TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const GUILD_ID = process.env.GUILD_ID!;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ TOKEN / CLIENT_ID / GUILD_ID を .env に設定してください');
  process.exit(1);
}

// ここでコマンドを列挙（読みやすさ重視）
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('疎通チェック'),

  new SlashCommandBuilder()
    .setName('sbk')
    .setDescription('しばく（ユーザー＋理由）')
    .addUserOption(opt => opt
      .setName('user')
      .setDescription('対象ユーザー')
      .setRequired(true))
    .addStringOption(opt => opt
      .setName('reason')
      .setDescription('理由')
      .setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏫ コマンド登録中...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ 登録完了');
  } catch (err) {
    console.error('❌ 登録失敗:', err);
  }
})();
