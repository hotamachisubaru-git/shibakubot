// src/deploy-commands.ts
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const token   = process.env.TOKEN!;
const clientId= process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('疎通確認'),

  new SlashCommandBuilder()
    .setName('sbk')
    .setDescription('指定したユーザーをしばく')
    .addUserOption(o => o.setName('user').setDescription('相手').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('理由').setRequired(true))
    .addIntegerOption(o => o.setName('count').setDescription('回数（省略時1）')),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('指定ユーザーのしばかれ回数を見る')
    .addUserOption(o => o.setName('user').setDescription('対象').setRequired(true)),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('しばきランキングを表示'),

  // ★ 表示制限を外す（誰でも見える）。実行時の権限チェックは index.ts 側で継続。
  new SlashCommandBuilder()
    .setName('control')
    .setDescription('指定ユーザーのしばかれ回数を調整（指定値に変更）')
    .addUserOption(o => o.setName('user').setDescription('対象ユーザー').setRequired(true))
    .addIntegerOption(o =>
      o.setName('count')
       .setDescription('設定する回数（0以上）')
       .setRequired(true)
       .setMinValue(0)
    )
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) ← 削除
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('members')
    .setDescription('全メンバー（BOT除外）のしばかれ回数一覧'),
].map(c => c.toJSON());

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
