import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const token = process.env.TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

if (!token || !clientId || !guildId) {
  console.error('❌ TOKEN / CLIENT_ID / GUILD_ID を .env に設定してください');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('疎通チェック'),

  new SlashCommandBuilder()
    .setName('sbk')
    .setDescription('しばく（ユーザー＋理由）')
    .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('理由').setRequired(true)),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('ユーザーがしばかれた回数を確認します')
    .addUserOption(o => o.setName('user').setDescription('確認するユーザー').setRequired(true)),

  // ★ 追加：ランキング
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('しばかれランキングを表示します')
    .addIntegerOption(o =>
      o.setName('limit')
       .setDescription('表示件数（3〜25）')
       .setMinValue(3)
       .setMaxValue(25)
       .setRequired(false)
    ),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('⏫ コマンド登録中...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ 登録完了');
  } catch (e) {
    console.error('❌ 登録失敗:', e);
  }
})();
