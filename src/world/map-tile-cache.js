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
  try { value?.close?.(); } catch { /* une ressource défaillante ne doit pas bloquer le nettoyage */ }
}

function touchLru(entries, key, entry) {
  entries.delete(key);
  entries.set(key, entry);
}

/** Cache LRU pondéré ; le cache prend en charge la fermeture des ressources qu'il possède. */
export function createMapTileCache({ maxBytes = DEFAULT_MAX_BYTES, maxEntries = DEFAULT_MAX_ENTRIES, onEvict = null } = {}) {
  const budget = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
  const limit = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
  const entries = new Map();
  let bytes = 0;
  let hits = 0;
  let misses = 0;

  const notifyEviction = (key, entry, reason) => {
    closeTileValue(entry.value);
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

  return {
    has(key) { return entries.has(String(key)); },
    get(key) {
      const id = String(key);
      const entry = entries.get(id);
      if (!entry) { misses++; return null; }
      hits++;
      touchLru(entries, id, entry);
      return entry.value;
    },
    set(key, value) {
      const id = String(key);
      const previous = entries.get(id);
      const size = getTileByteLength(value);
      if (!id || !value || !Number.isFinite(size) || size <= 0 || size > budget) {
        if (value && previous?.value !== value) closeTileValue(value);
        return false;
      }
      if (previous) {
        bytes = Math.max(0, bytes - previous.bytes);
        entries.delete(id);
        if (previous.value !== value) notifyEviction(id, previous, "replace");
      }
      entries.set(id, { value, bytes: size });
      bytes += size;
      evict();
      return entries.has(id);
    },
    delete(key) { return removeEntry(String(key), "delete"); },
    clear() {
      for (const key of [...entries.keys()]) removeEntry(key, "clear");
      bytes = 0;
      hits = 0;
      misses = 0;
    },
    dispose() { this.clear(); },
    stats() { return { entries: entries.size, bytes, maxBytes: budget, maxEntries: limit, hits, misses }; }
  };
}
