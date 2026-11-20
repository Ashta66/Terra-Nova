const DEFAULT_CELL_SIZE = 10;
const MAX_CELLS_PER_FEATURE = 120;
const indexCache = new WeakMap();
const MAX_QUERY_CACHE_ENTRIES = 48;

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
  return { collection, cellSize: size, columns, rows, cells, global, bounds, queryCache: new Map() };
}

export function queryGeoSpatialIndex(index, viewport = {}) {
  if (!index?.collection) throw new TypeError("Index spatial invalide.");
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  if (zoom <= 1.001) return index.collection;
  const centerLongitude = Number(viewport.centerLongitude ?? 0);
  const centerLatitude = Number(viewport.centerLatitude ?? 0);
  const west = Math.max(-180, centerLongitude - 180 / zoom);
  const east = Math.min(180, centerLongitude + 180 / zoom);
  const south = Math.max(-90, centerLatitude - 90 / zoom);
  const north = Math.min(90, centerLatitude + 90 / zoom);
  const minX = longitudeCell(west, index.columns, index.cellSize);
  const maxX = longitudeCell(east, index.columns, index.cellSize);
  const minY = latitudeCell(north, index.rows, index.cellSize);
  const maxY = latitudeCell(south, index.rows, index.cellSize);

  // Les positions voisines qui restent dans les mêmes cellules réutilisent
  // exactement la même sélection, sans recréer le tableau GeoJSON à chaque frame.
  const cacheKey = `${minX}:${maxX}:${minY}:${maxY}`;
  const cached = index.queryCache.get(cacheKey);
  if (cached) {
    index.queryCache.delete(cacheKey);
    index.queryCache.set(cacheKey, cached);
    return cached;
  }

  const selected = new Set(index.global);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (const featureIndex of index.cells.get(y * index.columns + x) ?? []) selected.add(featureIndex);
    }
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


/**
 * Prépare les sélections des cellules voisines pendant les périodes calmes.
 * Le résultat courant reste prioritaire ; les voisins ne sont que des entrées
 * de cache et ne modifient jamais les données géographiques sources.
 */
export function prefetchGeoSpatialFeatures(collection, viewport = {}, radius = 1) {
  if (!collection?.features || !Number.isFinite(Number(viewport.zoom)) || Number(viewport.zoom) <= 1.001) return 0;
  let index = indexCache.get(collection);
  if (!index) {
    index = buildGeoSpatialIndex(collection);
    indexCache.set(collection, index);
  }
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  const lonSpan = 360 / zoom;
  const latSpan = 180 / zoom;
  const steps = Math.max(0, Math.min(1, Math.floor(Number(radius) || 0)));
  let prepared = 0;
  for (let y = -steps; y <= steps; y++) {
    for (let x = -steps; x <= steps; x++) {
      if (x === 0 && y === 0) continue;
      const centerLongitude = Number(viewport.centerLongitude ?? 0) + x * lonSpan;
      const centerLatitude = Math.max(-90, Math.min(90, Number(viewport.centerLatitude ?? 0) + y * latSpan));
      if (centerLongitude < -180 || centerLongitude > 180) continue;
      queryGeoSpatialIndex(index, { zoom, centerLongitude, centerLatitude });
      prepared++;
    }
  }
  return prepared;
}
