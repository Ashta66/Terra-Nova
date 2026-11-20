const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function normalizeLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360;
}

export function createTerrainTileStore(grid, options = {}) {
  if (!grid?.values || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)
    || grid.values.length !== grid.width * grid.height) {
    throw new TypeError("Une grille de terrain valide est requise.");
  }

  const tileSize = options.tileSize ?? 180;
  const maxTiles = options.maxTiles ?? 96;
  if (!Number.isInteger(tileSize) || tileSize < 2) throw new RangeError("La taille des tuiles doit être un entier supérieur ou égal à 2.");
  if (!Number.isInteger(maxTiles) || maxTiles < 1) throw new RangeError("maxTiles doit être un entier positif.");

  const columns = Math.ceil(grid.width / tileSize);
  const rows = Math.ceil(grid.height / tileSize);
  const cache = new Map();
  const modifiedTiles = new Map();
  let clock = 0;
  let onTileChange = typeof options.onTileChange === "function" ? options.onTileChange : null;

  function tileId(x, y) {
    return `0/${x}/${y}`;
  }

  function touch(tile) {
    tile.lastUsed = ++clock;
    cache.delete(tile.id);
    cache.set(tile.id, tile);
    return tile;
  }

  function evictOverflow(protectedId = null) {
    while (cache.size > maxTiles) {
      let candidateId = null;
      for (const [id] of cache) {
        if (id !== protectedId && !cache.get(id)?.dirty) { candidateId = id; break; }
      }
      if (candidateId === null) break;
      cache.delete(candidateId);
    }
  }

  function getTile(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= columns || y < 0 || y >= rows) return null;
    const id = tileId(x, y);
    const cached = cache.get(id);
    if (cached) return touch(cached);

    const originX = x * tileSize;
    const originY = y * tileSize;
    const width = Math.min(tileSize, grid.width - originX);
    const height = Math.min(tileSize, grid.height - originY);
    const values = new Int16Array(width * height);
    for (let row = 0; row < height; row++) {
      const sourceStart = (originY + row) * grid.width + originX;
      values.set(grid.values.subarray(sourceStart, sourceStart + width), row * width);
    }
    const saved = modifiedTiles.get(id);
    if (saved && saved.values.length === values.length) values.set(saved.values);
    const tile = {
      id, level: 0, x, y, originX, originY, width, height, values,
      revision: saved?.revision ?? 0, dirty: false, lastUsed: 0
    };
    touch(tile);
    evictOverflow(id);
    return tile;
  }

  function locate(longitude, latitude) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    const normalized = normalizeLongitude(longitude);
    const sampleX = normalized / 360 * grid.width - 0.5;
    const sampleY = clamp((90 - latitude) / 180 * grid.height - 0.5, 0, grid.height - 1);
    const column = ((Math.floor(sampleX) % grid.width) + grid.width) % grid.width;
    const row = clamp(Math.floor(sampleY), 0, grid.height - 1);
    const x = Math.floor(column / tileSize);
    const y = Math.floor(row / tileSize);
    return { x, y, column, row, localX: column - x * tileSize, localY: row - y * tileSize };
  }

  function getTileAt(longitude, latitude) {
    const position = locate(longitude, latitude);
    return position ? getTile(position.x, position.y) : null;
  }

  function sample(longitude, latitude) {
    const position = locate(longitude, latitude);
    if (!position) return null;
    const tile = getTile(position.x, position.y);
    return tile.values[position.localY * tile.width + position.localX];
  }

  function sampleBilinear(longitude, latitude) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    const normalized = normalizeLongitude(longitude);
    const sampleX = normalized / 360 * grid.width - 0.5;
    const sampleY = clamp((90 - latitude) / 180 * grid.height - 0.5, 0, grid.height - 1);
    const rawX = Math.floor(sampleX);
    const x0 = ((rawX % grid.width) + grid.width) % grid.width;
    const x1 = (x0 + 1) % grid.width;
    const y0 = clamp(Math.floor(sampleY), 0, grid.height - 1);
    const y1 = Math.min(grid.height - 1, y0 + 1);
    const fx = sampleX - rawX;
    const fy = sampleY - Math.floor(sampleY);
    const at = (column, row) => {
      const tile = getTile(Math.floor(column / tileSize), Math.floor(row / tileSize));
      const localX = column - tile.originX;
      const localY = row - tile.originY;
      return tile.values[localY * tile.width + localX];
    };
    const a = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
    const b = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
    return a * (1 - fy) + b * fy;
  }

  function setElevation(longitude, latitude, elevation) {
    if (!Number.isFinite(elevation) || elevation < -32768 || elevation > 32767) {
      throw new RangeError("L'altitude doit être un entier signé sur 16 bits.");
    }
    const position = locate(longitude, latitude);
    if (!position) return false;
    const tile = getTile(position.x, position.y);
    tile.values[position.localY * tile.width + position.localX] = Math.round(elevation);
    tile.revision++;
    tile.dirty = true;
    modifiedTiles.set(tile.id, { values: tile.values.slice(), revision: tile.revision });
    if (onTileChange) {
      const snapshot = {
        id: tile.id, x: tile.x, y: tile.y, width: tile.width, height: tile.height,
        revision: tile.revision, values: tile.values.slice()
      };
      try {
        const pending = onTileChange(snapshot);
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
      } catch { /* Une panne de persistance ne doit pas interrompre la simulation. */ }
    }
    return true;
  }

  function markPersisted(id, revision) {
    const tile = cache.get(id);
    if (!tile || tile.revision !== revision) return false;
    tile.dirty = false;
    return true;
  }

  function restoreTile(snapshot) {
    if (!snapshot || typeof snapshot.id !== "string" || !Number.isInteger(snapshot.x)
      || !Number.isInteger(snapshot.y) || !Number.isInteger(snapshot.revision)
      || !(snapshot.values instanceof Int16Array)) return false;
    const tile = getTile(snapshot.x, snapshot.y);
    if (!tile || snapshot.id !== tile.id || snapshot.width !== tile.width
      || snapshot.height !== tile.height || snapshot.values.length !== tile.values.length) return false;
    const values = snapshot.values.slice();
    modifiedTiles.set(tile.id, { values, revision: Math.max(0, snapshot.revision) });
    tile.values.set(values);
    tile.revision = Math.max(0, snapshot.revision);
    tile.dirty = false;
    return true;
  }

  function setOnTileChange(callback) {
    onTileChange = typeof callback === "function" ? callback : null;
  }

  function evictUnused(keepIds = []) {
    const keep = new Set(keepIds);
    let removed = 0;
    for (const id of cache.keys()) {
      if (!keep.has(id) && !cache.get(id)?.dirty) { cache.delete(id); removed++; }
    }
    return removed;
  }

  return {
    tileSize, columns, rows, width: grid.width, height: grid.height,
    getTile, getTileAt, sample, sampleBilinear, setElevation, markPersisted, restoreTile, setOnTileChange, evictUnused,
    get size() { return cache.size; },
    get loadedIds() { return [...cache.keys()]; },
    getTileId(x, y) { return x >= 0 && x < columns && y >= 0 && y < rows ? tileId(x, y) : null; }
  };
}
