const DEFAULT_CELL_SIZE = 10;
const MAX_CELLS_PER_FEATURE = 120;
const indexCache = new WeakMap();
const MAX_QUERY_CACHE_ENTRIES = 48;
const MAX_TILE_CACHE_ENTRIES = 96;
const MAX_PREFETCH_RADIUS = 1;

function getBounds(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = value => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
      return;
    }
    for (const child of value) visit(child);
  };
  const walk = geometry => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") {
      for (const child of geometry.geometries ?? []) walk(child);
    } else visit(geometry.coordinates);
  };
  walk(feature?.geometry);
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function longitudeCell(longitude, columns, cellSize) {
  return Math.max(0, Math.min(columns - 1, Math.floor((longitude + 180) / cellSize)));
}
function latitudeCell(latitude, rows, cellSize) {
  return Math.max(0, Math.min(rows - 1, Math.floor((90 - latitude) / cellSize)));
}
function wrapLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function buildGeoSpatialIndex(collection, cellSize = DEFAULT_CELL_SIZE) {
  if (!collection?.features || !Array.isArray(collection.features)) {
    throw new TypeError("Une FeatureCollection est requise pour indexer les secteurs.");
  }
  const size = Math.max(1, Number(cellSize) || DEFAULT_CELL_SIZE);
  const columns = Math.ceil(360 / size), rows = Math.ceil(180 / size);
  const cells = new Map();
  const global = [];
  const bounds = new Array(collection.features.length);
  collection.features.forEach((feature, index) => {
    const box = getBounds(feature);
    bounds[index] = box;
    if (!box) { global.push(index); return; }
    const west = longitudeCell(Math.max(-180, box.minX), columns, size);
    const east = longitudeCell(Math.min(180, box.maxX), columns, size);
    const north = latitudeCell(Math.min(90, box.maxY), rows, size);
    const south = latitudeCell(Math.max(-90, box.minY), rows, size);
    const count = (east - west + 1) * (south - north + 1);
    if (count > MAX_CELLS_PER_FEATURE || box.maxX - box.minX > 180) {
      global.push(index);
      return;
    }
    for (let y = north; y <= south; y++) {
      for (let x = west; x <= east; x++) {
        const key = y * columns + x;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(index);
      }
    }
  });
  return {
    collection, cellSize: size, columns, rows, cells, global, bounds,
    queryCache: new Map(), tileCache: new Map(), tileHits: 0, tileMisses: 0
  };
}

function getTileFeatureIndices(index, x, y) {
  const key = `${x}:${y}`;
  const cached = index.tileCache.get(key);
  if (cached) {
    index.tileCache.delete(key);
    index.tileCache.set(key, cached);
    index.tileHits++;
    return cached;
  }
  index.tileMisses++;
  const ids = new Set(index.global);
  for (const featureIndex of index.cells.get(y * index.columns + x) ?? []) ids.add(featureIndex);
  const ordered = [...ids].sort((a, b) => a - b);
  index.tileCache.set(key, ordered);
  if (index.tileCache.size > MAX_TILE_CACHE_ENTRIES) {
    index.tileCache.delete(index.tileCache.keys().next().value);
  }
  return ordered;
}

function getViewportTileRanges(index, viewport) {
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  const centerLongitude = wrapLongitude(Number(viewport.centerLongitude ?? 0));
  const centerLatitude = Number(viewport.centerLatitude ?? 0);
  const halfSpan = 180 / zoom;
  const rawWest = centerLongitude - halfSpan;
  const rawEast = centerLongitude + halfSpan;
  const south = Math.max(-90, centerLatitude - 90 / zoom);
  const north = Math.min(90, centerLatitude + 90 / zoom);
  const minY = latitudeCell(north, index.rows, index.cellSize);
  const maxY = latitudeCell(south, index.rows, index.cellSize);
  const longitudeRanges = rawWest < -180
    ? [[rawWest + 360, 180], [-180, rawEast]]
    : rawEast > 180
      ? [[rawWest, 180], [-180, rawEast - 360]]
      : [[rawWest, rawEast]];
  const xRanges = longitudeRanges.map(([west, east]) => [
    longitudeCell(Math.max(-180, west), index.columns, index.cellSize),
    longitudeCell(Math.min(180, east), index.columns, index.cellSize)
  ]);
  return { minY, maxY, xRanges };
}

function getVisibleTileKeys(index, viewport) {
  const { minY, maxY, xRanges } = getViewportTileRanges(index, viewport);
  const keys = [];
  for (let y = minY; y <= maxY; y++) {
    for (const [minX, maxX] of xRanges) {
      for (let x = minX; x <= maxX; x++) keys.push([x, y]);
    }
  }
  return keys;
}

