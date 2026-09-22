// Script diagnostik: tes play-dl (search + stream) langsung, terpisah dari bot.
// Jalankan: node test-youtube.mjs "judul lagu"
import play from 'play-dl';

const query = process.argv.slice(2).join(' ') || 'bukti virgoun';

console.log(`Mencari: "${query}"...`);
try {
  const results = await play.search(query, { limit: 3, source: { youtube: 'video' } });
  console.log(`Ketemu ${results.length} hasil:`);
  for (const v of results) {
    console.log(`- ${v.title} | url: ${v.url} | durasi: ${v.durationRaw}`);
  }

  const video = results[0];
  if (!video) {
    console.log('Tidak ada hasil sama sekali.');
    process.exit(1);
  }

  console.log(`\nCoba stream: ${video.url}`);
  const streamInfo = await play.stream(video.url);
  console.log('Stream berhasil didapat! Type:', streamInfo.type);
  process.exit(0);
} catch (err) {
  console.error('\nERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
}
