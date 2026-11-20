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
  let clock = 0;

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
        if (id !== protectedId) { candidateId = id; break; }
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
    const tile = {
      id, level: 0, x, y, originX, originY, width, height, values,
      revision: 0, dirty: false, lastUsed: 0
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
    return true;
  }

  function evictUnused(keepIds = []) {
    const keep = new Set(keepIds);
    let removed = 0;
    for (const id of cache.keys()) {
      if (!keep.has(id)) { cache.delete(id); removed++; }
    }
    return removed;
  }

  return {
    tileSize, columns, rows,
    getTile, getTileAt, sample, setElevation, evictUnused,
    get size() { return cache.size; },
    get loadedIds() { return [...cache.keys()]; },
    getTileId(x, y) { return x >= 0 && x < columns && y >= 0 && y < rows ? tileId(x, y) : null; }
  };
}
