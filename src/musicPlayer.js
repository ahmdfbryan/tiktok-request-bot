import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { takeNextForPlayback, finishPlaying, getCurrentlyPlaying } from './queue.js';
import { searchVideo, getAudioStream, getAutoplayNext, checkAvailable } from './youtube.js';
import { getSetting, setSetting } from './settings.js';

const AUTOPLAY_SETTING_KEY = 'autoplay_enabled';
const MAX_AUTOPLAY_HISTORY = 15;

/**
 * Music player yang:
 * - Join satu voice channel tetap dan STAY di situ 24/7 (auto-reconnect kalau
 *   terputus), bahkan pas antrian kosong.
 * - Begitu ada request baru & player lagi idle, otomatis cari lagunya di
 *   YouTube (lewat yt-dlp) lalu diputar.
 * - Begitu satu lagu selesai, otomatis lanjut ke request berikutnya.
 * - Kalau autoplay aktif & antrian request kosong, otomatis lanjut mutar lagu
 *   "mirip" (mode radio/mix YouTube) biar voice channel nggak sepi.
 */
export function createMusicPlayer({ client, voiceChannelId, onQueueChange }) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  let connection = null;
  let currentRequest = null; // request asli dari store, ATAU objek "virtual" autoplay (tidak punya id)
  let currentProcess = null;
  let skipRequested = false;
  let starting = false;

  let lastPlayedVideoId = null;
  const recentAutoplayIds = [];

  function isAutoplayEnabled() {
    return getSetting(AUTOPLAY_SETTING_KEY) === 'on';
  }

  function setAutoplay(enabled) {
    setSetting(AUTOPLAY_SETTING_KEY, enabled ? 'on' : 'off');
    if (enabled) notifyNewRequest(); // kalau lagi nganggur, langsung coba mulai autoplay
  }

  function rememberAutoplayId(id) {
    recentAutoplayIds.push(id);
    while (recentAutoplayIds.length > MAX_AUTOPLAY_HISTORY) recentAutoplayIds.shift();
  }

  async function refresh() {
    try {
      await onQueueChange?.();
    } catch (err) {
      console.error('[music] Gagal refresh embed:', err.message);
    }
  }

  function killCurrentProcess() {
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill('SIGKILL');
    }
    currentProcess = null;
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
    killCurrentProcess();
    const finished = currentRequest;
    currentRequest = null;
    if (finished.id != null) {
      // request asli dari antrian TikTok
      finishPlaying(finished.id, skipRequested ? 'skipped' : 'played');
    }
    skipRequested = false;
    refresh();
    playNext();
  });

  player.on('error', (err) => {
    console.error(`[music] Error saat memutar "${currentRequest?.title}":`, err.message);
    killCurrentProcess();
    if (currentRequest) {
      if (currentRequest.id != null) finishPlaying(currentRequest.id, 'skipped');
      currentRequest = null;
      refresh();
    }
    playNext();
  });

  function playResource(video) {
    const { stream, process: ytProcess } = getAudioStream(video.url);
    currentProcess = ytProcess;

    // StreamType.Arbitrary → biar @discordjs/voice otomatis deteksi format
    // (biasanya webm/opus langsung dari yt-dlp, kalau bukan baru transcode
    // pakai ffmpeg di belakang layar).
    const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
    player.play(resource);
    lastPlayedVideoId = video.id || lastPlayedVideoId;
  }

  async function tryPlayAutoplay() {
    const pick = await getAutoplayNext(lastPlayedVideoId, recentAutoplayIds);
    if (!pick) {
      console.log('[music] Autoplay aktif tapi nggak nemu lagu lanjutan, bot diam dulu.');
      starting = false;
      return;
    }

    currentRequest = {
      id: null,
      title: pick.title,
      tiktok_nickname: '🔀 Autoplay',
      status: 'playing',
    };
    await refresh();

    try {
      playResource(pick);
      rememberAutoplayId(pick.id);
      console.log(`[music] Autoplay memutar: "${pick.title}" → ${pick.url}`);
    } catch (err) {
      console.error(`[music] Autoplay gagal memutar "${pick.title}":`, err.message);
      currentRequest = null;
      await refresh();
      starting = false;
      playNext();
      return;
    }
    starting = false;
  }

  async function playNext() {
    if (starting || currentRequest) return; // sudah ada yang jalan / lagi proses start
    const next = takeNextForPlayback();

    if (!next) {
      // Antrian request kosong. Kalau autoplay nyala, coba lanjut mode radio.
      if (isAutoplayEnabled() && lastPlayedVideoId) {
        starting = true;
        await tryPlayAutoplay();
      }
      return; // kalau autoplay mati / belum ada lagu sebelumnya, bot tetap stay diam
    }

    starting = true;
    currentRequest = next;
    await refresh();

    try {
      const video = await searchVideo(next.title);
      if (!video) throw new Error('Lagu tidak ditemukan di YouTube');

      playResource(video);
      console.log(`[music] Memutar: "${next.title}" (req by ${next.tiktok_nickname}) → ${video.url}`);
    } catch (err) {
      console.error(`[music] Gagal memutar "${next.title}":`, err.message);
      killCurrentProcess();
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
    killCurrentProcess();
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
    const check = await checkAvailable();
    if (!check.ok) {
      console.error('[music] yt-dlp tidak ditemukan/tidak bisa dijalankan! Install dulu: pip install -U yt-dlp');
      console.error('[music] Fitur play musik dimatikan, tapi bot tetap jalan buat antrian teks.');
      return;
    }
    console.log(`[music] yt-dlp terdeteksi (versi ${check.version})`);
    console.log(`[music] Autoplay: ${isAutoplayEnabled() ? 'ON' : 'OFF'}`);

    await connectVoice();
    playNext();
  }

  return {
    start,
    notifyNewRequest,
    skipCurrent,
    pause,
    resume,
    nowPlaying,
    setAutoplay,
    isAutoplayEnabled,
  };
}
