import { SAVE_VERSION, validateGameState } from "../game/state.js";

export const SAVE_KEY = "terra-nova-save-v1";
const clone = value => JSON.parse(JSON.stringify(value));

function compactPhysicalWorld(world) {
  if (!world?.baseCells || !world?.currentCells) return world;
  const changedCells = [];
  for (let index = 0; index < world.currentCells.length; index++) {
    const current = world.currentCells[index];
    const base = world.baseCells[index];
    if (current !== base && (!base || JSON.stringify(current) !== JSON.stringify(base))) {
      changedCells.push([index, current]);
    }
  }
  return {
    ...world,
    currentCells: undefined,
    compactCells: { version: 1, changedCells }
  };
}

function expandPhysicalWorld(world) {
  if (!world?.compactCells || !Array.isArray(world.baseCells)) return world;
  const currentCells = world.baseCells.map(cell => ({ ...cell }));
  for (const entry of world.compactCells.changedCells ?? []) {
    if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= currentCells.length || !entry[1]) continue;
    currentCells[entry[0]] = entry[1];
  }
  const expanded = { ...world, currentCells };
  delete expanded.compactCells;
  return expanded;
}

export function saveGame(state, storage = globalThis.localStorage) {
  validateGameState(state);
  const payload = clone({ ...state, schemaVersion: SAVE_VERSION, savedAt: new Date().toISOString() });
  if (payload.physicalWorld) payload.physicalWorld = compactPhysicalWorld(payload.physicalWorld);
  storage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload.savedAt;
}
export function loadGame(storage = globalThis.localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (state.physicalWorld) state.physicalWorld = expandPhysicalWorld(state.physicalWorld);
  validateGameState(state);
  return state;
}
