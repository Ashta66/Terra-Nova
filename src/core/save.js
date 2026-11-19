import { SAVE_VERSION, validateGameState } from "../game/state.js";
export const SAVE_KEY = "terra-nova-save-v1";
export function saveGame(state, storage = globalThis.localStorage) {
  validateGameState(state);
  const payload = { ...state, schemaVersion: SAVE_VERSION, savedAt: new Date().toISOString() };
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload.savedAt;
}
export function loadGame(storage = globalThis.localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  const state = JSON.parse(raw);
  validateGameState(state);
  return state;
}