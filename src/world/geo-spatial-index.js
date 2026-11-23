const DEFAULT_CELL_SIZE = 10;
const MAX_CELLS_PER_FEATURE = 120;
const indexCache = new WeakMap();
const MAX_QUERY_CACHE_ENTRIES = 64;
const MAX_TILE_CACHE_ENTRIES = 256;
const MAX_PREFETCH_RADIUS = 1;

function getBounds(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pending = [feature?.geometry];
  while (pending.length) {
    const value = pending.pop();
    if (!value) continue;
    if (value.type === "GeometryCollection") {
      const geometries = value.geometries ?? [];
      for (let i = 0; i < geometries.length; i++) pending.push(geometries[i]);
      continue;
    }
    if (value.coordinates) pending.push(value.coordinates);
    if (Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
      continue;
    }
    if (Array.isArray(value)) for (let i = 0; i < value.length; i++) pending.push(value[i]);
  }
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
  for (let index = 0; index < collection.features.length; index++) {
    const feature = collection.features[index];
    const box = getBounds(feature);
    bounds[index] = box;
    if (!box) { global.push(index); continue; }
    const west = longitudeCell(Math.max(-180, box.minX), columns, size);
    const east = longitudeCell(Math.min(180, box.maxX), columns, size);
    const north = latitudeCell(Math.min(90, box.maxY), rows, size);
    const south = latitudeCell(Math.max(-90, box.minY), rows, size);
    const count = (east - west + 1) * (south - north + 1);
    if (count > MAX_CELLS_PER_FEATURE || box.maxX - box.minX > 180) {
      global.push(index);
      continue;
    }
    for (let y = north; y <= south; y++) {
      for (let x = west; x <= east; x++) {
        const key = y * columns + x;
        let bucket = cells.get(key);
        if (!bucket) cells.set(key, bucket = []);
        bucket.push(index);
      }
    }
  }
  return {
    collection, cellSize: size, columns, rows, cells, global, bounds,
    queryCache: new Map(), tileCache: new Map(), tileHits: 0, tileMisses: 0,
    featureMarks: new Uint32Array(collection.features.length), featureMark: 0,
    queryMarks: new Uint32Array(collection.features.length), queryMark: 0
  };
}

function nextFeatureMark(index, query = false) {
  const marks = query ? index.queryMarks : index.featureMarks;
  const key = query ? "queryMark" : "featureMark";
  index[key] = (index[key] + 1) >>> 0;
  if (index[key] === 0) {
    marks.fill(0);
    index[key] = 1;
  }
  return index[key];
}

function getTileFeatureIndices(index, tileId) {
  const key = tileId;
  const x = tileId % index.columns;
  const y = Math.floor(tileId / index.columns);
  const cached = index.tileCache.get(key);
  if (cached) {
    index.tileCache.delete(key);
    index.tileCache.set(key, cached);
    index.tileHits++;
    return cached;
  }
  index.tileMisses++;
  const mark = nextFeatureMark(index);
  const marks = index.featureMarks;
  const ordered = [];
  for (const featureIndex of index.global) {
    if (marks[featureIndex] === mark) continue;
    marks[featureIndex] = mark;
    ordered.push(featureIndex);
  }
  for (const featureIndex of index.cells.get(y * index.columns + x) ?? []) {
    if (marks[featureIndex] === mark) continue;
    marks[featureIndex] = mark;
    ordered.push(featureIndex);
  }
  ordered.sort((a, b) => a - b);
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
  let minX1, maxX1, minX2 = 0, maxX2 = -1, rangeCount = 1;
  if (rawWest < -180) {
    minX1 = longitudeCell(Math.max(-180, rawWest + 360), index.columns, index.cellSize);
    maxX1 = longitudeCell(180, index.columns, index.cellSize);
    minX2 = longitudeCell(-180, index.columns, index.cellSize);
    maxX2 = longitudeCell(Math.min(180, rawEast), index.columns, index.cellSize);
    rangeCount = 2;
  } else if (rawEast > 180) {
    minX1 = longitudeCell(Math.max(-180, rawWest), index.columns, index.cellSize);
    maxX1 = longitudeCell(180, index.columns, index.cellSize);
    minX2 = longitudeCell(-180, index.columns, index.cellSize);
    maxX2 = longitudeCell(Math.min(180, rawEast - 360), index.columns, index.cellSize);
    rangeCount = 2;
  } else {
    minX1 = longitudeCell(Math.max(-180, rawWest), index.columns, index.cellSize);
    maxX1 = longitudeCell(Math.min(180, rawEast), index.columns, index.cellSize);
  }
  return { minY, maxY, minX1, maxX1, minX2, maxX2, rangeCount };
}

function getVisibleTileKeys(index, viewport) {
  const { minY, maxY, minX1, maxX1, minX2, maxX2, rangeCount } = getViewportTileRanges(index, viewport);
  const keys = [];
  for (let y = minY; y <= maxY; y++) {
    const rowOffset = y * index.columns;
    for (let x = minX1; x <= maxX1; x++) keys.push(rowOffset + x);
    if (rangeCount === 2) {
      for (let x = minX2; x <= maxX2; x++) keys.push(rowOffset + x);
    }
  }
  return keys;
}

