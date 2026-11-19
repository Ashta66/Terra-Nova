import { createClock, START_DATE } from "../core/clock.js";
import { createGeography } from "../world/geography.js";
export const SAVE_VERSION = 1;
export function createGameState() {
  return {
    schemaVersion: SAVE_VERSION,
    metadata: { title: "TERRA NOVA", scenario: "world-1444", createdAt: new Date().toISOString() },
    clock: createClock(),
    geography: createGeography([]),
    political: { countries: [], territories: [] },
    world: { discoveredRegionIds: [], eventQueue: [], chronicle: [] }
  };
}
export function validateGameState(state) {
  if (!state || state.schemaVersion !== SAVE_VERSION) throw new Error("Version de sauvegarde incompatible.");
  if (!state.clock || typeof state.clock.date !== "string" || !Number.isInteger(state.clock.day)) throw new Error("Horloge de sauvegarde invalide.");
  if (state.clock.date < START_DATE) throw new Error("La date de sauvegarde précède le début de la campagne.");
  if (!state.geography || !Array.isArray(state.geography.currentRegions)) throw new Error("Géographie de sauvegarde invalide.");
  return true;
}