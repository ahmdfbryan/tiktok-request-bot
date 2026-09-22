# TikTok Request Bot

Bot yang mendengarkan komentar di TikTok LIVE kamu, menangkap request lagu dengan format
`!request <judul lagu>`, lalu menampilkannya sebagai antrian yang otomatis ter-update
di sebuah channel Discord.

## Cara kerja

1. Bot connect ke room TikTok LIVE kamu (tanpa perlu login, cukup baca chat publik).
2. Setiap komentar yang diawali `!request` (bisa diganti) dianggap request lagu.
3. Request disimpan di file JSON lokal (`data/store.json`) — tanpa native module,
   jadi tidak perlu kompilasi apa pun dan aman dijalankan di VPS mana saja.
4. Bot Discord menampilkan satu embed antrian yang terus di-edit (bukan spam pesan baru)
   di channel yang kamu tentukan.
5. Kalau `DISCORD_VOICE_CHANNEL_ID` diisi, bot juga **join voice channel itu dan stay
   24/7** (auto-reconnect kalau terputus). Setiap ada request baru, bot otomatis cari
   judulnya di YouTube dan memutarnya, lalu lanjut otomatis ke request berikutnya begitu
   satu lagu selesai (auto-play berurutan).
6. Staff bisa kelola antrian & pemutaran lewat slash command di Discord.

## Setup

```bash
npm install
cp .env.example .env
```

Isi `.env`:

- `TIKTOK_USERNAME` — username TikTok kamu tanpa `@`. **Live harus sedang berlangsung**
  saat bot dijalankan/reconnect (bot akan otomatis retry tiap 30 detik kalau belum live).
- `DISCORD_TOKEN` — token bot dari [Discord Developer Portal](https://discord.com/developers/applications).
  Aktifkan bot di server kamu dengan scope `bot` + `applications.commands`, dan izinkan minimal
  permission `Send Messages`, `Embed Links`, `Read Message History`.
- `DISCORD_QUEUE_CHANNEL_ID` — klik kanan channel di Discord (mode developer aktif) → Copy Channel ID.
- `DISCORD_VOICE_CHANNEL_ID` — (opsional) ID voice channel tempat bot stay 24/7 & main
  lagu. Kosongkan kalau cuma mau fitur antrian teks tanpa play musik. Bot butuh
  permission `Connect` dan `Speak` di voice channel ini.
- `DISCORD_STAFF_ROLE_ID` — (opsional) role yang boleh pakai command admin. Kalau kosong,
  yang dipakai adalah izin `Manage Server`.
- `DISCORD_GUILD_ID` — (opsional, buat development) isi ID server supaya slash command
  langsung muncul. Kosongkan untuk production (daftar global, bisa telat sampai ~1 jam
  muncul pertama kali, tapi setelah itu sinkron sendiri).

Jalankan:

```bash
npm start
```

## Command Discord

| Command | Siapa | Fungsi |
|---|---|---|
| `/antrian` | semua orang | Tampilkan ulang embed antrian di channel |
| `/nowplaying` | semua orang | Lihat lagu yang sedang diputar |
| `/skip-sekarang` | staff | Lewati lagu yang **sedang diputar**, lanjut otomatis ke berikutnya |
| `/pause` | staff | Jeda pemutaran |
| `/resume` | staff | Lanjutkan pemutaran yang dijeda |
| `/skip id:<id>` | staff | Lewati satu request yang **masih menunggu** (belum diputar) |
| `/hapus-request id:<id>` | staff | Hapus request dari antrian (yang masih menunggu) |
| `/clear-antrian` | staff | Kosongkan semua request yang masih menunggu |

ID request terlihat di setiap baris pada embed antrian (`id: 12`).

`/skip-sekarang`, `/pause`, dan `/resume` hanya berfungsi kalau `DISCORD_VOICE_CHANNEL_ID`
diisi (fitur musik aktif).

## Batasan request dari penonton

Diatur lewat `.env`:

- `MAX_PENDING_PER_USER` — maksimal request yang masih "pending" per akun TikTok
  (default 3), supaya satu orang tidak spam.
- `MAX_TITLE_LENGTH` — potong judul yang kepanjangan (default 100 karakter).

## Deploy production (Ubuntu VPS + pm2)

```bash
npm install --omit=dev
pm2 start src/index.js --name tiktok-request-bot
pm2 save
```

Cek log:

```bash
pm2 logs tiktok-request-bot
```

## Fitur musik (opsional)

Kalau `DISCORD_VOICE_CHANNEL_ID` diisi:

- Bot join voice channel itu begitu online, dan **stay di situ terus-menerus** —
  termasuk saat antrian kosong (nggak auto-leave). Kalau koneksi terputus (misal restart
  Discord/jaringan), bot otomatis coba join ulang.
- Judul lagu dicari otomatis di YouTube (hasil pencarian teratas) lewat paket `play-dl`,
  lalu di-stream langsung ke voice channel — **tanpa perlu install ffmpeg**, karena
  audio dari YouTube sudah dalam format Opus yang langsung dipakai.
- Kalau judul lagu nggak ketemu / gagal di-stream, request itu otomatis ditandai
  "dilewati" dan bot lanjut ke request berikutnya (nggak macet nunggu).
- Pencarian & streaming YouTube di `play-dl` sifatnya scraping (bukan API resmi), jadi
  **ada risiko diblokir/dibatasi YouTube** kalau IP VPS kamu kena rate limit — biasanya
  muncul sebagai error "Sign in to confirm you're not a bot" di log. Kalau ini terjadi
  terus-menerus, solusinya biasanya update `play-dl` ke versi terbaru
  (`npm update play-dl`) atau setting cookie YouTube lewat `play.setToken()` (lihat
  dokumentasi play-dl) — kabari aku kalau butuh dibantu setup ini.

## Catatan penting

- Bot ini membaca chat TikTok LIVE lewat koneksi publik (paket `tiktok-live-connector`),
  jadi rawan berhenti kalau TikTok mengubah signature/protokolnya — kalau tiba-tiba
  berhenti connect, coba `npm update tiktok-live-connector` dulu.
- Data antrian disimpan lokal di `data/store.json`, jadi aman kalau bot restart —
  request yang masih pending tidak hilang. Penyimpanan sengaja pakai file JSON biasa
  (bukan SQLite/database dengan native binding) supaya tidak butuh kompilasi C++ sama
  sekali — beberapa VPS gagal/crash (segfault) saat native module seperti
  `better-sqlite3` dipakai, jadi ini pendekatan yang paling portabel untuk volume data
  bot sekecil ini.
- File `.env` dan folder `data/` sudah di-ignore lewat `.gitignore`, jangan pernah
  commit token bot ke repo publik.
