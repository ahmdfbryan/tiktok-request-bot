import { spawn } from 'node:child_process';

// Pakai yt-dlp (proses eksternal) buat cari & ambil audio dari YouTube,
// bukan library JS seperti play-dl/ytdl-core. yt-dlp di-maintain super aktif
// oleh komunitas besar (rilis baru hampir tiap minggu) khusus buat ngikutin
// perubahan YouTube, jadi jauh lebih tahan lama dibanding library JS yang
// gampang basi begitu YouTube ubah algoritma cipher-nya.

const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

function runYtDlpJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`yt-dlp tidak ditemukan (perintah "${YTDLP_BIN}"). Install dulu, misal: pip install -U yt-dlp`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`yt-dlp keluar dengan kode ${code}: ${stderr.trim().slice(-500) || '(tidak ada detail error)'}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Cari 1 video YouTube paling relevan untuk sebuah judul/query.
 * @returns {Promise<{ title: string, url: string, durationSec: number } | null>}
 */
export async function searchVideo(query) {
  const stdout = await runYtDlpJson([
    '-j',
    '--no-playlist',
    '--skip-download',
    '--no-warnings',
    `ytsearch1:${query}`,
  ]);

  const line = stdout.split('\n').map((l) => l.trim()).find((l) => l.startsWith('{'));
  if (!line) return null;

  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }

  const url = data.webpage_url || data.original_url || (data.id ? `https://www.youtube.com/watch?v=${data.id}` : null);
  if (!url) return null;

  return {
    title: data.title || query,
    url,
    durationSec: data.duration || 0,
  };
}

/**
 * Mulai proses yt-dlp yang stream audio dari sebuah URL YouTube ke stdout.
 * @returns {{ stream: import('node:stream').Readable, process: import('node:child_process').ChildProcess }}
 */
export function getAudioStream(url) {
  const child = spawn(
    YTDLP_BIN,
    ['-f', 'bestaudio/best', '--no-playlist', '--no-warnings', '--quiet', '-o', '-', url],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-1000);
  });
  child.on('error', (err) => {
    console.error('[youtube] Gagal menjalankan yt-dlp untuk streaming:', err.message);
  });
  child.getStderrTail = () => stderrTail;

  return { stream: child.stdout, process: child };
}

/**
 * Cek apakah binary yt-dlp bisa dijalankan. Dipanggil sekali saat startup
 * supaya errornya jelas dari awal, bukan pas ada request pertama masuk.
 */
export function checkAvailable() {
  return new Promise((resolve) => {
    const child = spawn(YTDLP_BIN, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.on('error', () => resolve({ ok: false, version: null }));
    child.on('close', (code) => resolve({ ok: code === 0, version: out.trim() || null }));
  });
}
