import {
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  AudioPlayer,
  VoiceConnection,
  demuxProbe,
} from "@discordjs/voice";
import * as playdl from "play-dl";

// （任意）YouTube クッキー
if (process.env.YOUTUBE_COOKIE) {
  playdl.setToken({ youtube: { cookie: process.env.YOUTUBE_COOKIE! } });
}

type GuildAudio = { conn: VoiceConnection; player: AudioPlayer };
const sessions = new Map<string, GuildAudio>();

export async function handleMp(interaction: ChatInputCommandInteraction) {
  // まずACK（古い/二重なら抜ける）
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch (e: any) {
    if (e?.code === 10062) return;
    throw e;
  }

  if (!interaction.inGuild()) {
    await interaction.editReply("サーバー内で使ってね。");
    return;
  }

  const member = interaction.member as GuildMember;
  const vc = member.voice?.channel;
  if (!vc || !vc.isVoiceBased()) {
    await interaction.editReply("まずボイスチャンネルに参加してください。");
    return;
  }

  // ✅ URL を取得（必須）。空なら即エラー
  let raw = interaction.options.getString("url", true).trim();
  if (!raw) {
    await interaction.editReply("URL を指定してください。");
    return;
  }

  // 音量
  const volRaw = interaction.options.getInteger("vol") ?? 100;
  const vol = Math.max(1, Math.min(200, volRaw));

  try {
    // 既存 or 新規接続
    let entry = sessions.get(interaction.guildId!);
    if (!entry) {
      const conn = joinVoiceChannel({
        channelId: vc.id,
        guildId: vc.guild.id,
        adapterCreator: vc.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      await entersState(conn, VoiceConnectionStatus.Ready, 40_000);
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
      });
      conn.subscribe(player);
      entry = { conn, player };
      sessions.set(interaction.guildId!, entry);

      entry.conn.on(VoiceConnectionStatus.Disconnected, () => {
        try { entry?.conn.destroy(); } catch {}
        sessions.delete(interaction.guildId!);
      });
      entry.player.on("error", (e) => console.error("[player error]", e));
    }

    // ✅ URL でなければ検索にフォールバック
    const isProbablyUrl = /^https?:\/\//i.test(raw);
    if (!isProbablyUrl) {
      const results = await playdl.search(raw, { limit: 1 });
      if (!results.length) {
        await interaction.editReply("見つかりませんでした。別のキーワード/URLで試してください。");
        return;
      }
      raw = results[0].url;
    }

    // URL 妥当性チェック（ここで throw すれば「Invalid URL」は解決）
    new URL(raw);

    // 音源取得
    const s = await playdl.stream(raw);
    const probed = await demuxProbe(s.stream);
    const resource = createAudioResource(probed.stream, {
      inputType: probed.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(vol / 100);

    // 再生
    entry.player.play(resource);

    // タイトル取得（失敗時はURL）
    const title =
      (await playdl
        .video_basic_info(raw)
        .then((v) => v.video_details?.title)
        .catch(() => null)) ?? raw;

    await interaction.editReply(`▶️ 再生開始: **${title}**（音量 ${vol}%）`);

    // 放置防止：停止後 2分で退出
    const onIdle = () => {
      const t = setTimeout(() => {
        try { entry?.conn.destroy(); } catch {}
        sessions.delete(interaction.guildId!);
      }, 120_000);
      entry?.player.once(AudioPlayerStatus.Playing, () => clearTimeout(t));
    };
    entry.player.once(AudioPlayerStatus.Idle, onIdle);
  } catch (e: any) {
    console.error("[/mp error]", e);
    const msg =
      e?.code === "ERR_INVALID_URL"
        ? "URL が不正です。`https://` から始まるURLを指定するか、キーワードで検索してください。"
        : e?.message
        ? `エラー: ${e.message}`
        : "再生に失敗しました。";
    if (interaction.deferred) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}
