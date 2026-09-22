import 'dotenv/config';
import { createDiscordBot } from './discordBot.js';
import { startTikTokListener } from './tiktokListener.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Env "${name}" belum diisi. Cek file .env kamu (lihat .env.example).`);
    process.exit(1);
  }
  return value;
}

const TIKTOK_USERNAME = requireEnv('TIKTOK_USERNAME');
const DISCORD_TOKEN = requireEnv('DISCORD_TOKEN');
const DISCORD_QUEUE_CHANNEL_ID = requireEnv('DISCORD_QUEUE_CHANNEL_ID');
const DISCORD_VOICE_CHANNEL_ID = process.env.DISCORD_VOICE_CHANNEL_ID || null;
const DISCORD_STAFF_ROLE_ID = process.env.DISCORD_STAFF_ROLE_ID || null;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || null;
const REQUEST_COMMAND = process.env.REQUEST_COMMAND || '!request';
const MAX_PENDING_PER_USER = Number(process.env.MAX_PENDING_PER_USER || 3);
const MAX_TITLE_LENGTH = Number(process.env.MAX_TITLE_LENGTH || 100);

async function main() {
  if (!DISCORD_VOICE_CHANNEL_ID) {
    console.log('[music] DISCORD_VOICE_CHANNEL_ID belum diisi — fitur play musik dinonaktifkan, bot cuma nampilin antrian teks.');
  }

  const bot = createDiscordBot({
    token: DISCORD_TOKEN,
    queueChannelId: DISCORD_QUEUE_CHANNEL_ID,
    voiceChannelId: DISCORD_VOICE_CHANNEL_ID,
    staffRoleId: DISCORD_STAFF_ROLE_ID,
    guildId: DISCORD_GUILD_ID,
    maxPendingPerUser: MAX_PENDING_PER_USER,
    maxTitleLength: MAX_TITLE_LENGTH,
  });

  await bot.start();

  startTikTokListener({
    username: TIKTOK_USERNAME,
    commandPrefix: REQUEST_COMMAND,
    onRequest: (req) => {
      bot.handleTikTokRequest(req).catch((err) => {
        console.error('[bot] Gagal memproses request:', err);
      });
    },
    onStateChange: (state) => {
      if (state.connected) {
        console.log(`[status] Live @${TIKTOK_USERNAME} terhubung, siap menerima request lagu.`);
      }
    },
  });
}

main().catch((err) => {
  console.error('Fatal error saat start bot:', err);
  process.exit(1);
});
