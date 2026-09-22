import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

/**
 * Starts listening to a TikTok LIVE room's chat and calls onRequest(...)
 * whenever a viewer sends a song-request command, e.g. "!request judul lagu".
 *
 * @param {object} opts
 * @param {string} opts.username - TikTok username (without @)
 * @param {string} opts.commandPrefix - e.g. "!request"
 * @param {(req: { tiktokUsername: string, tiktokNickname: string, title: string }) => void} opts.onRequest
 * @param {(state: { connected: boolean, reason?: string }) => void} [opts.onStateChange]
 */
export function startTikTokListener({ username, commandPrefix, onRequest, onStateChange }) {
  if (!username) throw new Error('TIKTOK_USERNAME belum diisi di .env');

  const prefix = (commandPrefix || '!request').toLowerCase();
  const connection = new TikTokLiveConnection(username, {});

  async function connectWithRetry() {
    try {
      await connection.connect();
    } catch (err) {
      console.error(`[tiktok] Gagal connect ke live @${username}:`, err?.message || err);
      onStateChange?.({ connected: false, reason: 'connect-failed' });
      // coba lagi setelah beberapa saat (misal streamer belum mulai live)
      setTimeout(connectWithRetry, 30_000);
    }
  }

  connection.on(ControlEvent.CONNECTED, (state) => {
    console.log(`[tiktok] Terhubung ke live @${username} (roomId: ${state?.roomId ?? '?'})`);
    onStateChange?.({ connected: true });
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    console.log(`[tiktok] Terputus dari live @${username}, mencoba reconnect...`);
    onStateChange?.({ connected: false, reason: 'disconnected' });
    setTimeout(connectWithRetry, 15_000);
  });

  connection.on(ControlEvent.ERROR, (err) => {
    console.error('[tiktok] Error koneksi:', err?.message || err);
  });

  connection.on(WebcastEvent.CHAT, (msg) => {
    try {
      const text = (msg?.content ?? '').trim();
      if (!text) return;
      if (!text.toLowerCase().startsWith(prefix)) return;

      const title = text.slice(prefix.length).trim();
      if (!title) return;

      const tiktokUsername = msg?.user?.displayId || msg?.user?.id || 'unknown';
      const tiktokNickname = msg?.user?.nickname || tiktokUsername;

      onRequest({ tiktokUsername, tiktokNickname, title });
    } catch (err) {
      console.error('[tiktok] Gagal memproses komentar:', err);
    }
  });

  connectWithRetry();

  return connection;
}
