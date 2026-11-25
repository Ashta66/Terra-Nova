const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 192;

function getTileByteLength(value) {
  if (Number.isFinite(value?.byteLength)) return value.byteLength;
  if (Number.isFinite(value?.size)) return value.size;
  if (Number.isFinite(value?.width) && value.width > 0 && Number.isFinite(value?.height) && value.height > 0) {
    const bytes = value.width * value.height * 4;
    return Number.isFinite(bytes) ? bytes : 0;
  }
  return 0;
}

function closeTileValue(value) {
  try { value?.close?.(); return typeof value?.close === "function" ? 1 : 0; }
  catch { return 1; }
}

function touchLru(entries, key, entry) {
  entries.delete(key);
  entries.set(key, entry);
}

/** Cache LRU pondéré ; le cache prend en charge la fermeture des ressources qu'il possède. */
export function createMapTileCache({ maxBytes = DEFAULT_MAX_BYTES, maxEntries = DEFAULT_MAX_ENTRIES, onEvict = null } = {}) {
  let budget = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
  let limit = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
  const entries = new Map();
  let bytes = 0;
  let peakBytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let rejected = 0;
  let closedResources = 0;
  let disposed = false;
  const evictionReasons = Object.create(null);

  const notifyEviction = (key, entry, reason) => {
    closedResources += closeTileValue(entry.value);
    evictions++;
    evictionReasons[reason] = (evictionReasons[reason] ?? 0) + 1;
    try { onEvict?.(key, entry.value, reason); } catch { /* un observateur ne bloque pas le cache */ }
  };
  const removeEntry = (key, reason) => {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key);
    bytes = Math.max(0, bytes - entry.bytes);
    notifyEviction(key, entry, reason);
    return true;
  };
  const evict = () => {
    while (entries.size > limit || bytes > budget) {
      const oldest = entries.entries().next().value;
      if (!oldest) break;
      removeEntry(oldest[0], "capacity");
    }
  };
  const normalizeLimits = options => {
    const nextBytes = Number(options?.maxBytes);
    const nextEntries = Number(options?.maxEntries);
    if (Number.isFinite(nextBytes) && nextBytes > 0) budget = Math.max(1, Math.floor(nextBytes));
    if (Number.isFinite(nextEntries) && nextEntries > 0) limit = Math.max(1, Math.floor(nextEntries));
    evict();
    return { maxBytes: budget, maxEntries: limit };
  };

  return {
    has(key) { return !disposed && entries.has(String(key)); },
    get(key) {
      if (disposed) return null;
      const id = String(key);
      const entry = entries.get(id);
      if (!entry) { misses++; return null; }
      hits++;
      touchLru(entries, id, entry);
      return entry.value;
    },
    set(key, value) {
      if (disposed) { if (value) closedResources += closeTileValue(value); rejected++; return false; }
      const id = String(key);
      const previous = entries.get(id);
      const size = getTileByteLength(value);
      if (!id || !value || !Number.isFinite(size) || size <= 0 || size > budget) {
        rejected++;
        if (value && previous?.value !== value) closedResources += closeTileValue(value);
        return false;
      }
      if (previous) {
        bytes = Math.max(0, bytes - previous.bytes);
        entries.delete(id);
        if (previous.value !== value) notifyEviction(id, previous, "replace");
      }
      entries.set(id, { value, bytes: size });
      bytes += size;
      peakBytes = Math.max(peakBytes, bytes);
      evict();
      return entries.has(id);
    },
    delete(key) { return disposed ? false : removeEntry(String(key), "delete"); },
    clear() {
      for (const key of [...entries.keys()]) removeEntry(key, "clear");
      bytes = 0;
      hits = 0;
      misses = 0;
    },
    setLimits(options = {}) { return disposed ? { maxBytes: budget, maxEntries: limit } : normalizeLimits(options); },
    dispose() {
      if (disposed) return;
      this.clear();
      disposed = true;
    },
    stats() {
      return {
        entries: entries.size, bytes, maxBytes: budget, maxEntries: limit,
        hits, misses, peakBytes, evictions, rejected, closedResources,
        evictionReasons: { ...evictionReasons }, disposed
      };
    }
  };
}