function queryGeoSpatialIndexForTiles(index, tileKeys) {
  const cacheKey = tileKeys.join(",");
  const cached = index.queryCache.get(cacheKey);
  if (cached) {
    index.queryCache.delete(cacheKey);
    index.queryCache.set(cacheKey, cached);
    return cached;
  }

  const mark = nextFeatureMark(index, true);
  const marks = index.queryMarks;
  const ordered = [];
  for (const tileId of tileKeys) {
    for (const featureIndex of getTileFeatureIndices(index, tileId)) {
      if (marks[featureIndex] === mark) continue;
      marks[featureIndex] = mark;
      ordered.push(featureIndex);
    }
  }
  ordered.sort((a, b) => a - b);
  let result = index.collection;
  if (ordered.length !== index.collection.features.length) {
    const features = new Array(ordered.length);
    for (let i = 0; i < ordered.length; i++) features[i] = index.collection.features[ordered[i]];
    result = { ...index.collection, features };
  }
  index.queryCache.set(cacheKey, result);
  if (index.queryCache.size > MAX_QUERY_CACHE_ENTRIES) {
    index.queryCache.delete(index.queryCache.keys().next().value);
  }
  return result;
}

export function queryGeoSpatialIndex(index, viewport = {}) {
  if (!index?.collection) throw new TypeError("Index spatial invalide.");
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  if (zoom <= 1.001) return index.collection;

  // Une tuile vectorielle correspond à une cellule géographique stable de la grille.
  // Les coordonnées sources ne sont jamais découpées : une entité est référencée
  // dans les tuiles qu'elle intersecte, puis dédupliquée au niveau du viewport.
  return queryGeoSpatialIndexForTiles(index, getVisibleTileKeys(index, viewport));
}

export function selectGeoSpatialFeatures(collection, viewport = {}) {
  if (!collection?.features) return collection;
  // À l'échelle mondiale, toutes les entités sont visibles : construire l'index
  // ici ne ferait qu'ajouter un gros travail synchrone au premier affichage.
  if (Math.max(1, Number(viewport.zoom) || 1) <= 1.001) return collection;
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  return queryGeoSpatialIndex(index, viewport);
}

/**
 * Prépare au repos les secteurs qui entourent le viewport et ceux situés
 * devant le mouvement. Les sélections restent dans le cache LRU existant :
 * aucune géométrie ni image supplémentaire n'est conservée.
 */
export function prefetchGeoSpatialFeatures(collection, viewport = {}, radius = 1, options = {}) {
  if (!collection?.features || !Number.isFinite(Number(viewport.zoom)) || Number(viewport.zoom) <= 1.001) return 0;
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  const zoomDirection = Math.max(-1, Math.min(1, Number(options.zoomDirection) || 0));
  const prefetchZoom = zoomDirection < -0.05 ? Math.max(1, zoom * 0.78) : zoom;
  const coverage = Math.max(1, Math.min(2.2, Number(options.coverage) || 1.6));
  const lookAhead = Math.max(0, Math.min(1, Number(options.lookAhead) || 0.55));
  const direction = options.direction ?? {};
  const dx = Number(direction.x) || 0;
  const dy = Number(direction.y) || 0;
  const magnitude = Math.hypot(dx, dy);
  const nx = magnitude > 0.001 ? dx / magnitude : 0;
  const ny = magnitude > 0.001 ? dy / magnitude : 0;
  const centerLongitude = wrapLongitude(Number(viewport.centerLongitude ?? 0) + nx * (180 / zoom) * lookAhead);
  const centerLatitude = Math.max(-89.9, Math.min(89.9,
    Number(viewport.centerLatitude ?? 0) - ny * (90 / zoom) * lookAhead));
  const halfLon = Math.min(180, (180 / prefetchZoom) * coverage);
  const halfLat = Math.min(90, (90 / prefetchZoom) * coverage);
  const minX = Math.max(1, Math.ceil(halfLon * 2 / index.cellSize / 2));
  const minY = Math.max(1, Math.ceil(halfLat * 2 / index.cellSize / 2));
  const spanX = Math.min(4, minX + Math.min(2, Math.floor(Number(radius) || 0)));
  const spanY = Math.min(4, minY + Math.min(2, Math.floor(Number(radius) || 0)));
  const centerX = longitudeCell(centerLongitude, index.columns, index.cellSize);
  const centerY = latitudeCell(centerLatitude, index.rows, index.cellSize);
  const budget = Math.min(24, Math.max(8, (MAX_TILE_CACHE_ENTRIES / 4)));
  const candidates = [];
  // Avec la grille par défaut (36 colonnes), la fenêtre de préchargement
  // ne peut pas reboucler sur elle-même : éviter un Set sur ce chemin courant.
  const seen = index.columns < spanX * 2 + 1 ? new Set() : null;
  for (let oy = -spanY; oy <= spanY; oy++) {
    const tileY = centerY + oy;
    if (tileY < 0 || tileY >= index.rows) continue;
    for (let ox = -spanX; ox <= spanX; ox++) {
      const tileX = (centerX + ox + index.columns) % index.columns;
      const key = tileY * index.columns + tileX;
      if (seen?.has(key)) continue;
      seen?.add(key);
      const distance = Math.hypot(ox / Math.max(1, spanX), oy / Math.max(1, spanY));
      const forward = ox * nx + oy * ny;
      const candidate = { tileX, tileY, score: distance - forward * 0.35 };
      // Maintient uniquement les meilleurs secteurs : pas de tri complet
      // ni de tableau temporaire slice() à chaque préchargement.
      let low = 0, high = candidates.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (candidates[middle].score <= candidate.score) low = middle + 1;
        else high = middle;
      }
      if (low < budget) {
        candidates.splice(low, 0, candidate);
        if (candidates.length > budget) candidates.pop();
      } else if (candidates.length < budget) candidates.push(candidate);
    }
  }
  let prepared = 0;
  for (const tile of candidates) {
    getTileFeatureIndices(index, tile.tileY * index.columns + tile.tileX);
    prepared++;
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
  const tileIds = getVisibleTileKeys(index, viewport);
  const tileKeys = tileIds.map(tileId => `${tileId % index.columns}:${Math.floor(tileId / index.columns)}`);
  const selected = queryGeoSpatialIndexForTiles(index, tileIds);
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
