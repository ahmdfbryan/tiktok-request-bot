import { EmbedBuilder } from 'discord.js';
import { listPending, listRecent, getCurrentlyPlaying } from './queue.js';

const MAX_ITEMS_SHOWN = 20;

/**
 * @param {object|null} [nowPlayingOverride] - kalau dikasih (dari musicPlayer.nowPlaying()),
 *   dipakai apa adanya — bisa berupa request asli (punya `id`) atau pick autoplay (id: null).
 *   Kalau nggak dikasih, fallback baca dari store (queue.getCurrentlyPlaying()).
 * @param {boolean} [autoplayEnabled] - status autoplay, ditampilkan di footer kalau ada.
 */
export function buildQueueEmbed(nowPlayingOverride, autoplayEnabled) {
  const nowPlaying = nowPlayingOverride !== undefined ? nowPlayingOverride : getCurrentlyPlaying();
  const pending = listPending();
  const recent = listRecent(3);

  const embed = new EmbedBuilder()
    .setTitle('🎵 Antrian Request Lagu — TikTok Live')
    .setColor(nowPlaying ? 0x1db954 : pending.length > 0 ? 0xf1c40f : 0x5865f2)
    .setTimestamp(new Date());

  if (nowPlaying) {
    const idSuffix = nowPlaying.id != null ? ` *(id: ${nowPlaying.id})*` : '';
    embed.addFields({
      name: '🔊 Sedang diputar',
      value: `**${escapeMd(nowPlaying.title)}** — req by \`${escapeMd(nowPlaying.tiktok_nickname)}\`${idSuffix}`,
    });
  }

  if (pending.length === 0) {
    embed.setDescription(
      nowPlaying
        ? 'Belum ada antrian selanjutnya. Ketik `!request <judul lagu>` di komentar live untuk request lagu!'
        : 'Belum ada request. Ketik `!request <judul lagu>` di komentar live untuk request lagu!'
    );
  } else {
    const shown = pending.slice(0, MAX_ITEMS_SHOWN);
    const lines = shown.map((r, i) => `${i + 1}. **${escapeMd(r.title)}** — req by \`${escapeMd(r.tiktok_nickname)}\` *(id: ${r.id})*`);
    if (pending.length > MAX_ITEMS_SHOWN) {
      lines.push(`\n…dan ${pending.length - MAX_ITEMS_SHOWN} request lainnya`);
    }
    embed.setDescription(lines.join('\n'));
  }

  if (recent.length > 0) {
    const recentLines = recent.map((r) => {
      const mark = r.status === 'played' ? '✅' : '⏭️';
      return `${mark} ${escapeMd(r.title)} — \`${escapeMd(r.tiktok_nickname)}\``;
    });
    embed.addFields({ name: 'Baru saja', value: recentLines.join('\n') });
  }

  const footerParts = [];
  if (pending.length > 0) footerParts.push(`Menunggu diputar: ${pending.length}`);
  if (autoplayEnabled !== undefined) footerParts.push(`Autoplay: ${autoplayEnabled ? 'ON 🔀' : 'OFF'}`);
  if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(' • ') });

  return embed;
}

function escapeMd(text) {
  return String(text ?? '').replace(/[*_`~|]/g, '\\$&').slice(0, 150);
}
