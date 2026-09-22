import { EmbedBuilder } from 'discord.js';
import { listPending, listRecent, getCurrentlyPlaying } from './queue.js';

const MAX_ITEMS_SHOWN = 20;

export function buildQueueEmbed() {
  const nowPlaying = getCurrentlyPlaying();
  const pending = listPending();
  const recent = listRecent(3);

  const embed = new EmbedBuilder()
    .setTitle('🎵 Antrian Request Lagu — TikTok Live')
    .setColor(nowPlaying ? 0x1db954 : pending.length > 0 ? 0xf1c40f : 0x5865f2)
    .setTimestamp(new Date());

  if (nowPlaying) {
    embed.addFields({
      name: '🔊 Sedang diputar',
      value: `**${escapeMd(nowPlaying.title)}** — req by \`${escapeMd(nowPlaying.tiktok_nickname)}\` *(id: ${nowPlaying.id})*`,
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
    embed.setFooter({ text: `Menunggu diputar: ${pending.length}` });
  }

  if (recent.length > 0) {
    const recentLines = recent.map((r) => {
      const mark = r.status === 'played' ? '✅' : '⏭️';
      return `${mark} ${escapeMd(r.title)} — \`${escapeMd(r.tiktok_nickname)}\``;
    });
    embed.addFields({ name: 'Baru saja', value: recentLines.join('\n') });
  }

  return embed;
}

function escapeMd(text) {
  return String(text ?? '').replace(/[*_`~|]/g, '\\$&').slice(0, 150);
}
