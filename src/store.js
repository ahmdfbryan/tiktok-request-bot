import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Storage berbasis file JSON biasa — sengaja tanpa native module (seperti
// better-sqlite3) supaya nggak tergantung kompilasi C++ yang rawan gagal/
// segfault di berbagai VPS. Volume data bot ini kecil (antrian request lagu
// selama live), jadi baca/tulis JSON sinkron ini lebih dari cukup dan jauh
// lebih portabel.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'store.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadState() {
  if (!fs.existsSync(dataFile)) {
    return { nextId: 1, requests: [], settings: {} };
  }
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      nextId: parsed.nextId ?? 1,
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      settings: parsed.settings ?? {},
    };
  } catch (err) {
    console.error('[store] Gagal baca data/store.json, mulai dari data kosong:', err.message);
    return { nextId: 1, requests: [], settings: {} };
  }
}

export const state = loadState();

export function save() {
  const tmpFile = `${dataFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, dataFile); // rename atomik, aman kalau proses mati di tengah tulis
}
