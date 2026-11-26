const DEFAULT_PROFILE = Object.freeze({
  maxBytes: 64 * 1024 * 1024,
  maxEntries: 192,
  workerConcurrency: 2,
  maxPlannedTiles: 48
});

/** Profil mémoire prudent : deviceMemory est facultatif et arrondi par le navigateur. */
export function getMapTileResourceProfile(capabilities = {}) {
  const memory = Number(capabilities.deviceMemory);
  const cores = Number(capabilities.hardwareConcurrency);
  const memoryUnavailable = capabilities.deviceMemory === undefined || capabilities.deviceMemory === null || Number.isNaN(memory);
  if (memoryUnavailable) {
    if (Number.isFinite(cores) && cores <= 2) return { maxBytes: 20 * 1024 * 1024, maxEntries: 64, workerConcurrency: 1, maxPlannedTiles: 20, tier: "constrained" };
    if (Number.isFinite(cores) && cores <= 4) return { maxBytes: 36 * 1024 * 1024, maxEntries: 112, workerConcurrency: 1, maxPlannedTiles: 32, tier: "balanced" };
    return { ...DEFAULT_PROFILE, tier: "default" };
  }
  if (!Number.isFinite(memory) || memory <= 0) return { ...DEFAULT_PROFILE, tier: "default" };
  if (memory <= 2 || (Number.isFinite(cores) && cores <= 2)) {
    return { maxBytes: 20 * 1024 * 1024, maxEntries: 64, workerConcurrency: 1, maxPlannedTiles: 20, tier: "constrained" };
  }
  if (memory <= 4 || (Number.isFinite(cores) && cores <= 4)) {
    return { maxBytes: 36 * 1024 * 1024, maxEntries: 112, workerConcurrency: 1, maxPlannedTiles: 32, tier: "balanced" };
  }
  if (memory >= 16 && (!Number.isFinite(cores) || cores >= 12)) {
    return { maxBytes: 80 * 1024 * 1024, maxEntries: 224, workerConcurrency: 2, maxPlannedTiles: 56, tier: "generous" };
  }
  return { ...DEFAULT_PROFILE, tier: "standard" };
}
