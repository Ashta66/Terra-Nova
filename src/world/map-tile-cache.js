const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 192;

function getTileByteLength(value) {
  if (Number.isFinite(value?.byteLength)) return value.byteLength;
  if (Number.isFinite(value?.size)) return value.size;
  if (Number.isFinite(value?.width) && Number.isFinite(value?.height)) return value.width * value.height * 4;
  return 0;
}

function touchLru(entries, key, entry) {
  entries.delete(key);
  entries.set(key, entry);
}

/** Cache LRU pondéré pour bitmaps encodés / payloads de tuiles. */
export function createMapTileCache({ maxBytes = DEFAULT_MAX_BYTES, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const budget = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
  const limit = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
  const entries = new Map();
  let bytes = 0;
  let hits = 0;
  let misses = 0;
  const evict = () => {
    while (entries.size > limit || bytes > budget) {
      const oldest = entries.entries().next().value;
      if (!oldest) break;
      entries.delete(oldest[0]);
      bytes -= oldest[1].bytes;
      oldest[1].value?.close?.();
    }
  };
  return {
    has(key) {
      const id = String(key);
      return entries.has(id);
    },
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
      const size = getTileByteLength(value);
      if (!id || !value || size > budget) return false;
      const previous = entries.get(id);
      if (previous) { bytes -= previous.bytes; entries.delete(id); if (previous.value !== value) previous.value?.close?.(); }
      entries.set(id, { value, bytes: size });
      bytes += size;
      evict();
      return entries.has(id);
    },
    delete(key) {
      const id = String(key);
      const entry = entries.get(id);
      if (!entry) return false;
      entries.delete(id);
      bytes -= entry.bytes;
      entry.value?.close?.();
      return true;
    },
    clear() { for (const entry of entries.values()) entry.value?.close?.(); entries.clear(); bytes = 0; hits = 0; misses = 0; },
    stats() { return { entries: entries.size, bytes, maxBytes: budget, maxEntries: limit, hits, misses }; }
  };
}