export function queryGeoSpatialIndex(index, viewport = {}) {
  if (!index?.collection) throw new TypeError("Index spatial invalide.");
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  if (zoom <= 1.001) return index.collection;

  // Une tuile vectorielle correspond à une cellule géographique stable de la grille.
  // Les coordonnées sources ne sont jamais découpées : une entité est référencée
  // dans les tuiles qu'elle intersecte, puis dédupliquée au niveau du viewport.
  const tileKeys = getVisibleTileKeys(index, viewport);
  const cacheKey = tileKeys.map(([x, y]) => `${x}:${y}`).join("|");
  const cached = index.queryCache.get(cacheKey);
  if (cached) {
    index.queryCache.delete(cacheKey);
    index.queryCache.set(cacheKey, cached);
    return cached;
  }

  const selected = new Set();
  for (const [x, y] of tileKeys) {
    for (const featureIndex of getTileFeatureIndices(index, x, y)) selected.add(featureIndex);
  }
  const ordered = [...selected].sort((a, b) => a - b);
  const result = ordered.length === index.collection.features.length
    ? index.collection
    : { ...index.collection, features: ordered.map(featureIndex => index.collection.features[featureIndex]) };
  index.queryCache.set(cacheKey, result);
  if (index.queryCache.size > MAX_QUERY_CACHE_ENTRIES) {
    index.queryCache.delete(index.queryCache.keys().next().value);
  }
  return result;
}

export function selectGeoSpatialFeatures(collection, viewport = {}) {
  if (!collection?.features) return collection;
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  return queryGeoSpatialIndex(index, viewport);
}

/** Prépare les tuiles voisines au repos ; aucune donnée source n'est dupliquée. */
export function prefetchGeoSpatialFeatures(collection, viewport = {}, radius = 1) {
  if (!collection?.features || !Number.isFinite(Number(viewport.zoom)) || Number(viewport.zoom) <= 1.001) return 0;
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  const steps = Math.max(0, Math.min(MAX_PREFETCH_RADIUS, Math.floor(Number(radius) || 0)));
  const centerLongitude = wrapLongitude(Number(viewport.centerLongitude ?? 0));
  const centerLatitude = Number(viewport.centerLatitude ?? 0);
  const x = longitudeCell(centerLongitude, index.columns, index.cellSize);
  const y = latitudeCell(centerLatitude, index.rows, index.cellSize);
  let prepared = 0;
  for (let dy = -steps; dy <= steps; dy++) {
    for (let dx = -steps; dx <= steps; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tileY = y + dy;
      if (tileY < 0 || tileY >= index.rows) continue;
      const tileX = (x + dx + index.columns) % index.columns;
      getTileFeatureIndices(index, tileX, tileY);
      prepared++;
    }
  }
  return prepared;
}

export function getGeoSpatialTilePlan(collection, viewport = {}) {
  if (!collection?.features) return { tileKeys: [], visibleTileCount: 0, featureCount: 0 };
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  if (zoom <= 1.001) return { tileKeys: [], visibleTileCount: 0, featureCount: collection.features.length };
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  const tileKeys = getVisibleTileKeys(index, viewport).map(([x, y]) => `${x}:${y}`);
  const selected = queryGeoSpatialIndex(index, viewport);
  return { tileKeys, visibleTileCount: tileKeys.length, featureCount: selected.features.length };
}

export function getGeoSpatialIndexStats(collection) {
  const index = collection && indexCache.get(collection);
  if (!index) return {
    indexed: false, featureCount: 0, cellCount: 0, cachedQueries: 0,
    maxCachedQueries: MAX_QUERY_CACHE_ENTRIES, cachedTiles: 0,
    maxCachedTiles: MAX_TILE_CACHE_ENTRIES, tileHits: 0, tileMisses: 0
  };
  return {
    indexed: true,
    featureCount: index.collection.features.length,
    cellCount: index.cells.size,
    cachedQueries: index.queryCache.size,
    maxCachedQueries: MAX_QUERY_CACHE_ENTRIES,
    cachedTiles: index.tileCache.size,
    maxCachedTiles: MAX_TILE_CACHE_ENTRIES,
    tileHits: index.tileHits,
    tileMisses: index.tileMisses
  };
}

export function clearGeoSpatialQueryCache(collection) {
  const index = collection && indexCache.get(collection);
  if (!index) return false;
  index.queryCache.clear();
  index.tileCache.clear();
  index.tileHits = 0;
  index.tileMisses = 0;
  return true;
}
