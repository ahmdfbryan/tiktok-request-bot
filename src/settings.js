import { state, save } from './store.js';

export function getSetting(key) {
  return Object.prototype.hasOwnProperty.call(state.settings, key) ? state.settings[key] : null;
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}
