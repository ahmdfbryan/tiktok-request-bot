import { state, save } from './store.js';

export function addRequest({ tiktokUsername, tiktokNickname, title }) {
  const req = {
    id: state.nextId++,
    tiktok_username: tiktokUsername,
    tiktok_nickname: tiktokNickname ?? tiktokUsername,
    title,
    status: 'pending', // pending | playing | played | skipped
    created_at: Date.now(),
  };
  state.requests.push(req);
  save();
  return req;
}

export function countPendingForUser(tiktokUsername) {
  return state.requests.filter((r) => r.tiktok_username === tiktokUsername && r.status === 'pending').length;
}

export function listPending() {
  return state.requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.created_at - b.created_at);
}

export function listRecent(limit = 5) {
  return state.requests
    .filter((r) => r.status === 'played' || r.status === 'skipped')
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

export function getById(id) {
  return state.requests.find((r) => r.id === id) ?? null;
}

export function getCurrentlyPlaying() {
  return state.requests.find((r) => r.status === 'playing') ?? null;
}

/**
 * Ambil request pending paling depan dan tandai sebagai 'playing'.
 * Dipakai oleh music player saat mulai memutar lagu berikutnya.
 */
export function takeNextForPlayback() {
  const pending = listPending();
  const next = pending[0];
  if (!next) return null;
  next.status = 'playing';
  save();
  return next;
}

/**
 * Tandai request yang lagi 'playing' sebagai selesai ('played') atau
 * dilewati ('skipped').
 */
export function finishPlaying(id, finalStatus = 'played') {
  const req = getById(id);
  if (!req) return null;
  req.status = finalStatus;
  save();
  return req;
}

export function markPlayed(id) {
  const req = getById(id);
  if (!req) return null;
  req.status = 'played';
  save();
  return req;
}

export function markSkipped(id) {
  const req = getById(id);
  if (!req) return null;
  req.status = 'skipped';
  save();
  return req;
}

export function removePending(id) {
  const idx = state.requests.findIndex((r) => r.id === id && r.status === 'pending');
  if (idx === -1) return false;
  state.requests.splice(idx, 1);
  save();
  return true;
}

export function clearPending() {
  const before = state.requests.length;
  state.requests = state.requests.filter((r) => r.status !== 'pending');
  const removed = before - state.requests.length;
  save();
  return removed;
}

export function clearAll() {
  const removed = state.requests.length;
  state.requests = [];
  save();
  return removed;
}
