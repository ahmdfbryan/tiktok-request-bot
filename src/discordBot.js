import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  PermissionFlagsBits,
} from 'discord.js';
import { buildQueueEmbed } from './embed.js';
import { commandDefinitions } from './commands.js';
import { getSetting, setSetting } from './settings.js';
import { createMusicPlayer } from './musicPlayer.js';
import {
  addRequest,
  countPendingForUser,
  removePending,
  markSkipped,
  clearPending,
  getById,
} from './queue.js';

const QUEUE_MSG_KEY = 'queue_message_id';

export function createDiscordBot({
  token,
  queueChannelId,
  voiceChannelId,
  staffRoleId,
  guildId,
  maxPendingPerUser,
  maxTitleLength,
}) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  let queueMessage = null;

  async function getQueueChannel() {
    const channel = await client.channels.fetch(queueChannelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Channel ${queueChannelId} bukan text channel yang valid`);
    }
    return channel;
  }

  async function ensureQueueMessage() {
    const channel = await getQueueChannel();
    const savedId = getSetting(QUEUE_MSG_KEY);

    if (savedId) {
      try {
        queueMessage = await channel.messages.fetch(savedId);
        return queueMessage;
      } catch {
        // pesan lama sudah dihapus / tidak ditemukan, buat baru
      }
    }

    queueMessage = await channel.send({ embeds: [buildQueueEmbed(musicPlayer?.nowPlaying(), musicPlayer?.isAutoplayEnabled())] });
    setSetting(QUEUE_MSG_KEY, queueMessage.id);
    return queueMessage;
  }

  async function doRefreshQueueEmbed() {
    try {
      if (!queueMessage) await ensureQueueMessage();
      await queueMessage.edit({ embeds: [buildQueueEmbed(musicPlayer?.nowPlaying(), musicPlayer?.isAutoplayEnabled())] });
    } catch (err) {
      console.error('[discord] Gagal update embed antrian, membuat pesan baru:', err?.message || err);
      queueMessage = null;
      await ensureQueueMessage();
    }
  }

  // Serialize semua pemanggilan refreshQueueEmbed() supaya nggak ada beberapa
  // proses yang bareng-bareng nyoba "benerin" pesan yang sama dan malah bikin
  // beberapa pesan baru sekaligus (race condition).
  let refreshChain = Promise.resolve();
  function refreshQueueEmbed() {
    refreshChain = refreshChain.then(doRefreshQueueEmbed).catch((err) => {
      console.error('[discord] refreshQueueEmbed gagal total:', err?.message || err);
    });
    return refreshChain;
  }

  const musicPlayer = voiceChannelId
    ? createMusicPlayer({ client, voiceChannelId, onQueueChange: refreshQueueEmbed })
    : null;

  function isStaff(interaction) {
    if (!staffRoleId) return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    return interaction.member?.roles?.cache?.has(staffRoleId) ?? false;
  }

  async function registerCommands() {
    const rest = new REST().setToken(token);
    const appId = client.application.id;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandDefinitions });
      console.log(`[discord] Slash command terdaftar untuk guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(appId), { body: commandDefinitions });
      console.log('[discord] Slash command terdaftar secara global (bisa butuh ~1 jam untuk muncul)');
    }
  }

  client.once('ready', async () => {
    console.log(`[discord] Login sebagai ${client.user.tag}`);
    await registerCommands();
    await ensureQueueMessage();
    if (musicPlayer) {
      try {
        await musicPlayer.start();
      } catch (err) {
        console.error('[music] Gagal join voice channel:', err.message);
      }
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'antrian': {
          await ensureQueueMessage();
          await refreshQueueEmbed();
          await interaction.reply({ content: 'Antrian sudah ditampilkan ulang di channel ini.', ephemeral: true });
          break;
        }

        case 'nowplaying': {
          const current = musicPlayer?.nowPlaying();
          if (!current) {
            await interaction.reply({ content: 'Nggak ada lagu yang sedang diputar saat ini.', ephemeral: true });
            return;
          }
          await interaction.reply(
            `🔊 Sedang diputar: **${current.title}** — request dari \`${current.tiktok_nickname}\``
          );
          break;
        }

        case 'skip-sekarang': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          if (!musicPlayer) {
            await interaction.reply({ content: 'Fitur musik belum diaktifkan (DISCORD_VOICE_CHANNEL_ID belum diisi).', ephemeral: true });
            return;
          }
          const ok = musicPlayer.skipCurrent();
          await interaction.reply({ content: ok ? '⏭️ Lagu saat ini dilewati, lanjut ke berikutnya.' : 'Nggak ada lagu yang sedang diputar.', ephemeral: true });
          break;
        }

        case 'pause': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          if (!musicPlayer) {
            await interaction.reply({ content: 'Fitur musik belum diaktifkan.', ephemeral: true });
            return;
          }
          const ok = musicPlayer.pause();
          await interaction.reply({ content: ok ? '⏸️ Pemutaran dijeda.' : 'Nggak ada yang sedang diputar untuk dijeda.', ephemeral: true });
          break;
        }

        case 'resume': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          if (!musicPlayer) {
            await interaction.reply({ content: 'Fitur musik belum diaktifkan.', ephemeral: true });
            return;
          }
          const ok = musicPlayer.resume();
          await interaction.reply({ content: ok ? '▶️ Pemutaran dilanjutkan.' : 'Nggak ada yang sedang dijeda.', ephemeral: true });
          break;
        }

        case 'skip': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          const id = interaction.options.getInteger('id', true);
          const req = getById(id);
          if (!req || req.status !== 'pending') {
            await interaction.reply({ content: `Request dengan id ${id} tidak ditemukan di antrian (belum diputar).`, ephemeral: true });
            return;
          }
          markSkipped(id);
          await refreshQueueEmbed();
          await interaction.reply({ content: `⏭️ Request **${req.title}** (id: ${id}) dilewati.`, ephemeral: true });
          break;
        }

        case 'hapus-request': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          const id = interaction.options.getInteger('id', true);
          const ok = removePending(id);
          if (!ok) {
            await interaction.reply({ content: `Request dengan id ${id} tidak ditemukan di antrian.`, ephemeral: true });
            return;
          }
          await refreshQueueEmbed();
          await interaction.reply({ content: `🗑️ Request id ${id} dihapus dari antrian.`, ephemeral: true });
          break;
        }

        case 'clear-antrian': {
          if (!isStaff(interaction)) return void (await denyStaff(interaction));
          const count = clearPending();
          await refreshQueueEmbed();
          await interaction.reply({ content: `🧹 Antrian dikosongkan (${count} request dihapus).`, ephemeral: true });
          break;
        }
      }
    } catch (err) {
      console.error('[discord] Error saat menangani command:', err);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: 'Terjadi error saat memproses command ini.', ephemeral: true }).catch(() => {});
      }
    }
  });

  async function denyStaff(interaction) {
    await interaction.reply({ content: 'Command ini khusus staff.', ephemeral: true });
  }

  /**
   * Dipanggil oleh listener TikTok saat ada komentar "!request <judul lagu>".
   */
  async function handleTikTokRequest({ tiktokUsername, tiktokNickname, title }) {
    const trimmedTitle = title.trim().slice(0, maxTitleLength);
    if (!trimmedTitle) return;

    const pendingCount = countPendingForUser(tiktokUsername);
    if (pendingCount >= maxPendingPerUser) {
      console.log(`[tiktok] @${tiktokUsername} sudah punya ${pendingCount} request pending, request baru diabaikan.`);
      return;
    }

    const req = addRequest({ tiktokUsername, tiktokNickname, title: trimmedTitle });
    console.log(`[tiktok] Request baru dari ${tiktokNickname}: "${trimmedTitle}" (id: ${req.id})`);
    await refreshQueueEmbed();
    musicPlayer?.notifyNewRequest();
  }

  /**
   * Dipanggil oleh listener TikTok saat streamer komen "!autoplay on/off".
   */
  function handleAutoplayCommand({ enabled }) {
    if (!musicPlayer) {
      console.log('[music] Command !autoplay diabaikan — DISCORD_VOICE_CHANNEL_ID belum diisi.');
      return;
    }
    musicPlayer.setAutoplay(enabled);
    refreshQueueEmbed();
  }

  async function start() {
    await client.login(token);
  }

  return { client, start, handleTikTokRequest, handleAutoplayCommand, refreshQueueEmbed };
}
