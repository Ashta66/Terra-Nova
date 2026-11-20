const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 192;

/** Cache LRU pondéré pour bitmaps encodés / payloads de tuiles. */
export function createMapTileCache({ maxBytes = DEFAULT_MAX_BYTES, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const budget = Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES);
  const limit = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
  const entries = new Map();
  let bytes = 0;
  let hits = 0;
  let misses = 0;
  const byteLength = value => {
    if (Number.isFinite(value?.byteLength)) return value.byteLength;
    if (Number.isFinite(value?.size)) return value.size;
    return 0;
  };
  const touch = (key, entry) => { entries.delete(key); entries.set(key, entry); };
  const evict = () => {
    while (entries.size > limit || bytes > budget) {
      const oldest = entries.entries().next().value;
      if (!oldest) break;
      entries.delete(oldest[0]);
      bytes -= oldest[1].bytes;
    }
  };
  return {
    get(key) {
      const entry = entries.get(String(key));
      if (!entry) { misses++; return null; }
      hits++;
      touch(String(key), entry);
      return entry.value;
    },
    set(key, value) {
      const id = String(key);
      const size = byteLength(value);
      if (!id || !value || size > budget) return false;
      const previous = entries.get(id);
      if (previous) { bytes -= previous.bytes; entries.delete(id); }
      entries.set(id, { value, bytes: size, touchedAt: Date.now() });
      bytes += size;
      evict();
      return entries.has(id);
    },
    delete(key) {
      const id = String(key), entry = entries.get(id);
      if (!entry) return false;
      entries.delete(id); bytes -= entry.bytes; return true;
    },
    clear() { entries.clear(); bytes = 0; hits = 0; misses = 0; },
    stats() { return { entries: entries.size, bytes, maxBytes: budget, maxEntries: limit, hits, misses }; }
  };
}
