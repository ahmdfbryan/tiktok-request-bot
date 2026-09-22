import play from 'play-dl';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { takeNextForPlayback, finishPlaying, getCurrentlyPlaying } from './queue.js';

/**
 * Music player yang:
 * - Join satu voice channel tetap dan STAY di situ 24/7 (auto-reconnect kalau
 *   terputus), bahkan pas antrian kosong.
 * - Begitu ada request baru & player lagi idle, otomatis cari lagunya di
 *   YouTube lalu diputar.
 * - Begitu satu lagu selesai, otomatis lanjut ke request berikutnya.
 */
export function createMusicPlayer({ client, voiceChannelId, onQueueChange }) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  let connection = null;
  let currentRequest = null;
  let skipRequested = false;
  let starting = false;

  async function refresh() {
    try {
      await onQueueChange?.();
    } catch (err) {
      console.error('[music] Gagal refresh embed:', err.message);
    }
  }

  async function connectVoice() {
    const channel = await client.channels.fetch(voiceChannelId);
    if (!channel?.isVoiceBased?.()) {
      throw new Error(`Channel ${voiceChannelId} bukan voice channel yang valid`);
    }

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    connection.subscribe(player);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Bisa jadi cuma "pindah channel"/glitch sesaat — kasih kesempatan pulih sendiri.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        console.log('[music] Voice connection terputus, mencoba join ulang...');
        connection.destroy();
        setTimeout(() => connectVoice().catch((err) => console.error('[music] Gagal reconnect voice:', err.message)), 5_000);
      }
    });

    connection.on('error', (err) => {
      console.error('[music] Voice connection error:', err.message);
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[music] Bergabung ke voice channel "${channel.name}" (stay 24/7)`);
  }

  player.on(AudioPlayerStatus.Idle, () => {
    if (!currentRequest) return;
    const finished = currentRequest;
    currentRequest = null;
    finishPlaying(finished.id, skipRequested ? 'skipped' : 'played');
    skipRequested = false;
    refresh();
    playNext();
  });

  player.on('error', (err) => {
    console.error(`[music] Error saat memutar "${currentRequest?.title}":`, err.message);
    if (currentRequest) {
      finishPlaying(currentRequest.id, 'skipped');
      currentRequest = null;
      refresh();
    }
    playNext();
  });

  async function playNext() {
    if (starting || currentRequest) return; // sudah ada yang jalan / lagi proses start
    const next = takeNextForPlayback();
    if (!next) return; // antrian kosong, bot tetap stay di voice channel

    starting = true;
    currentRequest = next;
    await refresh();

    try {
      const results = await play.search(next.title, { limit: 1, source: { youtube: 'video' } });
      const video = results?.[0];
      if (!video) throw new Error('Lagu tidak ditemukan di YouTube');
      if (!video.url) throw new Error(`Hasil pencarian tidak punya URL valid (data: ${JSON.stringify(video).slice(0, 200)})`);

      const streamInfo = await play.stream(video.url);
      const resource = createAudioResource(streamInfo.stream, { inputType: streamInfo.type });

      player.play(resource);
      console.log(`[music] Memutar: "${next.title}" (req by ${next.tiktok_nickname}) → ${video.url}`);
    } catch (err) {
      console.error(`[music] Gagal memutar "${next.title}":`, err.message);
      console.error(err.stack);
      finishPlaying(next.id, 'skipped');
      currentRequest = null;
      await refresh();
      starting = false;
      playNext(); // coba lanjut ke request berikutnya biar antrian nggak macet
      return;
    }
    starting = false;
  }

  function notifyNewRequest() {
    playNext();
  }

  function skipCurrent() {
    if (!currentRequest) return false;
    skipRequested = true;
    player.stop(true);
    return true;
  }

  function pause() {
    return player.pause();
  }

  function resume() {
    return player.unpause();
  }

  function nowPlaying() {
    return currentRequest ?? getCurrentlyPlaying();
  }

  async function start() {
    await connectVoice();
    playNext();
  }

  return { start, notifyNewRequest, skipCurrent, pause, resume, nowPlaying };
}
