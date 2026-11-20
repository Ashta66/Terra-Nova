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
  let storeRevision = 0;

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

  function sampleAtLevel(longitude, latitude, level = 0) {
    const stride = 2 ** clamp(Math.floor(level), 0, 4);
    const normalized = normalizeLongitude(longitude);
    const sampleX = normalized / 360 * grid.width - 0.5;
    const sampleY = clamp((90 - latitude) / 180 * grid.height - 0.5, 0, grid.height - 1);
    const coarseWidth = Math.ceil(grid.width / stride);
    const coarseHeight = Math.ceil(grid.height / stride);
    const coarseX = sampleX / stride;
    const coarseY = sampleY / stride;
    const rawX = Math.floor(coarseX);
    const rawY = Math.floor(coarseY);
    const x0 = ((rawX % coarseWidth) + coarseWidth) % coarseWidth;
    const x1 = (x0 + 1) % coarseWidth;
    const y0 = clamp(rawY, 0, coarseHeight - 1);
    const y1 = Math.min(coarseHeight - 1, y0 + 1);
    const fx = coarseX - rawX;
    const fy = coarseY - rawY;
    const at = (column, row) => {
      const sourceX = Math.min(grid.width - 1, column * stride);
      const sourceY = Math.min(grid.height - 1, row * stride);
      const tile = getTile(Math.floor(sourceX / tileSize), Math.floor(sourceY / tileSize));
      return tile.values[(sourceY - tile.originY) * tile.width + sourceX - tile.originX];
    };
    const a = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
    const b = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
    return a * (1 - fy) + b * fy;
  }

  function sampleBilinear(longitude, latitude, level = 0) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(level)) return null;
    const boundedLevel = clamp(level, 0, 4);
    const lower = Math.floor(boundedLevel);
    const blend = boundedLevel - lower;
    const coarse = sampleAtLevel(longitude, latitude, lower);
    if (blend <= 0 || lower >= 4) return coarse;
    const finer = sampleAtLevel(longitude, latitude, lower + 1);
    return coarse * (1 - blend) + finer * blend;
  }

  function sampleLod(longitude, latitude, level = 0) {
    return sampleBilinear(longitude, latitude, level);
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
    storeRevision++;
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
    if (!tile || tile.dirty || snapshot.id !== tile.id || snapshot.width !== tile.width
      || snapshot.height !== tile.height || snapshot.values.length !== tile.values.length) return false;
    const values = snapshot.values.slice();
    modifiedTiles.set(tile.id, { values, revision: Math.max(0, snapshot.revision) });
    storeRevision++;
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

  function preloadViewport(viewport = {}, preloadOptions = {}) {
    const zoom = Math.max(0.01, Number(viewport.zoom) || 1);
    const centerLongitude = Number(viewport.centerLongitude) || 0;
    const centerLatitude = clamp(Number(viewport.centerLatitude) || 0, -90, 90);
    const padding = clamp(Number(preloadOptions.padding ?? 0.5), 0, 2);
    const lookAhead = clamp(Number(preloadOptions.lookAhead ?? 0), 0, 1);
    const directionLongitude = Math.sign(Number(preloadOptions.directionLongitude) || 0);
    const directionLatitude = Math.sign(Number(preloadOptions.directionLatitude) || 0);
    const baseLon = 180 / zoom;
    const baseLat = 90 / zoom;
    const primaryLon = baseLon * (1 + padding);
    const primaryLat = baseLat * (1 + padding);

    // Le viewport courant est prioritaire : les tuiles prédictives sont
    // chargées d'abord afin que la limite LRU ne puisse pas évincer le visible.
    function collect(centerLon, centerLat, halfLon, halfLat) {
      const firstColumn = Math.floor((centerLon - halfLon + 180) / 360 * grid.width - 0.5);
      const lastColumn = Math.ceil((centerLon + halfLon + 180) / 360 * grid.width - 0.5);
      const firstRow = clamp(Math.floor((90 - Math.min(90, centerLat + halfLat)) / 180 * grid.height - 0.5), 0, grid.height - 1);
      const lastRow = clamp(Math.ceil((90 - Math.max(-90, centerLat - halfLat)) / 180 * grid.height - 0.5), 0, grid.height - 1);
      const tileXs = new Set();
      if (lastColumn - firstColumn + 1 >= grid.width) {
        for (let x = 0; x < columns; x++) tileXs.add(x);
      } else {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const wrapped = ((column % grid.width) + grid.width) % grid.width;
          tileXs.add(Math.floor(wrapped / tileSize));
        }
      }
      const result = [];
      for (let y = Math.floor(firstRow / tileSize); y <= Math.floor(lastRow / tileSize); y++) {
        for (const x of tileXs) {
          const dx = Math.min(Math.abs(x * tileSize + tileSize / 2 - ((normalizeLongitude(centerLon) / 360) * grid.width)),
            grid.width - Math.abs(x * tileSize + tileSize / 2 - ((normalizeLongitude(centerLon) / 360) * grid.width)));
          const dy = Math.abs(y * tileSize + tileSize / 2 - ((90 - centerLat) / 180 * grid.height));
          result.push({ x, y, distance: dx * dx + dy * dy });
        }
      }
      result.sort((a, b) => a.distance - b.distance);
      return result;
    }

    // Prépare aussi les tuiles couvertes par les prochains crans de zoom.
    // Les zooms sortants apportent surtout de nouvelles tuiles périphériques;
    // les zooms entrants réchauffent le sous-ensemble qui sera immédiatement visible.
    const requestedZooms = [...new Set((preloadOptions.zoomLevels ?? [])
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0 && value !== zoom))];
    const zoomAhead = requestedZooms
      .sort((a, b) => Math.abs(Math.log2(b / zoom)) - Math.abs(Math.log2(a / zoom)))
      .flatMap(targetZoom => collect(
        centerLongitude, centerLatitude,
        180 / targetZoom * (1 + padding),
        90 / targetZoom * (1 + padding)
      ));
    const predictive = lookAhead > 0 && (directionLongitude || directionLatitude)
      ? collect(
        centerLongitude + directionLongitude * primaryLon * (1.15 + lookAhead * 0.4),
        clamp(centerLatitude + directionLatitude * primaryLat * (1.15 + lookAhead * 0.4), -90, 90),
        primaryLon * 0.35,
        primaryLat * 0.35
      )
      : [];
    const current = collect(centerLongitude, centerLatitude, primaryLon, primaryLat);
    const ordered = new Map();
    for (const item of zoomAhead) ordered.set(tileId(item.x, item.y), item);
    for (const item of predictive) ordered.set(tileId(item.x, item.y), item);
    for (const item of current) {
      const id = tileId(item.x, item.y);
      ordered.delete(id);
      ordered.set(id, item);
    }
    const requestedIds = [...ordered.keys()];
    for (const id of requestedIds) {
      const [, x, y] = id.split("/").map(Number);
      getTile(x, y);
    }
    if (!preloadOptions.retainExisting) evictUnused(requestedIds);
    const loaded = new Set(cache.keys());
    return requestedIds.filter(id => loaded.has(id));
  }

  return {
    tileSize, columns, rows, width: grid.width, height: grid.height,
    getTile, getTileAt, sample, sampleBilinear, sampleLod, setElevation, markPersisted, restoreTile, setOnTileChange, evictUnused, preloadViewport,
    get size() { return cache.size; },
    get revision() { return storeRevision; },
    get loadedIds() { return [...cache.keys()]; },
    getTileId(x, y) { return x >= 0 && x < columns && y >= 0 && y < rows ? tileId(x, y) : null; }
  };
}
