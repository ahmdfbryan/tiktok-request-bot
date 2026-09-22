import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('antrian')
    .setDescription('Tampilkan ulang antrian request lagu terbaru di channel ini'),

  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Tampilkan lagu yang sedang diputar sekarang'),

  new SlashCommandBuilder()
    .setName('skip-sekarang')
    .setDescription('[Staff] Lewati lagu yang sedang diputar, lanjut ke request berikutnya'),

  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('[Staff] Jeda pemutaran lagu'),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('[Staff] Lanjutkan pemutaran lagu yang dijeda'),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('[Staff] Lewati satu request yang masih menunggu (belum diputar) berdasarkan ID')
    .addIntegerOption((opt) =>
      opt.setName('id').setDescription('ID request (lihat di daftar antrian)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('hapus-request')
    .setDescription('[Staff] Hapus satu request dari antrian berdasarkan ID')
    .addIntegerOption((opt) =>
      opt.setName('id').setDescription('ID request (lihat di daftar antrian)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('clear-antrian')
    .setDescription('[Staff] Kosongkan semua request yang masih menunggu di antrian'),
].map((c) => c.toJSON());
