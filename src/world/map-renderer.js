import { projectCoordinate, createCoordinateProjector } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";
import { drawTerrainRaster, sampleElevation, isTerrainHillshadePrepared } from "./terrain.js";
import { renderTerrainWebGLTiles, getTerrainWebGLTileStats } from "./terrain-webgl.js";
import { selectGeoSpatialFeatures } from "./geo-spatial-index.js";

export const selectVisibleFeatures = selectGeoSpatialFeatures;

const BRITISH_TERRITORY_NAMES = new Set([
  "england", "english territory", "kingdom of england", "great britain", "britain",
  "british empire", "united kingdom", "united kingdom of great britain and ireland"
]);
const SPANISH_TERRITORY_NAMES = new Set(["castile", "aragon", "granada", "spain", "crown of castile", "spanish empire"]);
const PORTUGUESE_TERRITORY_NAMES = new Set(["portugal", "kingdom of portugal"]);
const CONTESTED_STATUSES = new Set(["contested", "disputed", "contesté", "disputé"]);
const INFLUENCE_STATUSES = new Set(["influence", "sphere-of-influence", "influence-zone", "non-state", "cultural"]);
const UNCLAIMED_STATUSES = new Set(["unclaimed", "unoccupied", "no-claim"]);
const TERRITORY_MATCH_FIELDS = ["NAME", "ADMIN", "name", "NAME_EN", "SOVEREIGNT", "NAME_LONG", "SUBJECTO"];
const TERRITORY_PALETTE = [
  "#B66F62", "#668D78", "#B18A4F", "#718BAF", "#9A769F", "#B47E91", "#6D9B9C",
  "#A28A62", "#7E86A8", "#A27B5D", "#78936B", "#B07862", "#64899B", "#A18A9A",
  "#9A9A61", "#8B765E", "#6F9A88", "#A77C75", "#7885A0", "#B08B69"
];
const TERRITORY_INFLUENCE_DASH = [3, 3];
const TERRITORY_CONTESTED_DASH = [2, 2];

/** Partitionne une collection en un seul passage, sans rappeler le test de capacité. */
export function partitionFeatures(features, supports) {
  const supported = [], unsupported = [];
  for (const feature of features ?? []) {
    (supports(feature) ? supported : unsupported).push(feature);
  }
  return { supported, unsupported };
}

function createContinuousProjector(width, height, projection, preparedProjector = null) {
  const viewport = projection.viewport ?? {};
  const centerLongitude = Number(viewport.centerLongitude ?? 0);
  const project = preparedProjector ?? createCoordinateProjector(width, height, projection.type === "orthographic"
    ? projection
    : { ...projection, viewport: { ...viewport, wrapLongitude: false } });
  let previousLongitude = null;
  return coordinate => {
    let longitude = coordinate[0];
    if (projection.type !== "orthographic") {
      if (previousLongitude === null) {
        longitude += 360 * Math.round((centerLongitude - longitude) / 360);
      } else {
        while (longitude - previousLongitude > 180) longitude -= 360;
        while (longitude - previousLongitude < -180) longitude += 360;
      }
      previousLongitude = longitude;
    }
    return project(longitude, coordinate[1]);
  };
}

// La tolérance et l'aire minimale sont exprimées en pixels projetés.
// En zoom arrière, on simplifie fortement ; en zoom rapproché, on restaure
// progressivement les détails côtiers et les petites îles.
export function getCoastSimplificationProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  if (level <= 1.5) return { tolerance: 2.5, minRingArea: 6 };
  if (level <= 4) return { tolerance: 2.05, minRingArea: 4.4 };
  if (level <= 10) return { tolerance: 1.65, minRingArea: 3.1 };
  return { tolerance: 1.3, minRingArea: 2.2 };
}

// Le masque physique reste plus léger que les contours d'habillage, mais son
// niveau de détail augmente lui aussi avec le zoom pour préserver les îles.
export function getLandCoastSimplificationProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  if (level <= 1.5) return { tolerance: 4.4, minRingArea: 60 };
  if (level <= 4) return { tolerance: 3.9, minRingArea: 40 };
  if (level <= 10) return { tolerance: 3.4, minRingArea: 24 };
  return { tolerance: 2.8, minRingArea: 14 };
}

// Les rives des lacs et mers intérieures suivent le même niveau de
// généralisation géométrique que le littoral marin.
export function getLakeCoastSimplificationProfile(zoom = 1) {
  return getLandCoastSimplificationProfile(zoom);
}

const lakeAreaScores = new WeakMap();
const MAX_VISIBLE_LAKES = 12;

function lakeGeographicArea(feature) {
  if (lakeAreaScores.has(feature)) return lakeAreaScores.get(feature);
  const bbox = feature?.bbox ?? feature?.geometry?.bbox;
  let area = 0;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const meanLatitude = (Number(bbox[1]) + Number(bbox[3])) / 2;
    area = Math.abs((Number(bbox[2]) - Number(bbox[0])) * 111.32 * Math.cos(meanLatitude * Math.PI / 180) * (Number(bbox[3]) - Number(bbox[1])) * 111.32);
  } else {
    let minLongitude = Infinity, maxLongitude = -Infinity;
    let minLatitude = Infinity, maxLatitude = -Infinity;
    const pending = [feature?.geometry?.coordinates];
    while (pending.length) {
      const value = pending.pop();
      if (!Array.isArray(value)) continue;
      if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
        minLongitude = Math.min(minLongitude, value[0]);
        maxLongitude = Math.max(maxLongitude, value[0]);
        minLatitude = Math.min(minLatitude, value[1]);
        maxLatitude = Math.max(maxLatitude, value[1]);
        continue;
      }
      for (let i = 0; i < value.length; i++) pending.push(value[i]);
    }
    if (minLongitude !== Infinity) {
      const meanLatitude = (minLatitude + maxLatitude) / 2;
      area = Math.abs((maxLongitude - minLongitude) * 111.32
        * Math.cos(meanLatitude * Math.PI / 180) * (maxLatitude - minLatitude) * 111.32);
    }
  }
  lakeAreaScores.set(feature, area);
  return area;
}

/** Rang normalisé des polygones glaciaires ; les données sans rang restent secondaires. */
export function getGlacierRenderStyle(feature) {
  const raw = feature?.properties?.scalerank ?? feature?.properties?.SCALERANK
    ?? feature?.properties?.min_zoom ?? feature?.properties?.MIN_ZOOM;
  const parsed = Number(raw);
  const rank = Number.isFinite(parsed) ? parsed : 1;
  if (rank <= 0) return { rank: 0, fillAlpha: 0.94, outlineAlpha: 0.86, outlineWidth: 0.9 };
  if (rank === 1) return { rank: 1, fillAlpha: 0.84, outlineAlpha: 0.68, outlineWidth: 0.72 };
  if (rank === 2) return { rank: 2, fillAlpha: 0.72, outlineAlpha: 0.5, outlineWidth: 0.58 };
  return { rank, fillAlpha: 0.58, outlineAlpha: 0.36, outlineWidth: 0.46 };
}

/** Hiérarchie visuelle des lacs selon leur rang cartographique. */
export function getLakeRenderStyle(feature) {
  const raw = feature?.properties?.scalerank ?? feature?.properties?.SCALERANK
    ?? feature?.properties?.min_zoom ?? feature?.properties?.MIN_ZOOM;
  const rank = Number(raw);
  const normalizedRank = Number.isFinite(rank) ? rank : 1;
  if (normalizedRank <= 0) return { rank: 0, fillAlpha: 0.96, outlineAlpha: 0.82, outlineWidth: 0.82 };
  if (normalizedRank === 1) return { rank: 1, fillAlpha: 0.86, outlineAlpha: 0.66, outlineWidth: 0.68 };
  if (normalizedRank === 2) return { rank: 2, fillAlpha: 0.72, outlineAlpha: 0.48, outlineWidth: 0.56 };
  return { rank: normalizedRank, fillAlpha: 0.58, outlineAlpha: 0.34, outlineWidth: 0.44 };
}

const sortedLakeFeatureCollections = new WeakMap();

/** Ne conserve que les 12 lacs les plus importants parmi les entités visibles. */
export function selectMajorLakeFeatures(collection, maxRank = 1, maxFeatures = MAX_VISIBLE_LAKES) {
  if (!collection?.features) return [];
  let profiles = sortedLakeFeatureCollections.get(collection);
  if (!profiles) {
    profiles = new Map();
    sortedLakeFeatureCollections.set(collection, profiles);
  }
  const rankKey = String(maxRank);
  let sorted = profiles.get(rankKey);
  if (!sorted) {
    const candidates = [];
    for (let index = 0; index < collection.features.length; index++) {
      const feature = collection.features[index];
      const geometryType = feature?.geometry?.type;
      if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") continue;
      const properties = feature.properties;
      const rawRank = properties?.scalerank ?? properties?.SCALERANK
        ?? properties?.min_zoom ?? properties?.MIN_ZOOM;
      const rank = Number(rawRank);
      const normalizedRank = Number.isFinite(rank) ? rank : 1;
      if (normalizedRank <= maxRank) candidates.push({ feature, rank: normalizedRank, index });
    }
    candidates.sort((a, b) => a.rank - b.rank
      || lakeGeographicArea(b.feature) - lakeGeographicArea(a.feature)
      || a.index - b.index);
    sorted = new Array(candidates.length);
    for (let index = 0; index < candidates.length; index++) sorted[index] = candidates[index].feature;
    profiles.set(rankKey, sorted);
  }
  const limit = Math.max(0, maxFeatures);
  return sorted.length <= limit ? sorted : sorted.slice(0, limit);
}


const EARTH_RADIUS_KM=6371,MIN_ISLAND_AREA_KM2=100,MIN_LAKE_AREA_KM2=500;
function ringAreaKm2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b)
      || !Number.isFinite(Number(a[0])) || !Number.isFinite(Number(a[1]))
      || !Number.isFinite(Number(b[0])) || !Number.isFinite(Number(b[1]))) return 0;
    const longitudeA = Number(a[0]) * Math.PI / 180;
    const longitudeB = Number(b[0]) * Math.PI / 180;
    const latitudeA = Number(a[1]) * Math.PI / 180;
    const latitudeB = Number(b[1]) * Math.PI / 180;
    sum += (longitudeB - longitudeA) * (2 + Math.sin(latitudeA) + Math.sin(latitudeB));
  }
  return Math.abs(sum) * EARTH_RADIUS_KM * EARTH_RADIUS_KM / 2;
}
function polygonAreaKm2(polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return 0;
  let area = ringAreaKm2(polygon[0]);
  for (let i = 1; i < polygon.length; i++) area -= ringAreaKm2(polygon[i]);
  return Math.max(0, area);
}
export function filterSmallIslandComponents(collection, minAreaKm2 = MIN_ISLAND_AREA_KM2, preserveLargestPerFeature = false) {
  if (!collection?.features) return collection;
  const features = [];
  for (const feature of collection.features) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") {
      if (polygonAreaKm2(geometry.coordinates) >= minAreaKm2 || preserveLargestPerFeature) features.push(feature);
      continue;
    }
    if (geometry?.type !== "MultiPolygon") {
      features.push(feature);
      continue;
    }
    const polygons = geometry.coordinates ?? [];
    const kept = [];
    let largestPolygon = null, largestArea = -Infinity;
    for (let index = 0; index < polygons.length; index++) {
      const polygon = polygons[index];
      const area = polygonAreaKm2(polygon);
      if (area > largestArea) {
        largestArea = area;
        largestPolygon = polygon;
      }
      if (area >= minAreaKm2) kept.push(polygon);
    }
    if (!kept.length && preserveLargestPerFeature && largestPolygon) kept.push(largestPolygon);
    if (!kept.length) continue;
    const nextGeometry = kept.length === 1
      ? { type: "Polygon", coordinates: kept[0] }
      : { type: "MultiPolygon", coordinates: kept };
    const { bbox, ...rest } = feature;
    features.push({ ...rest, geometry: nextGeometry });
  }
  return { ...collection, features };
}
export function filterMajorLakeFeatures(collection, minAreaKm2 = MIN_LAKE_AREA_KM2) {
  if (!collection?.features) return collection;
  const features = [];
  for (const feature of collection.features) {
    const geometryType = feature?.geometry?.type;
    if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") continue;
    const properties = feature.properties ?? {};
    const rawRank = properties.scalerank ?? properties.SCALERANK
      ?? properties.min_zoom ?? properties.MIN_ZOOM;
    const rank = Number(rawRank);
    if (Number.isFinite(rank) && rank > 1) continue;
    if (lakeGeographicArea(feature) >= minAreaKm2) features.push(feature);
  }
  return { ...collection, features };
}

// Simplification Douglas-Peucker en pixels écran. La tolérance est donc
// constante visuellement : en zoomant, les détails géographiques réapparaissent.
function distanceToSegmentSquared(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const x = start.x + t * dx, y = start.y + t * dy;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

// Douglas-Peucker commun aux côtes et aux lignes : pile typée compacte,
// sans tableaux de paires ni callbacks filter créés à chaque segment.
function simplifyOpenPoints(input, tolerance) {
  if (input.length <= 2 || tolerance <= 0) return input;
  const keep = new Uint8Array(input.length);
  keep[0] = 1;
  keep[input.length - 1] = 1;
  const stack = new Int32Array(input.length * 2);
  let stackSize = 0;
  stack[stackSize++] = 0;
  stack[stackSize++] = input.length - 1;
  const threshold = tolerance * tolerance;
  while (stackSize > 0) {
    const last = stack[--stackSize];
    const first = stack[--stackSize];
    let maxDistance = threshold, farthest = -1;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegmentSquared(input[index], input[first], input[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack[stackSize++] = first;
      stack[stackSize++] = farthest;
      stack[stackSize++] = farthest;
      stack[stackSize++] = last;
    }
  }
  const result = [];
  for (let index = 0; index < input.length; index++) {
    if (keep[index]) result.push(input[index]);
  }
  return result;
}

export function simplifyClosedRing(points, tolerance = 0.55) {
  if (!Array.isArray(points) || points.length <= 4 || tolerance <= 0) return points ?? [];
  const ring = points.length > 1
    && points[0].x === points[points.length - 1].x
    && points[0].y === points[points.length - 1].y
    ? points.slice(0, -1)
    : points.slice();
  if (ring.length <= 3) return [...ring, ring[0]];

  // Une boucle fermée a des extrémités identiques : on la coupe au sommet
  // le plus éloigné du premier point pour éviter que DP ne l'efface entièrement.
  let split = 1, farthest = -1;
  for (let index = 1; index < ring.length; index++) {
    const distance = (ring[index].x - ring[0].x) ** 2 + (ring[index].y - ring[0].y) ** 2;
    if (distance > farthest) { farthest = distance; split = index; }
  }
  const firstHalf = simplifyOpenPoints(ring.slice(0, split + 1), tolerance);
  const secondInput = ring.slice(split);
  secondInput.push(ring[0]);
  const secondHalf = simplifyOpenPoints(secondInput, tolerance);
  const result = firstHalf.slice();
  for (let index = 1; index < secondHalf.length - 1; index++) result.push(secondHalf[index]);
  if (result.length < 3) return [...ring, ring[0]];
  result.push(result[0]);
  return result;
}

function simplifyOpenLine(points, tolerance = 0.5) {
  if (!Array.isArray(points) || points.length <= 2 || tolerance <= 0) return points ?? [];
  return simplifyOpenPoints(points, tolerance);
}

function projectedRingArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function traceRing(context, ring, width, height, projection, coastProfile, preparedProjector) {
  const project = createContinuousProjector(width, height, projection, preparedProjector);
  const projected = [];
  for (const coordinate of ring) {
    const point = project(coordinate);
    if (point) projected.push(point);
  }
  if (projected.length < 4) return 0;
  const simplified = simplifyClosedRing(projected, coastProfile.tolerance);
  // Les petits anneaux sous le seuil visuel sont ignorés à petite échelle.
  // Les grandes îles restent visibles ; les anneaux fins reviennent au zoom.
  if (projectedRingArea(simplified) < coastProfile.minRingArea) return 0;
  context.moveTo(simplified[0].x, simplified[0].y);
  for (let i = 1; i < simplified.length; i++) context.lineTo(simplified[i].x, simplified[i].y);
  context.closePath();
  return simplified.length;
}

function traceGeometry(context, geometry, width, height, projection, coastProfile = null) {
  if (!geometry) return false;
  const geometryType = geometry.type;
  if (geometryType === "Polygon" || geometryType === "MultiPolygon") {
    let vertices = 0;
    const preparedProjector = createCoordinateProjector(width, height, projection.type === "orthographic"
      ? projection : { ...projection, viewport: { ...(projection.viewport ?? {}), wrapLongitude: false } });
    const polygonProfile = coastProfile ?? { tolerance: 0.55, minRingArea: 0.7 };
    const polygons = geometryType === "Polygon" ? geometry.coordinates : geometry.coordinates ?? [];
    const polygonCount = geometryType === "Polygon" ? 1 : polygons.length;
    for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex++) {
      const polygon = geometryType === "Polygon" ? polygons : polygons[polygonIndex];
      if (!polygon?.length) continue;
      const exteriorCount = traceRing(context, polygon[0], width, height, projection, polygonProfile, preparedProjector);
      if (!exteriorCount) continue;
      vertices += exteriorCount;
      for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
        vertices += traceRing(context, polygon[ringIndex], width, height, projection, polygonProfile, preparedProjector);
      }
    }
    return vertices;
  }
  if (geometryType === "LineString" || geometryType === "MultiLineString") {
    let vertices = 0;
    const preparedProjector = createCoordinateProjector(width, height, projection.type === "orthographic"
      ? projection : { ...projection, viewport: { ...(projection.viewport ?? {}), wrapLongitude: false } });
    const lines = geometryType === "LineString" ? geometry.coordinates : geometry.coordinates ?? [];
    const lineCount = geometryType === "LineString" ? 1 : lines.length;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const line = geometryType === "LineString" ? lines : lines[lineIndex];
      if (!Array.isArray(line)) continue;
      let segment = [];
      const flushSegment = () => {
        const points = coastProfile ? simplifyOpenLine(segment, coastProfile.tolerance) : segment;
        if (points.length) {
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
          vertices += points.length;
        }
        segment = [];
      };
      const project = createContinuousProjector(width, height, projection, preparedProjector);
      for (const coordinate of line) {
        const point = project(coordinate);
        if (!point) { flushSegment(); continue; }
        segment.push(point);
      }
      flushSegment();
    }
    return vertices;
  }
  return 0;
}

const projectedPathCache = new WeakMap();
const projectedPathCacheLru = new Map();
const projectedViewportProfileCache = new Map();
const MAX_PROJECTED_VIEWPORT_PROFILES = 64;
const PROJECTED_PATHS_PER_FEATURE = 10;
const MAX_PROJECTED_PATHS = 4096;
const MAX_PROJECTED_PATH_VERTICES = 750_000;
let projectedPathVertexCount = 0;
let projectedPathCacheHits = 0;
let projectedPathCacheMisses = 0;
let projectedPathCacheBuilds = 0;
let projectedPathCacheEvictions = 0;
let projectedViewportProfileHits = 0;
let projectedViewportProfileMisses = 0;
let combinedLandMaskCacheHits = 0;
let combinedLandMaskCacheMisses = 0;
let combinedLandMaskCacheBuilds = 0;
let combinedLandMaskCacheEvictions = 0;
const antarcticLandClassificationCache = new WeakMap();
let antarcticClassificationCacheHits = 0;
let antarcticClassificationCacheMisses = 0;
let antarcticClassificationCoordinatesScanned = 0;
const landFeatureGroupCache = new WeakMap();
let landFeatureGroupCacheHits = 0;
let landFeatureGroupCacheMisses = 0;
const landWebGLClassificationCache = new WeakMap();
let landWebGLClassificationCacheHits = 0;
let landWebGLClassificationCacheMisses = 0;

function touchProjectedPath(entry, feature) {
  projectedPathCacheLru.delete(entry);
  projectedPathCacheLru.set(entry, feature);
}

function getProjectedViewportCacheProfile(width, height, projection, coastProfile) {
  const viewport = projection.viewport ?? {};
  const zoom = Math.max(1, Number(viewport.zoom ?? 1));
  const centerStep = 1 / zoom;
  const normalizedLongitude = ((((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360) - 180);
  const snappedLongitude = Math.round(normalizedLongitude / centerStep) * centerStep;
  const snappedLatitude = Math.round(Number(viewport.centerLatitude ?? 0) / centerStep) * centerStep;
  const pathProjection = {
    ...projection,
    viewport: { ...viewport, centerLongitude: snappedLongitude, centerLatitude: snappedLatitude }
  };
  // La clé conserve la précision des paramètres effectivement employés par projectCoordinate.
  const key = projection.type + ":" + width + ":" + height
    + ":" + zoom.toPrecision(12)
    + ":" + snappedLongitude.toPrecision(12) + ":" + snappedLatitude.toPrecision(12)
    + ":" + (coastProfile ? Number(coastProfile.tolerance).toPrecision(8) : "full")
    + ":" + (coastProfile ? Number(coastProfile.minRingArea).toPrecision(8) : "all");
  const cached = projectedViewportProfileCache.get(key);
  if (cached) {
    projectedViewportProfileHits++;
    projectedViewportProfileCache.delete(key);
    projectedViewportProfileCache.set(key, cached);
    return cached;
  }
  projectedViewportProfileMisses++;
  const profile = { pathProjection, key };
  projectedViewportProfileCache.set(key, profile);
  if (projectedViewportProfileCache.size > MAX_PROJECTED_VIEWPORT_PROFILES) {
    projectedViewportProfileCache.delete(projectedViewportProfileCache.keys().next().value);
  }
  return profile;
}

function getProjectedPath(feature, width, height, projection, coastProfile = null) {
  if (typeof Path2D === "undefined" || !feature?.geometry) return null;
  const profile = getProjectedViewportCacheProfile(width, height, projection, coastProfile);
  const key = profile.key;
  let entries = projectedPathCache.get(feature);
  if (!entries) {
    entries = new Map();
    projectedPathCache.set(feature, entries);
  }
  if (entries.has(key)) {
    projectedPathCacheHits++;
    const cached = entries.get(key);
    touchProjectedPath(cached, feature);
    return cached.path;
  }
  projectedPathCacheMisses++;
  projectedPathCacheBuilds++;
  const path = new Path2D();
  const vertexCount = traceGeometry(path, feature.geometry, width, height, profile.pathProjection, coastProfile);
  if (!vertexCount) return null;
  const entry = { key, path, vertexCount };
  entries.set(key, entry);
  touchProjectedPath(entry, feature);
  projectedPathVertexCount += vertexCount;
  while (entries.size > PROJECTED_PATHS_PER_FEATURE) {
    const oldest = entries.values().next().value;
    entries.delete(oldest.key);
    projectedPathCacheLru.delete(oldest);
    projectedPathVertexCount -= oldest.vertexCount;
    projectedPathCacheEvictions++;
  }
  while (projectedPathCacheLru.size > MAX_PROJECTED_PATHS || projectedPathVertexCount > MAX_PROJECTED_PATH_VERTICES) {
    const oldest = projectedPathCacheLru.entries().next().value;
    if (!oldest) break;
    const [oldestEntry, oldestFeature] = oldest;
    projectedPathCacheLru.delete(oldestEntry);
    projectedPathVertexCount -= oldestEntry.vertexCount;
    const oldestEntries = projectedPathCache.get(oldestFeature);
    if (oldestEntries?.get(oldestEntry.key) === oldestEntry) oldestEntries.delete(oldestEntry.key);
    projectedPathCacheEvictions++;
  }
  return path;
}

const combinedLandMaskCache = new Map();
const COMBINED_LAND_MASK_CACHE_LIMIT = 24;

/** Construit et met en cache le masque terrestre composé à partir des Path2D des features. */
export function buildLandClipPath(collection, width, height, projection, coastProfile) {
  if (typeof Path2D === "undefined") return null;
  const features = collection?.features ?? [];
  const profile = getProjectedViewportCacheProfile(width, height, projection, coastProfile);
  const key = profile.key + ":" + renderObjectId(features);
  const cached = combinedLandMaskCache.get(key);
  if (cached) {
    combinedLandMaskCacheHits++;
    combinedLandMaskCache.delete(key);
    combinedLandMaskCache.set(key, cached);
    return cached;
  }
  combinedLandMaskCacheMisses++;
  combinedLandMaskCacheBuilds++;
  const combined = new Path2D();
  if (typeof combined.addPath !== "function") return null;
  let appended = 0;
  for (const feature of features) {
    if (!feature?.geometry || isAntarcticLandFeature(feature)) continue;
    const cachedPath = getProjectedPath(feature, width, height, projection, coastProfile);
    if (cachedPath) {
      combined.addPath(cachedPath);
      appended++;
    } else if (traceGeometry(combined, feature.geometry, width, height, profile.pathProjection, coastProfile)) {
      appended++;
    }
  }
  if (!appended) return null;
  combinedLandMaskCache.set(key, combined);
  while (combinedLandMaskCache.size > COMBINED_LAND_MASK_CACHE_LIMIT) {
    combinedLandMaskCache.delete(combinedLandMaskCache.keys().next().value);
    combinedLandMaskCacheEvictions++;
  }
  return combined;
}


function isAntarcticLandFeature(feature) {
  if (!feature || typeof feature !== "object") return false;
  if (antarcticLandClassificationCache.has(feature)) {
    antarcticClassificationCacheHits++;
    return antarcticLandClassificationCache.get(feature);
  }
  antarcticClassificationCacheMisses++;
  const bbox = feature.bbox ?? feature.geometry?.bbox;
  let isAntarctic = false;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    isAntarctic = Number(bbox[1]) <= -70 && Number(bbox[3]) <= -60
      && Number(bbox[2]) - Number(bbox[0]) >= 300;
  } else {
    // Parcours itératif : certains GeoJSON côtiers contiennent des anneaux
    // de centaines de milliers de sommets. Le résultat est mémorisé par
    // identité de feature, car les collections géographiques sont immuables.
    const pending = [feature.geometry?.coordinates];
    let minLatitude = Infinity, maxLatitude = -Infinity;
    let minLongitude = Infinity, maxLongitude = -Infinity;
    let coordinateCount = 0;
    let scanned = 0;
    while (pending.length) {
      const value = pending.pop();
      if (!Array.isArray(value)) continue;
      if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
        const longitude = value[0], latitude = value[1];
        minLongitude = Math.min(minLongitude, longitude);
        maxLongitude = Math.max(maxLongitude, longitude);
        minLatitude = Math.min(minLatitude, latitude);
        maxLatitude = Math.max(maxLatitude, latitude);
        coordinateCount++;
        scanned++;
        continue;
      }
      for (let index = 0; index < value.length; index++) pending.push(value[index]);
    }
    antarcticClassificationCoordinatesScanned += scanned;
    isAntarctic = coordinateCount > 0 && minLatitude <= -70 && maxLatitude <= -60
      && maxLongitude - minLongitude >= 300;
  }
  antarcticLandClassificationCache.set(feature, isAntarctic);
  return isAntarctic;
}

function getLandFeatureGroups(features) {
  if (!Array.isArray(features)) return {
    landCoastFeatures: [], antarcticFeatures: [], landCoastFeatureSet: new Set()
  };
  const cached = landFeatureGroupCache.get(features);
  if (cached) {
    landFeatureGroupCacheHits++;
    return cached;
  }
  landFeatureGroupCacheMisses++;
  const landCoastFeatures = [];
  const antarcticFeatures = [];
  const landCoastFeatureSet = new Set();
  for (const feature of features) {
    if (isAntarcticLandFeature(feature)) {
      antarcticFeatures.push(feature);
      continue;
    }
    landCoastFeatures.push(feature);
    landCoastFeatureSet.add(feature);
  }
  const groups = { landCoastFeatures, antarcticFeatures, landCoastFeatureSet };
  landFeatureGroupCache.set(features, groups);
  return groups;
}

function getLandWebGLClassification(features, renderer, hasLandCoastFeature) {
  let collections = landWebGLClassificationCache.get(renderer);
  if (!collections) {
    collections = new WeakMap();
    landWebGLClassificationCache.set(renderer, collections);
  }
  let profiles = collections.get(features);
  if (!profiles) {
    profiles = new Map();
    collections.set(features, profiles);
  }
  const disableFill = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL === true;
  const disableCoast = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST === true;
  const key = (disableFill ? "1" : "0") + (disableCoast ? "1" : "0");
  const cached = profiles.get(key);
  if (cached) {
    landWebGLClassificationCacheHits++;
    return cached;
  }
  landWebGLClassificationCacheMisses++;
  const supportedLand = [];
  const unsupportedLand = [];
  const unsupportedLandFallback = [];
  const supportedCoasts = [];
  const unsupportedCoasts = [];
  for (const feature of features) {
    if (!isAntarcticLandFeature(feature)) {
      if (disableFill || !renderer.supports(feature)) {
        unsupportedLand.push(feature);
        if (hasLandCoastFeature(feature)) unsupportedLandFallback.push(feature);
      } else supportedLand.push(feature);
    }
    if (hasLandCoastFeature(feature)) {
      (disableCoast || !renderer.supportsBoundary(feature)
        ? unsupportedCoasts : supportedCoasts).push(feature);
    }
  }
  const classification = { supportedLand, unsupportedLand, unsupportedLandFallback, supportedCoasts, unsupportedCoasts };
  profiles.set(key, classification);
  return classification;
}
function drawAntarcticLandBase(context, features, width, height, projection) {
  const viewport = projection.viewport ?? {};
  const zoom = Math.max(1, Number(viewport.zoom ?? 1));
  const centerLongitude = Number(viewport.centerLongitude ?? 0);
  const west = centerLongitude - 180 / zoom;
  const east = centerLongitude + 180 / zoom;
  const southWest = projectCoordinate([west, -90], width, height,
    { ...projection, viewport: { ...viewport, wrapLongitude: false } });
  const southEast = projectCoordinate([east, -90], width, height,
    { ...projection, viewport: { ...viewport, wrapLongitude: false } });
  let drawn = 0;
  for (const feature of features) {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      const ring = polygon?.[0];
      if (!Array.isArray(ring) || ring.length < 4) continue;
      // À exactement 180° du centre, Math.round() choisissait parfois
      // +180° pour le premier sommet -180° : toute la côte partait alors
      // hors du bord droit. Dérouler les longitudes en un seul parcours,
      // sans allouer les tableaux coast et points à chaque rendu.
      let previousLongitude = null;
      let pointCount = 0;
      const viewportCenter = Number(viewport.centerLongitude ?? 0);
      const coastProjection = { ...projection, viewport: { ...viewport, wrapLongitude: false } };
      context.beginPath();
      for (const coordinate of ring) {
        if (!Array.isArray(coordinate) || !Number.isFinite(coordinate[0])
          || !Number.isFinite(coordinate[1]) || coordinate[1] <= -88.5) continue;
        let longitude = coordinate[0];
        if (previousLongitude === null) {
          while (longitude - viewportCenter > 180) longitude -= 360;
          while (longitude - viewportCenter < -180) longitude += 360;
        } else {
          while (longitude - previousLongitude > 180) longitude -= 360;
          while (longitude - previousLongitude < -180) longitude += 360;
        }
        previousLongitude = longitude;
        const point = projectCoordinate([longitude, coordinate[1]], width, height, coastProjection);
        if (!point) continue;
        if (pointCount === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
        pointCount++;
      }
      if (pointCount < 3) continue;
      context.lineTo(southEast.x, southEast.y);
      context.lineTo(southWest.x, southWest.y);
      context.closePath();
      context.fillStyle = "rgba(248,251,252,0.98)";
      context.fill("evenodd");
      drawn++;
    }
  }
  return drawn;
}

function drawPolygonLayer(context, collection, width, height, projection, fill, stroke, lineWidth, alpha = 1, simplifyCoast = false, maxRank = Infinity, coastProfileOverride = null) {
  if (!collection?.features) return 0;
  let drawn = 0;
  const renderScale = projection.renderScale ?? 1;
  const coastProfile = simplifyCoast
    ? (coastProfileOverride ?? getCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1))
    : null;
  context.save();
  context.globalAlpha = alpha;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    const featureRank = Number(feature.properties?.scalerank ?? feature.properties?.SCALERANK ?? feature.properties?.min_zoom ?? feature.properties?.MIN_ZOOM ?? 0);
    if (featureRank > maxRank) continue;
    const cachedPath = getProjectedPath(feature, width, height, projection, coastProfile);
    if (!cachedPath) {
      context.beginPath();
      if (!traceGeometry(context, feature.geometry, width, height, projection, coastProfile)) continue;
    }
    context.fillStyle = fill;
    // Le fond terrestre ne trace pas une deuxième côte : les contours
    // politiques dédiés restent la seule référence visible.
    if (stroke !== null) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth * renderScale;
    }
    // CanvasRenderingContext2D accepts either a cached Path2D or the current path.
    if (cachedPath) {
      context.fill(cachedPath, "evenodd");
      if (stroke !== null) context.stroke(cachedPath);
    } else {
      context.fill("evenodd");
      if (stroke !== null) context.stroke();
    }
    drawn++;
  }
  context.restore();
  return drawn;
}

function drawGlacierFillLayers(context, collection, width, height, projection, maxRank = 4) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
    if (isAntarcticLandFeature(feature)) continue;
    const style = getGlacierRenderStyle(feature);
    if (style.rank > maxRank) continue;
    drawn += drawPolygonLayer(context, { type: "FeatureCollection", features: [feature] },
      width, height, projection, "#dce8e5", null, 0, style.fillAlpha, false, maxRank);
  }
  return drawn;
}

function drawGlacierOutlineLayers(context, collection, width, height, projection, maxRank = 4) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
    if (isAntarcticLandFeature(feature)) continue;
    const style = getGlacierRenderStyle(feature);
    if (style.rank > maxRank) continue;
    drawn += drawPolygonLayer(context, { type: "FeatureCollection", features: [feature] },
      width, height, projection, "rgba(0,0,0,0)", "#9ebfc3",
      style.outlineWidth, style.outlineAlpha, false, maxRank);
  }
  return drawn;
}

function drawGlacierLayers(context, collection, width, height, projection, maxRank = 4) {
  const filled = drawGlacierFillLayers(context, collection, width, height, projection, maxRank);
  drawGlacierOutlineLayers(context, collection, width, height, projection, maxRank);
  return filled;
}

function drawLakeOutlineLayer(context, collection, width, height, projection, color, simplifyProfile, maxRank) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
    const style = getLakeRenderStyle(feature);
    if (style.rank > maxRank) continue;
    drawn += drawPolygonLayer(context, { type: "FeatureCollection", features: [feature] },
      width, height, projection, "rgba(0,0,0,0)", color,
      style.outlineWidth, style.outlineAlpha, true, maxRank, simplifyProfile);
  }
  return drawn;
}

function riverFeatureRank(feature) {
  const raw = feature?.properties?.scalerank ?? feature?.properties?.SCALERANK ?? feature?.properties?.min_zoom ?? feature?.properties?.MIN_ZOOM;
  const rank = Number(raw);
  // Les collections synthétiques ou anciennes sans scalerank restent classées
  // comme cours d'eau secondaires, jamais comme affluents éliminés par défaut.
  return Number.isFinite(rank) ? rank : 1;
}
export function getRiverRenderStyle(feature, baseWidth = 0.7) {
  const rank = riverFeatureRank(feature);
  const safeWidth = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 0.7;
  const scale = rank <= 0 ? 1.28 : rank === 1 ? 1 : rank === 2 ? 0.76 : rank === 3 ? 0.58 : 0.46;
  const alpha = rank <= 0 ? 0.92 : rank === 1 ? 0.78 : rank === 2 ? 0.62 : rank === 3 ? 0.5 : 0.4;
  return { rank, lineWidth: safeWidth * scale, alpha };
}

function lineVertexCount(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === "LineString") return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
  if (geometry?.type !== "MultiLineString" || !Array.isArray(geometry.coordinates)) return 0;
  let total = 0;
  for (const line of geometry.coordinates) if (Array.isArray(line)) total += line.length;
  return total;
}
const majorRiverFeatureCollections = new WeakMap();

function getSortedMajorRiverFeatures(collection, maxRank) {
  if (!collection?.features) return [];
  let profiles = majorRiverFeatureCollections.get(collection);
  if (!profiles) {
    profiles = new Map();
    majorRiverFeatureCollections.set(collection, profiles);
  }
  const cacheKey = String(maxRank);
  let sorted = profiles.get(cacheKey);
  if (!sorted) {
    const ranked = [];
    for (let index = 0; index < collection.features.length; index++) {
      const feature = collection.features[index];
      const type = feature?.geometry?.type;
      if (type !== "LineString" && type !== "MultiLineString") continue;
      const rank = riverFeatureRank(feature);
      if (rank <= maxRank) ranked.push({ feature, rank, vertices: lineVertexCount(feature), index });
    }
    ranked.sort((a, b) => a.rank - b.rank || b.vertices - a.vertices || a.index - b.index);
    sorted = new Array(ranked.length);
    for (let index = 0; index < ranked.length; index++) sorted[index] = ranked[index].feature;
    profiles.set(cacheKey, sorted);
  }
  return sorted;
}

export function selectMajorRiverFeatures(collection, maxRank = 1, maxFeatures = 18) {
  const sorted = getSortedMajorRiverFeatures(collection, maxRank);
  const limit = Math.max(0, maxFeatures);
  return sorted.length <= limit ? sorted : sorted.slice(0, limit);
}

function drawLineLayer(context, collection, width, height, projection, color, lineWidth, simplifyProfile = null, maxRank = Infinity, maxFeatures = Infinity) {
  if (!collection?.features) return 0;
  let drawn = 0;
  const renderScale = projection.renderScale ?? 1;
  const candidates = Number.isFinite(maxFeatures)
    ? selectMajorRiverFeatures(collection, maxRank, maxFeatures)
    : collection.features;
  context.save?.();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const feature of candidates) {
    const geometry = feature?.geometry;
    if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) continue;
    const style = getRiverRenderStyle(feature, lineWidth);
    const cachedPath = getProjectedPath(feature, width, height, projection, simplifyProfile);
    context.strokeStyle = color;
    context.globalAlpha = style.alpha;
    context.lineWidth = style.lineWidth * renderScale;
    const singleLine = geometry.type === "LineString";
    const lines = geometry.coordinates;
    if (cachedPath) {
      context.stroke(cachedPath);
      // Conserver la sémantique historique : un cours d'eau multi-segments
      // compte chaque ligne réellement dessinée, même avec un chemin Path2D unique.
      drawn += singleLine ? 1 : lines.length;
      continue;
    }
    const lineCount = singleLine ? 1 : lines.length;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const line = singleLine ? lines : lines[lineIndex];
      context.beginPath();
      let segment = [];
      let drewSegment = false;
      const flushSegment = () => {
        const points = simplifyProfile ? simplifyOpenLine(segment, simplifyProfile.tolerance) : segment;
        if (points.length) {
          context.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
          drewSegment = true;
        }
        segment = [];
      };
      const project = createContinuousProjector(width, height, projection);
      for (const coordinate of line) {
        const point = project(coordinate);
        if (!point) { flushSegment(); continue; }
        segment.push(point);
      }
      flushSegment();
      if (drewSegment) { context.stroke(); drawn++; }
    }
  }
  context.restore?.();
  return drawn;
}

export function getBoundarySimplificationProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  if (level <= 1.5) return { tolerance: 2 };
  if (level <= 4) return { tolerance: 1.25 };
  if (level <= 10) return { tolerance: 0.65 };
  return { tolerance: 0.25 };
}

function drawStyledBoundaryLayer(context, collection, width, height, projection, color, lineWidth, dash = [], precisionAware = false, administrative = false) {
  if (!collection?.features) return 0;
  const zoom = Number(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
  if (administrative && zoom < 3) return 0;
  const renderScale = projection.renderScale ?? 1;
  const scaledDash = dash.length ? dash.map(value => value * renderScale) : dash;
  const precisionDash = [3 * renderScale, 2 * renderScale];
  const simplifyProfile = getBoundarySimplificationProfile(zoom);
  const batches = new Map();

  // Les frontières sont regroupées par motif de trait : un seul beginPath/stroke
  // par style au lieu d'un aller-retour Canvas pour chaque feature GeoJSON.
  for (const feature of collection.features) {
    const properties = feature?.properties ?? {};
    const precision = Number(properties.BORDERPRECISION ?? properties.borderPrecision ?? 3);
    const rank = Number(properties.scalerank ?? properties.SCALERANK ?? properties.min_zoom ?? properties.MIN_ZOOM ?? 0);
    if (administrative && ((zoom < 5 && rank > 1) || (zoom < 8 && rank > 3))) continue;
    const usePrecisionDash = precisionAware && precision < 3;
    const lineDash = usePrecisionDash ? precisionDash : scaledDash;
    const key = usePrecisionDash ? "precision" : "base";
    let batch = batches.get(key);
    if (!batch) batches.set(key, batch = { dash: lineDash, features: [] });
    batch.features.push(feature);
  }

  let count = 0;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth * renderScale;
  context.globalAlpha = 0.92;
  for (const batch of batches.values()) {
    context.setLineDash?.(batch.dash);
    context.beginPath();
    let batchHasGeometry = false;
    for (const feature of batch.features) {
      const geometry = feature?.geometry;
      if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) continue;
      const singleLine = geometry.type === "LineString";
      const lines = geometry.coordinates;
      const lineCount = singleLine ? 1 : lines.length;
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const line = singleLine ? lines : lines[lineIndex];
        const project = createContinuousProjector(width, height, projection);
        let segment = [];
        let lineDrawn = false;
        const flushSegment = () => {
          const points = simplifyOpenLine(segment, simplifyProfile.tolerance);
          if (points.length) {
            context.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
            lineDrawn = true;
          }
          segment = [];
        };
        for (const coordinate of line ?? []) {
          const point = project(coordinate);
          if (!point) { flushSegment(); continue; }
          segment.push(point);
        }
        flushSegment();
        if (lineDrawn) { count++; batchHasGeometry = true; }
      }
    }
    if (batchHasGeometry) context.stroke();
  }
  context.restore();
  return count;
}

function drawLandHachures(context, collection, width, height, projection, color) {
  if (!collection?.features || typeof context.clip !== "function") return;
  context.save();
  const renderScale = projection.renderScale ?? 1;
  const coastProfile = getLandCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
  context.globalAlpha = 0.12;
  context.strokeStyle = color;
  context.lineWidth = 0.45 * renderScale;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    context.save();
    const cachedPath = getProjectedPath(feature, width, height, projection, coastProfile);
    if (cachedPath) {
      context.clip(cachedPath, "evenodd");
    } else {
      context.beginPath();
      if (traceGeometry(context, feature.geometry, width, height, projection, coastProfile)) context.clip("evenodd");
    }
    if (cachedPath || typeof Path2D === "undefined") {
      for (let offset = -height; offset < width; offset += 13 * renderScale) {
        context.beginPath();
        context.moveTo(offset, height);
        context.lineTo(offset + height, 0);
        context.stroke();
      }
    }
    context.restore();
  }
  context.restore();
}

export function getSecondaryDetailProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  return {
    riversRank: 1,
    riversMax: 18,
    lakesRank: 1,
    glaciers: level >= 2.5,
    elevationMax: level < 2.5 ? 8 : level < 4 ? 16 : level < 7 ? 32 : 64
  };
}

const sortedElevationPointCollections = new WeakMap();

function getSortedElevationPointFeatures(collection) {
  if (!collection?.features) return [];
  let sorted = sortedElevationPointCollections.get(collection);
  if (!sorted) {
    const ranked = [];
    for (let index = 0; index < collection.features.length; index++) {
      const feature = collection.features[index];
      if (feature.geometry?.type !== "Point") continue;
      const elevation = Math.abs(Number(feature.properties?.elevation_m ?? 0));
      ranked.push({ feature, elevation, index });
    }
    ranked.sort((a, b) => b.elevation - a.elevation || a.index - b.index);
    sorted = new Array(ranked.length);
    for (let index = 0; index < ranked.length; index++) sorted[index] = ranked[index].feature;
    sortedElevationPointCollections.set(collection, sorted);
  }
  return sorted;
}

export function selectMajorElevationFeatures(collection, maxFeatures = 64) {
  const sorted = getSortedElevationPointFeatures(collection);
  const limit = Math.max(0, maxFeatures);
  return sorted.length <= limit ? sorted : sorted.slice(0, limit);
}

function drawElevationPoints(context, collection, width, height, projection, theme) {
  if (!collection?.features) return 0;
  let drawn = 0;
  const renderScale = projection.renderScale ?? 1;
  const zoom = Number(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
  const profile = getSecondaryDetailProfile(zoom);
  const candidates = getSortedElevationPointFeatures(collection);
  const candidateCount = Math.min(candidates.length, profile.elevationMax);
  context.save();
  for (let index = 0; index < candidateCount; index++) {
    const feature = candidates[index];
    const elevation = Number(feature.properties?.elevation_m ?? 0);
    const isMountain = feature.properties?.kind === "mountain";
    const isDepression = feature.properties?.kind === "depression";
    if (zoom < 2.5 && !(isMountain && elevation >= 7000)) continue;
    if (zoom < 4 && isDepression && elevation > -400) continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = projectCoordinate([longitude, latitude], width, height, projection);
    if (!point) continue;
    context.fillStyle = isDepression ? "#6f8f9b" : theme.colors.accent;
    context.strokeStyle = theme.colors.coast;
    context.lineWidth = 0.8 * renderScale;
    if (isMountain) {
      // Les triangles de sommets sont supprimés : le relief ETOPO suffit à
      // lire les montagnes. On conserve uniquement le nom des très hauts sommets.
      if (elevation >= 5000 && typeof context.fillText === "function") {
        context.font = `${10 * renderScale}px Georgia, serif`;
        context.textAlign = "left";
        context.fillStyle = theme.colors.text;
        context.fillText(feature.properties?.name ?? "Sommet", point.x + 6 * renderScale, point.y - 4 * renderScale);
      }
      drawn++;
      continue;
    }
    context.beginPath();
    context.arc(point.x, point.y, 2.2 * renderScale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    drawn++;
  }
  context.restore();
  return drawn;
}


const sortedLabelCollections = new WeakMap();
const LABEL_COLLISION_CELL_SIZE = 64;
const PHYSICAL_LABEL_BUCKET_SIZE = 2;
const PHYSICAL_LABEL_BUCKET_COLUMNS = 180;
const physicalLabelStatusCache = new WeakMap();

function getPhysicalLabelIndex(world) {
  if (!world?.currentCells?.length) return null;
  const cached = physicalLabelStatusCache.get(world);
  if (cached?.revision === world.revision) return cached;
  const buckets = new Map();
  for (const cell of world.currentCells) {
    const rawLongitude = Number(cell.longitude);
    const rawLatitude = Number(cell.latitude);
    if (!Number.isFinite(rawLongitude) || !Number.isFinite(rawLatitude)) continue;
    const longitude = ((rawLongitude + 180) % 360 + 360) % 360 - 180;
    const latitude = Math.max(-90, Math.min(90, rawLatitude));
    const x = Math.min(PHYSICAL_LABEL_BUCKET_COLUMNS - 1, Math.floor((longitude + 180) / PHYSICAL_LABEL_BUCKET_SIZE));
    const y = Math.max(0, Math.min(89, Math.floor((latitude + 90) / PHYSICAL_LABEL_BUCKET_SIZE)));
    const key = y * PHYSICAL_LABEL_BUCKET_COLUMNS + x;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    // Les coordonnées normalisées sont calculées une fois par révision du monde.
    bucket.push({ cell, longitude, latitude });
  }
  const index = { revision: world.revision, buckets, results: new WeakMap() };
  physicalLabelStatusCache.set(world, index);
  return index;
}

export function isCityPermanentlySubmerged(feature, world) {
  const coordinates = feature?.geometry?.coordinates;
  // Le monde physique initial est neutre : aucun index de cellules à construire.
  if (Number(world?.revision ?? 0) <= 0 || !Array.isArray(coordinates) || !world?.currentCells?.length) return false;
  const longitude = Number(coordinates[0]), latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  const index = getPhysicalLabelIndex(world);
  if (!index) return false;
  if (index.results.has(feature)) return index.results.get(feature);
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const centerX = Math.min(PHYSICAL_LABEL_BUCKET_COLUMNS - 1, Math.floor((wrappedLongitude + 180) / PHYSICAL_LABEL_BUCKET_SIZE));
  const centerY = Math.max(0, Math.min(89, Math.floor((latitude + 90) / PHYSICAL_LABEL_BUCKET_SIZE)));
  let nearest = null, best = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    const y = centerY + dy;
    if (y < 0 || y >= 90) continue;
    for (let dx = -2; dx <= 2; dx++) {
      const x = (centerX + dx + PHYSICAL_LABEL_BUCKET_COLUMNS) % PHYSICAL_LABEL_BUCKET_COLUMNS;
      for (const entry of index.buckets.get(y * PHYSICAL_LABEL_BUCKET_COLUMNS + x) ?? []) {
        const deltaLongitude = ((entry.longitude - longitude + 540) % 360) - 180;
        const deltaLatitude = entry.latitude - latitude;
        const distance = Math.hypot(deltaLongitude * Math.cos(latitude * Math.PI / 180), deltaLatitude);
        if (distance < best) { best = distance; nearest = entry.cell; }
      }
    }
  }
  const submerged = Boolean(nearest && (nearest.inundated || nearest.permanentlySubmerged) && best < 2.2);
  index.results.set(feature, submerged);
  return submerged;
}

const labelKindPriority = new Map([
  ["continent", 0],
  ["ocean", 1],
  ["sea", 2],
  ["strait", 3],
  ["country", 4],
  ["province", 5],
  ["city", 6]
]);

/** Priorité de placement des familles de labels cartographiques. */
export function getMapLabelKindPriority(kind) {
  return labelKindPriority.get(kind) ?? 7;
}
const labelNameCollator = new Intl.Collator("fr", { sensitivity: "base" });

/** Normalise le rang et la population d'une ville pour un tri stable. */
export function getMapLabelCityPriority(feature) {
  const properties = feature?.properties ?? {};
  const rawRank = Number(properties.scalerank ?? properties.SCALERANK
    ?? properties.minZoom ?? properties.MIN_ZOOM ?? 99);
  const rawPopulation = Number(properties.POP_MAX ?? properties.pop_max
    ?? properties.POP_EST ?? properties.pop_est ?? properties.population ?? 0);
  return {
    rank: Number.isFinite(rawRank) && rawRank >= 0 ? rawRank : 99,
    population: Number.isFinite(rawPopulation) && rawPopulation > 0 ? rawPopulation : 0
  };
}

function getSortedLabelCandidates(collection) {
  let candidates = sortedLabelCollections.get(collection);
  if (!candidates) {
    const ranked = [];
    for (let index = 0; index < collection.features.length; index++) {
      const feature = collection.features[index];
      const properties = feature.properties ?? {};
      const kind = properties.kind;
      const cityPriority = kind === "city" ? getMapLabelCityPriority(feature) : null;
      ranked.push({
        feature, index,
        kind,
        kindRank: getMapLabelKindPriority(kind),
        cityRank: cityPriority?.rank ?? 0,
        population: cityPriority?.population ?? 0,
        name: localizeMapLabel(properties.name, kind, properties)
      });
    }
    ranked.sort((a, b) => a.kindRank - b.kindRank
      || (a.kind === "city" && b.kind === "city"
        ? a.cityRank - b.cityRank || b.population - a.population : 0)
      || labelNameCollator.compare(a.name, b.name)
      || a.index - b.index);
    candidates = ranked.map(entry => entry.feature);
    sortedLabelCollections.set(collection, candidates);
  }
  return candidates;
}

/** Détecte un chevauchement réel entre deux emprises cartographiques finies. */
export function doMapLabelBoxesOverlap(first, second) {
  if (!first || !second) return false;
  const keys = ["left", "right", "top", "bottom"];
  const a = {}, b = {};
  for (const key of keys) {
    a[key] = Number(first[key]);
    b[key] = Number(second[key]);
    if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) return false;
  }
  if (a.left > a.right || a.top > a.bottom
    || b.left > b.right || b.top > b.bottom) return false;
  return !(a.right < b.left || a.left > b.right
    || a.bottom < b.top || a.top > b.bottom);
}

function labelBoxCollides(box, occupiedCells, cellSize = LABEL_COLLISION_CELL_SIZE) {
  const minX = Math.floor(box.left / cellSize);
  const maxX = Math.floor(box.right / cellSize);
  const minY = Math.floor(box.top / cellSize);
  const maxY = Math.floor(box.bottom / cellSize);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (const other of occupiedCells.get(`${x}:${y}`) ?? []) {
        if (doMapLabelBoxesOverlap(box, other)) return true;
      }
    }
  }
  return false;
}

function addLabelBox(box, occupiedCells, cellSize = LABEL_COLLISION_CELL_SIZE) {
  const minX = Math.floor(box.left / cellSize);
  const maxX = Math.floor(box.right / cellSize);
  const minY = Math.floor(box.top / cellSize);
  const maxY = Math.floor(box.bottom / cellSize);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const key = `${x}:${y}`;
      let bucket = occupiedCells.get(key);
      if (!bucket) occupiedCells.set(key, bucket = []);
      bucket.push(box);
    }
  }
}


function polygonInteriorLabelPoint(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  let largest = null, largestArea = -1;
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (!ring || ring.length < 4) continue;
    let twiceArea = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      twiceArea += cross;
      cx += (ring[i][0] + ring[i + 1][0]) * cross;
      cy += (ring[i][1] + ring[i + 1][1]) * cross;
    }
    const area = Math.abs(twiceArea / 2);
    if (area > largestArea) {
      largestArea = area;
      largest = Math.abs(twiceArea) > 1e-8
        ? [cx / (3 * twiceArea), cy / (3 * twiceArea)]
        : ring[Math.floor(ring.length / 2)];
    }
  }
  return largest;
}

export function territoryName(properties = {}) {
  for (const key of ["NAME_FR", "name_fr", "name_french", "ADMIN_FR", "ADMIN_0_FR", "FORMAL_FR", "formal_fr", "NAME_1_FR", "name_1_fr", "NAME_ALT_FR", "ABBREV_FR", "NAME", "ADMIN", "name", "NAME_EN", "name_en", "NAME_1", "name_1", "FORMAL_EN", "NAME_0", "ADMIN_0", "SOVEREIGNT", "NAME_LONG"]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

const FRENCH_HISTORICAL_NAMES = {
  "aquitaine": "Aquitaine",
  "duchy of aquitaine": "Duché d’Aquitaine",
  "guyenne": "Guyenne",
  "gascony": "Gascogne",
  "new france": "Nouvelle-France",
  "new spain": "Nouvelle-Espagne",
  "new granada": "Nouvelle-Grenade",
  "new netherlands": "Nouvelle-Néerlande",
  "new sweden": "Nouvelle-Suède",
  "british raj": "Inde britannique",
  "east india company": "Compagnie britannique des Indes orientales",
  "french empire": "Empire français",
  "first french empire": "Premier Empire français",
  "french republic": "République française",
  "british empire": "Empire britannique",
  "kingdom of england": "Royaume d’Angleterre",
  "kingdom of france": "Royaume de France",
  "kingdom of castile": "Royaume de Castille",
  "crown of castile": "Couronne de Castille",
  "crown of aragon": "Couronne d’Aragon",
  "spanish empire": "Empire espagnol",
  "portuguese empire": "Empire portugais",
  "holy roman empire": "Saint-Empire romain germanique",
  "ottoman empire": "Empire ottoman",
  "united provinces": "Provinces-Unies",
  "papal states": "États pontificaux",
  "mughal empire": "Empire moghol",
  "qing dynasty": "Dynastie Qing",
  "ming dynasty": "Dynastie Ming",  "japanese empire": "Empire du Japon",
  "russian empire": "Empire russe",
  "austrian empire": "Empire d’Autriche",
  "prussia": "Prusse",
  "kingdom of prussia": "Royaume de Prusse",
  "sweden": "Suède",
  "denmark": "Danemark",
  "norway": "Norvège",
  "scotland": "Écosse",
  "ireland": "Irlande",
  "england": "Angleterre",
  "france": "France",
  "spain": "Espagne",
  "portugal": "Portugal",
  "netherlands": "Pays-Bas",
  "germany": "Allemagne",
  "italy": "Italie",
  "switzerland": "Suisse",
  "poland": "Pologne",
  "lithuania": "Lituanie",
  "russia": "Russie",
  "ukraine": "Ukraine",
  "morocco": "Maroc",
  "algeria": "Algérie",
  "tunisia": "Tunisie",
  "egypt": "Égypte",
  "ethiopia": "Éthiopie",
  "persia": "Perse",
  "iran": "Iran",
  "iraq": "Irak",
  "afghanistan": "Afghanistan",
  "china": "Chine",
  "india": "Inde",
  "japan": "Japon",
  "korea": "Corée",
  "mexico": "Mexique",
  "brazil": "Brésil",
  "argentina": "Argentine",
  "chile": "Chili",
  "peru": "Pérou",
  "canada": "Canada",
  "united states": "États-Unis",
  "united states of america": "États-Unis",
  "australia": "Australie",
  "new zealand": "Nouvelle-Zélande",
  "ivory coast": "Côte d’Ivoire",
  "cote d ivoire": "Côte d’Ivoire",
  "democratic republic of the congo": "République démocratique du Congo",
  "dr congo": "République démocratique du Congo",
  "congo democratic republic": "République démocratique du Congo",
  "republic of the congo": "République du Congo",
  "congo republic": "République du Congo",
  "czech republic": "Tchéquie",
  "czechia": "Tchéquie",
  "south korea": "Corée du Sud",
  "republic of korea": "Corée du Sud",
  "north korea": "Corée du Nord",
  "democratic peoples republic of korea": "Corée du Nord",
  "turkey": "Turquie",
  "türkiye": "Turquie",
  "east timor": "Timor oriental",
  "timor leste": "Timor oriental",
  "burma": "Birmanie",
  "myanmar": "Birmanie",
  "cape verde": "Cap-Vert",
  "cabo verde": "Cap-Vert",
  "the gambia": "Gambie",
  "gambia": "Gambie",
  "swaziland": "Eswatini",
  "eswatini": "Eswatini",
  "macedonia": "Macédoine du Nord",
  "north macedonia": "Macédoine du Nord",
  "kosovo": "Kosovo",
  "palestine": "Palestine",
  "state of palestine": "État de Palestine",
  "taiwan": "Taïwan",
  "laos": "Laos",
  "lao peoples democratic republic": "Laos",
  "moldova": "Moldavie",
  "republic of moldova": "Moldavie",
  "brunei": "Brunei",
  "brunei darussalam": "Brunei",
  "vatican city": "Cité du Vatican",
  "holy see": "Saint-Siège",
  "syria": "Syrie",
  "syrian arab republic": "Syrie",
  "venezuela": "Venezuela",
  "bolivia": "Bolivie",
  "plurinational state of bolivia": "Bolivie",
  "tanzania": "Tanzanie",
  "united republic of tanzania": "Tanzanie",
  "micronesia": "Micronésie",
  "federated states of micronesia": "Micronésie",
  "marshall islands": "Îles Marshall",
  "solomon islands": "Îles Salomon",
  "central african republic": "République centrafricaine",
  "dominican republic": "République dominicaine",
  "equatorial guinea": "Guinée équatoriale",
  "guinea bissau": "Guinée-Bissau",
  "south sudan": "Soudan du Sud",
  "western sahara": "Sahara occidental",
  "sao tome and principe": "Sao Tomé-et-Principe",
  "antigua and barbuda": "Antigua-et-Barbuda",
  "bosnia and herzegovina": "Bosnie-Herzégovine",
  "trinidad and tobago": "Trinité-et-Tobago",
  "papua new guinea": "Papouasie-Nouvelle-Guinée",
  "united arab emirates": "Émirats arabes unis",
  "united kingdom": "Royaume-Uni",
  "uk": "Royaume-Uni",
  "united states minor outlying islands": "Îles mineures éloignées des États-Unis",
  "faroe islands": "Îles Féroé",
  "åland islands": "Îles Åland",
  "aland islands": "Îles Åland",
  "curacao": "Curaçao",
  "sint maarten": "Saint-Martin (partie néerlandaise)",
  "french guiana": "Guyane française",
  "republic of serbia": "Serbie",
  "republic of croatia": "Croatie",
  "republic of slovenia": "Slovénie",
  "republic of latvia": "Lettonie",
  "republic of lithuania": "Lituanie",
  "republic of estonia": "Estonie",
  "republic of indonesia": "Indonésie",
  "islamic republic of iran": "Iran",
  "islamic republic of pakistan": "Pakistan",
  "people s republic of china": "Chine",
  "democratic republic of sao tome and principe": "Sao Tomé-et-Principe",
  "teutonic knights": "Chevaliers teutoniques",
  "teutonic order": "Ordre Teutonique",
  "state of the teutonic order": "État de l’Ordre Teutonique",
  "livonian order": "Ordre livonien",
  "livonian confederation": "Confédération livonienne",
  "english territory": "Territoire anglais",
  "english territories": "Territoires anglais",
  "english possessions": "Possessions anglaises",
  "english colonies": "Colonies anglaises",
  "british territory": "Territoire britannique",
  "british territories": "Territoires britanniques",
  "french territory": "Territoire français",
  "french territories": "Territoires français",
  "spanish territory": "Territoire espagnol",
  "spanish territories": "Territoires espagnols",
  "portuguese territory": "Territoire portugais",
  "dutch territory": "Territoire néerlandais",
  "danish territory": "Territoire danois",
  "swedish territory": "Territoire suédois",
  "russian territory": "Territoire russe",
  "ottoman territory": "Territoire ottoman",
  "knights hospitaller": "Ordre des Hospitaliers",
  "knights of rhodes": "Chevaliers de Rhodes",
  "knights of malta": "Chevaliers de Malte",
  "knights templar": "Ordre du Temple",
  "papal states": "États pontificaux",
  "papal state": "État pontifical",
  "state of the church": "États pontificaux",
  "kingdom of sicily": "Royaume de Sicile",
  "kingdom of naples": "Royaume de Naples",
  "kingdom of sardinia": "Royaume de Sardaigne",
  "kingdom of the two sicilies": "Royaume des Deux-Siciles",
  "duchy of milan": "Duché de Milan",
  "duchy of savoy": "Duché de Savoie",
  "duchy of burgundy": "Duché de Bourgogne",
  "duchy of lorraine": "Duché de Lorraine",
  "duchy of bavaria": "Duché de Bavière",
  "duchy of saxony": "Duché de Saxe",
  "electorate of bavaria": "Électorat de Bavière",
  "electorate of saxony": "Électorat de Saxe",
  "electorate of brandenburg": "Électorat de Brandebourg",
  "margraviate of brandenburg": "Margraviat de Brandebourg",
  "grand duchy of lithuania": "Grand-duché de Lituanie",
  "polish lithuanian commonwealth": "République des Deux Nations",
  "polish–lithuanian commonwealth": "République des Deux Nations",
  "commonwealth of poland lithuania": "République des Deux Nations",
  "kingdom of hungary": "Royaume de Hongrie",
  "kingdom of bohemia": "Royaume de Bohême",
  "kingdom of croatia": "Royaume de Croatie",
  "kingdom of serbia": "Royaume de Serbie",
  "kingdom of bulgaria": "Royaume de Bulgarie",
  "kingdom of romania": "Royaume de Roumanie",
  "kingdom of greece": "Royaume de Grèce",
  "kingdom of belgium": "Royaume de Belgique",
  "kingdom of the netherlands": "Royaume des Pays-Bas",
  "kingdom of portugal": "Royaume du Portugal",
  "kingdom of spain": "Royaume d’Espagne",
  "kingdom of scotland": "Royaume d’Écosse",
  "kingdom of ireland": "Royaume d’Irlande",
  "kingdom of great britain": "Royaume de Grande-Bretagne",
  "united kingdom of great britain and ireland": "Royaume-Uni de Grande-Bretagne et d’Irlande",
  "united kingdom of great britain and northern ireland": "Royaume-Uni",
  "united states of america": "États-Unis d’Amérique",
  "united states": "États-Unis",
  "federal republic of germany": "République fédérale d’Allemagne",
  "german democratic republic": "République démocratique allemande",
  "german confederation": "Confédération germanique",
  "north german confederation": "Confédération de l’Allemagne du Nord",
  "german empire": "Empire allemand",
  "weimar republic": "République de Weimar",
  "confederation of the rhine": "Confédération du Rhin",
  "byzantine empire": "Empire byzantin",
  "eastern roman empire": "Empire romain d’Orient",
  "western roman empire": "Empire romain d’Occident",
  "roman empire": "Empire romain",
  "kingdom of italy": "Royaume d’Italie",
  "italian social republic": "République sociale italienne",
  "serene republic of venice": "Sérénissime République de Venise",
  "republic of venice": "République de Venise",
  "republic of genoa": "République de Gênes",
  "grand duchy of tuscany": "Grand-duché de Toscane",
  "united provinces of the netherlands": "Provinces-Unies",
  "dutch republic": "République des Provinces-Unies",
  "dutch east india company": "Compagnie néerlandaise des Indes orientales",
  "dutch west india company": "Compagnie néerlandaise des Indes occidentales",
  "east india company": "Compagnie britannique des Indes orientales",
  "english east india company": "Compagnie anglaise des Indes orientales",
  "french east india company": "Compagnie française des Indes orientales",
  "spanish netherlands": "Pays-Bas espagnols",
  "austrian netherlands": "Pays-Bas autrichiens",
  "burgundian netherlands": "Pays-Bas bourguignons",
  "low countries": "Pays-Bas historiques",
  "united states of indonesia": "États-Unis d’Indonésie",
  "kingdom of hawaii": "Royaume d’Hawaï",
  "hawaiian kingdom": "Royaume d’Hawaï",
  "mauryan empire": "Empire maurya",
  "gupta empire": "Empire Gupta",
  "mughal empire": "Empire moghol",
  "delhi sultanate": "Sultanat de Delhi",
  "maratha empire": "Empire marathe",
  "vijayanagara empire": "Empire de Vijayanagara",
  "ottoman empire": "Empire ottoman",
  "safavid iran": "Iran séfévide",
  "safavid empire": "Empire séfévide",
  "afsharid iran": "Iran afcharide",
  "qajar iran": "Iran qadjare",
  "emirate of afghanistan": "Émirat d’Afghanistan",
  "durrani empire": "Empire durrani",
  "mongol empire": "Empire mongol",
  "yuan dynasty": "Dynastie Yuan",
  "ming dynasty": "Dynastie Ming",
  "qing dynasty": "Dynastie Qing",
  "joseon": "Dynastie Joseon",
  "joseon dynasty": "Dynastie Joseon",
  "tokugawa shogunate": "Shogunat Tokugawa",
  "japanese empire": "Empire du Japon",
  "kingdom of ayutthaya": "Royaume d’Ayutthaya",
  "kingdom of siam": "Royaume de Siam",
  "konbaung dynasty": "Dynastie Konbaung",
  "kingdom of kongo": "Royaume du Kongo",
  "ethiopian empire": "Empire éthiopien",
  "abyssinia": "Abyssinie",
  "kingdom of buganda": "Royaume du Bouganda",
  "mali empire": "Empire du Mali",
  "songhai empire": "Empire songhaï",
  "ghana empire": "Empire du Ghana",
  "kingdom of benin": "Royaume du Bénin",
  "ashanti empire": "Empire ashanti",
  "zulu kingdom": "Royaume zoulou",
  "kingdom of mutapa": "Royaume du Monomotapa",
  "mameluke sultanate": "Sultanat mamelouk",
  "mamluk sultanate": "Sultanat mamelouk",
  "kingdom of jerusalem": "Royaume de Jérusalem",
  "principality of antioch": "Principauté d’Antioche",
  "county of tripoli": "Comté de Tripoli",
  "county of edessa": "Comté d’Édesse",
  "latin empire": "Empire latin de Constantinople",
  "empire of trebizond": "Empire de Trébizonde",
  "empire of nicaea": "Empire de Nicée",
  "kingdom of armenia": "Royaume d’Arménie",
  "cilician armenia": "Royaume arménien de Cilicie",
  "principality of wallachia": "Principauté de Valachie",
  "principality of moldavia": "Principauté de Moldavie",
  "transylvania": "Transylvanie",
  "crimean khanate": "Khanat de Crimée",
  "golden horde": "Horde d’Or",
  "khazar khaganate": "Khaganat khazar",
  "khiva khanate": "Khanat de Khiva",
  "kokand khanate": "Khanat de Kokand",
  "bukhara emirate": "Émirat de Boukhara",
  "emirate of bukhara": "Émirat de Boukhara",
  "kazakh khanate": "Khanat kazakh",
  "circassia": "Circassie",
  "cherokee nation": "Nation cherokee",
  "iroquois confederacy": "Confédération iroquoise",
  "haudenosaunee": "Confédération haudenosaunee",
  "aztec empire": "Empire aztèque",
  "mexica empire": "Empire mexica",
  "inca empire": "Empire inca",
  "tawantinsuyu": "Tawantinsuyu (Empire inca)",
  "maya city states": "Cités-États mayas",
  "viceroyalty of new spain": "Vice-royauté de Nouvelle-Espagne",
  "viceroyalty of peru": "Vice-royauté du Pérou",
  "viceroyalty of new granada": "Vice-royauté de Nouvelle-Grenade",
  "viceroyalty of the rio de la plata": "Vice-royauté du Río de la Plata",
  "captaincy general of chile": "Capitainerie générale du Chili",
  "captaincy general of venezuela": "Capitainerie générale du Venezuela",
  "thirteen colonies": "Treize Colonies",
  "confederate states of america": "États confédérés d’Amérique",
  "united states confederate states": "États confédérés d’Amérique",
  "dominion of canada": "Dominion du Canada",
  "newfoundland colony": "Colonie de Terre-Neuve",
  "colony of virginia": "Colonie de Virginie",
  "massachusetts bay colony": "Colonie de la baie du Massachusetts",
  "new netherland": "Nouvelle-Néerlande",
  "new amsterdam": "Nouvelle-Amsterdam",
  "new sweden": "Nouvelle-Suède",
  "rupert s land": "Terre de Rupert",
  "rupert's land": "Terre de Rupert",
  "hudson s bay company": "Compagnie de la Baie d’Hudson",
  "hudson's bay company": "Compagnie de la Baie d’Hudson",
  "french west africa": "Afrique-Occidentale française",
  "french equatorial africa": "Afrique-Équatoriale française",
  "french indochina": "Indochine française",
  "french algeria": "Algérie française",
  "french west indies": "Antilles françaises",
  "british west indies": "Antilles britanniques",
  "british north america": "Amérique du Nord britannique",
  "british east africa": "Afrique orientale britannique",
  "british south africa": "Afrique australe britannique",
  "british nigeria": "Nigeria britannique",
  "british somaliland": "Somaliland britannique",
  "italian east africa": "Afrique orientale italienne",
  "italian somaliland": "Somaliland italien",
  "italian eritrea": "Érythrée italienne",
  "portuguese east africa": "Afrique orientale portugaise",
  "portuguese west africa": "Afrique occidentale portugaise",
  "portuguese guinea": "Guinée portugaise",
  "belgian congo": "Congo belge",
  "spanish sahara": "Sahara espagnol",
  "spanish guinea": "Guinée espagnole",
  "german east africa": "Afrique orientale allemande",
  "german south west africa": "Afrique du Sud-Ouest allemande",
  "german southwest africa": "Afrique du Sud-Ouest allemande",
  "german new guinea": "Nouvelle-Guinée allemande",
  "kingdom of yugoslavia": "Royaume de Yougoslavie",
  "socialist federal republic of yugoslavia": "République fédérative socialiste de Yougoslavie",
  "czechoslovakia": "Tchécoslovaquie",
  "union of soviet socialist republics": "Union des républiques socialistes soviétiques",
  "soviet union": "Union soviétique",
  "ussr": "URSS",
  "russian soviet federative socialist republic": "République socialiste fédérative soviétique de Russie",
  "ottoman turkish empire": "Empire ottoman",
  "kingdom of saudi arabia": "Royaume d’Arabie saoudite",
  "mutawakkilite kingdom of yemen": "Royaume mutawakkilite du Yémen",
  "kingdom of libya": "Royaume de Libye",
  "united arab republic": "République arabe unie",
  "united arab emirates": "Émirats arabes unis",
  "kingdom of iraq": "Royaume d’Irak",
  "kingdom of egypt": "Royaume d’Égypte",
  "kingdom of afghanistan": "Royaume d’Afghanistan",
  "kingdom of nepal": "Royaume du Népal",
  "kingdom of bhutan": "Royaume du Bhoutan",
  "kingdom of thailand": "Royaume de Thaïlande",
  "kingdom of cambodia": "Royaume du Cambodge",
  "kingdom of laos": "Royaume du Laos",
  "kingdom of vietnam": "Royaume du Viêt Nam",
  "republic of vietnam": "République du Viêt Nam",
  "democratic republic of vietnam": "République démocratique du Viêt Nam",
  "north vietnam": "Viêt Nam du Nord",
  "south vietnam": "Viêt Nam du Sud",
  "federation of malaya": "Fédération de Malaisie",
  "malayan union": "Union malaise",
  "federation of arabia": "Fédération d’Arabie",
  "kingdom of tahiti": "Royaume de Tahiti",
  "tongan empire": "Empire tongien",
  "kingdom of tonga": "Royaume des Tonga",
  "kingdom of fiji": "Royaume des Fidji",
  "kingdom of madagascar": "Royaume de Madagascar",
  "merina kingdom": "Royaume mérina",
  "madagascar": "Madagascar",
  "english": "anglais",
  "british": "britannique",
  "french": "français",
  "spanish": "espagnol",
  "portuguese": "portugais",
  "dutch": "néerlandais",
  "german": "allemand",
  "teutonic": "teutonique",
  "bavaria": "Bavière",
  "bohemia": "Bohême",
  "burgundy": "Bourgogne",
  "saxony": "Saxe",
  "lorraine": "Lorraine",
  "savoy": "Savoie",
  "milan": "Milan",
  "tuscany": "Toscane",
  "navarre": "Navarre",
  "aragon": "Aragon",
  "castile": "Castille",
  "galicia": "Galice",
  "wallachia": "Valachie",
  "moldavia": "Moldavie",
  "transylvania": "Transylvanie",
  "georgia": "Géorgie",
  "armenia": "Arménie",
  "azerbaijan": "Azerbaïdjan",
  "sri lanka": "Sri Lanka",
  "ceylon": "Ceylan",
  "burma": "Birmanie",
  "siam": "Siam",
  "cambodia": "Cambodge",
  "vietnam": "Viêt Nam",
  "annam": "Annam",
  "republic of annam": "République de l’Annam",
  "tonkin": "Tonkin",
  "cochin china": "Cochinchine",
  "manchuria": "Mandchourie",
  "tibet": "Tibet",
  "mongolia": "Mongolie",
  "korea": "Corée",
  "yemen": "Yémen",
  "oman": "Oman",
  "muscat": "Mascate",
  "tripolitania": "Tripolitaine",
  "cyrenaica": "Cyrénaïque",
  "libya": "Libye",
  "nubia": "Nubie",
  "sudan": "Soudan",
  "senegal": "Sénégal",
  "congo": "Congo",
  "angola": "Angola",
  "mozambique": "Mozambique",
  "rhodesia": "Rhodésie",
  "transvaal": "Transvaal",
  "orange free state": "État libre d’Orange",
  "cape colony": "Colonie du Cap",
  "gold coast": "Côte-de-l’Or",
  "natal": "Natal",
  "queensland": "Queensland",
  "new south wales": "Nouvelle-Galles du Sud",
  "victoria": "Victoria",
  "tasmania": "Tasmanie",
  "western australia": "Australie-Occidentale",
  "south australia": "Australie-Méridionale",
  "north carolina": "Caroline du Nord", "south carolina": "Caroline du Sud",
  "north dakota": "Dakota du Nord", "south dakota": "Dakota du Sud",
  "west virginia": "Virginie-Occidentale", "new hampshire": "New Hampshire",
  "new jersey": "New Jersey", "new mexico": "Nouveau-Mexique",
  "new york": "New York", "rhode island": "Rhode Island",
  "district of columbia": "District de Columbia", "pennsylvania": "Pennsylvanie",
  "california": "Californie", "florida": "Floride", "hawaii": "Hawaï",
  "louisiana": "Louisiane", "virginia": "Virginie", "alberta": "Alberta",
  "british columbia": "Colombie-Britannique", "manitoba": "Manitoba",
  "new brunswick": "Nouveau-Brunswick", "newfoundland": "Terre-Neuve",
  "nova scotia": "Nouvelle-Écosse", "ontario": "Ontario", "quebec": "Québec",
  "saskatchewan": "Saskatchewan", "prince edward island": "Île-du-Prince-Édouard",
  "northwest territories": "Territoires du Nord-Ouest", "western cape": "Cap-Occidental",
  "eastern cape": "Cap-Oriental", "gujarat": "Gujarat", "punjab": "Pendjab",
  "west bengal": "Bengale-Occidental", "tamil nadu": "Tamil Nadu",
  "andhra pradesh": "Andhra Pradesh", "kerala": "Kérala",
  "hainan": "Hainan", "sichuan": "Sichuan", "yunnan": "Yunnan",
  "guangdong": "Guangdong", "shandong": "Shandong", "zhejiang": "Zhejiang",
  "hokkaido": "Hokkaidō", "honshu": "Honshū", "kyushu": "Kyūshū",
  "north island": "Île du Nord", "south island": "Île du Sud"
};

const FRENCH_POLITICAL_ENTITY_NAMES = Object.freeze({
  // États souverains et variantes officielles fréquentes dans les sources cartographiques.
  "republic of albania": "Albanie", "kingdom of albania": "Royaume d’Albanie",
  "kingdom of belgium": "Royaume de Belgique", "belgian kingdom": "Royaume de Belgique",
  "kingdom of denmark": "Royaume de Danemark", "kingdom of norway": "Royaume de Norvège",
  "kingdom of sweden": "Royaume de Suède", "kingdom of finland": "Royaume de Finlande",
  "republic of finland": "Finlande", "kingdom of iceland": "Royaume d’Islande",
  "iceland": "Islande", "kingdom of the hellenes": "Royaume de Grèce",
  "hellenic republic": "Grèce", "kingdom of bulgaria": "Royaume de Bulgarie",
  "people s republic of bulgaria": "République populaire de Bulgarie",
  "kingdom of serbs croats and slovenes": "Royaume des Serbes, Croates et Slovènes",
  "kingdom of the serbs croats and slovenes": "Royaume des Serbes, Croates et Slovènes",
  "federal republic of yugoslavia": "République fédérale de Yougoslavie",
  "serbia and montenegro": "Serbie-et-Monténégro", "montenegro": "Monténégro",
  "republic of montenegro": "Monténégro", "republic of kosovo": "Kosovo",
  "ukrainian state": "État ukrainien", "ukrainian people s republic": "République populaire ukrainienne",
  "kingdom of poland": "Royaume de Pologne", "polish republic": "République de Pologne",
  "second polish republic": "Deuxième République polonaise",
  "kingdom of romania": "Royaume de Roumanie", "principality of romania": "Principauté de Roumanie",
  "kingdom of the netherlands": "Royaume des Pays-Bas", "batavian republic": "République batave",
  "kingdom of the two sicilies": "Royaume des Deux-Siciles",
  "kingdom of sardinia piedmont": "Royaume de Sardaigne",
  "sardinia piedmont": "Royaume de Sardaigne", "kingdom of lombardy venetia": "Royaume de Lombardie-Vénétie",
  "lombardy venetia": "Royaume de Lombardie-Vénétie",
  "united kingdom of portugal brazil and the algarves": "Royaume-Uni de Portugal, du Brésil et des Algarves",
  "kingdom of brazil": "Empire du Brésil", "empire of brazil": "Empire du Brésil",
  "brazilian empire": "Empire du Brésil", "republic of gran colombia": "Grande Colombie",
  "gran colombia": "Grande Colombie", "united states of colombia": "États-Unis de Colombie",
  "republic of new granada": "République de Nouvelle-Grenade",
  "united provinces of central america": "Provinces-Unies d’Amérique centrale",
  "federal republic of central america": "République fédérale d’Amérique centrale",
  "united provinces of rio de la plata": "Provinces-Unies du Río de la Plata",
  "argentine confederation": "Confédération argentine", "confederation of argentina": "Confédération argentine",
  "oriental republic of uruguay": "République orientale de l’Uruguay",
  "republic of paraguay": "Paraguay", "empire of mexico": "Empire du Mexique",
  "first mexican empire": "Premier Empire mexicain", "second mexican empire": "Second Empire mexicain",
  "mexican republic": "Mexique", "united mexican states": "États-Unis mexicains",
  "republic of texas": "République du Texas", "texas republic": "République du Texas",
  "kingdom of hawaii": "Royaume d’Hawaï", "republic of hawaii": "République d’Hawaï",
  "kingdom of tahiti": "Royaume de Tahiti", "kingdom of egypt": "Royaume d’Égypte",
  "khedivate of egypt": "Khédivat d’Égypte", "sultanate of egypt": "Sultanat d’Égypte",
  "arab republic of egypt": "Égypte", "kingdom of libya": "Royaume de Libye",
  "libyan arab republic": "République arabe libyenne", "state of libya": "Libye",
  "kingdom of tunisia": "Royaume de Tunisie", "beylik of tunis": "Régence de Tunis",
  "regency of algiers": "Régence d’Alger", "d ey of algiers": "Régence d’Alger",
  "kingdom of morocco": "Royaume du Maroc", "sultanate of morocco": "Sultanat du Maroc",
  "french protectorate in morocco": "Protectorat français au Maroc",
  "kingdom of ethiopia": "Empire éthiopien", "ethiopian empire": "Empire éthiopien",
  "italian east africa": "Afrique orientale italienne", "eritrea": "Érythrée",
  "state of eritrea": "Érythrée", "kingdom of lesotho": "Royaume du Lesotho",
  "basutoland": "Basutoland", "kingdom of swaziland": "Royaume du Swaziland",
  "union of south africa": "Union sud-africaine", "south african republic": "République sud-africaine",
  "transvaal republic": "République du Transvaal", "orange free state": "État libre d’Orange",
  "cape of good hope": "Colonie du Cap", "republic of rhodesia": "Rhodésie",
  "federation of rhodesia and nyasaland": "Fédération de Rhodésie et du Nyassaland",
  "nyasaland": "Nyassaland", "northern rhodesia": "Rhodésie du Nord",
  "southern rhodesia": "Rhodésie du Sud", "kingdom of buganda": "Royaume du Bouganda",
  "kingdom of rwanda": "Royaume du Rwanda", "kingdom of burundi": "Royaume du Burundi",
  "kingdom of dahomey": "Royaume du Dahomey", "dahomey": "Dahomey",
  "republic of dahomey": "République du Dahomey", "kingdom of ashanti": "Royaume ashanti",
  "kingdom of benin": "Royaume du Bénin", "benin empire": "Royaume du Bénin",
  "kingdom of oyo": "Royaume d’Oyo", "oyo empire": "Empire d’Oyo",
  "sokoto caliphate": "Califat de Sokoto", "bornu empire": "Empire du Bornou",
  "kanem bornu empire": "Empire du Kanem-Bornou", "kingdom of kongo": "Royaume du Kongo",
  "kingdom of luba": "Royaume luba", "lunda empire": "Empire lunda",
  "kingdom of mutapa": "Royaume du Monomotapa", "maravi empire": "Empire maravi",
  "kingdom of madagascar": "Royaume de Madagascar", "merina kingdom": "Royaume mérina",
  "kingdom of hawaii": "Royaume d’Hawaï", "kingdom of tonga": "Royaume des Tonga",
  "kingdom of fiji": "Royaume des Fidji", "kingdom of samoa": "Royaume de Samoa",
  "kingdom of siam": "Royaume de Siam", "kingdom of ayutthaya": "Royaume d’Ayutthaya",
  "kingdom of sukhothai": "Royaume de Sukhothaï", "kingdom of lan xang": "Royaume du Lan Xang",
  "kingdom of luang prabang": "Royaume de Luang Prabang",
  "kingdom of champasak": "Royaume de Champassak", "kingdom of cambodia": "Royaume du Cambodge",
  "khmer republic": "République khmère", "democratic kampuchea": "Kampuchéa démocratique",
  "kingdom of laos": "Royaume du Laos", "kingdom of vietnam": "Royaume du Viêt Nam",
  "state of vietnam": "État du Viêt Nam", "empire of vietnam": "Empire du Viêt Nam",
  "kingdom of korea": "Royaume de Corée", "korean empire": "Empire de Corée",
  "provisional government of the republic of korea": "Gouvernement provisoire de la République de Corée",
  "republic of china": "République de Chine", "nationalist china": "Chine nationaliste",
  "people s republic of china": "République populaire de Chine",
  "republic of east turkestan": "République du Turkestan oriental",
  "east turkestan": "Turkestan oriental", "tibetan empire": "Empire du Tibet",
  "kingdom of nepal": "Royaume du Népal", "kingdom of bhutan": "Royaume du Bhoutan",
  "sultanate of aceh": "Sultanat d’Aceh", "sultanate of malacca": "Sultanat de Malacca",
  "malacca sultanate": "Sultanat de Malacca", "sultanate of johor": "Sultanat de Johor",
  "sultanate of brunei": "Sultanat de Brunei", "sultanate of sulu": "Sultanat de Sulu",
  "sultanate of maguindanao": "Sultanat de Maguindanao", "majdapahit empire": "Empire Majapahit",
  "majapahit empire": "Empire Majapahit", "srivijaya empire": "Empire Srivijaya",
  "kingdom of kutai": "Royaume de Kutai", "dutch east indies": "Indes orientales néerlandaises",
  "netherlands east indies": "Indes orientales néerlandaises",
  "portuguese india": "Inde portugaise", "french india": "Inde française",
  "danish india": "Inde danoise", "british india": "Inde britannique",
  "dominion of india": "Union indienne", "republic of india": "Inde",
  "dominion of pakistan": "Dominion du Pakistan", "islamic republic of pakistan": "Pakistan",
  "kingdom of afghanistan": "Royaume d’Afghanistan", "emirate of afghanistan": "Émirat d’Afghanistan",
  "kingdom of iraq": "Royaume d’Irak", "hashemite kingdom of iraq": "Royaume hachémite d’Irak",
  "kingdom of jordan": "Royaume de Jordanie", "hashemite kingdom of jordan": "Royaume hachémite de Jordanie",
  "kingdom of yemen": "Royaume du Yémen", "mutawakkilite kingdom of yemen": "Royaume mutawakkilite du Yémen",
  "people s democratic republic of yemen": "République démocratique populaire du Yémen",
  "sultanate of oman": "Sultanat d’Oman", "sultanate of muscat and oman": "Sultanat de Mascate et d’Oman",
  "trucial states": "États de la Trêve", "trucial oman": "Oman des États de la Trêve",
  "kingdom of saudi arabia": "Royaume d’Arabie saoudite",
  "kingdom of hejaz": "Royaume du Hedjaz", "hashemite kingdom of hejaz": "Royaume hachémite du Hedjaz",
  "emirate of nejd": "Émirat du Nedjd", "emirate of transjordan": "Émirat de Transjordanie",
  "french mandate for syria and the lebanon": "Mandat français sur la Syrie et le Liban",
  "french mandate of syria": "Mandat français de Syrie", "state of greater lebanon": "Grand Liban",
  "kingdom of cyprus": "Royaume de Chypre", "kingdom of armenia": "Royaume d’Arménie",
  "armenian kingdom of cilicia": "Royaume arménien de Cilicie",
  "kingdom of georgia": "Royaume de Géorgie", "georgian democratic republic": "République démocratique de Géorgie",
  "azerbaijan democratic republic": "République démocratique d’Azerbaïdjan",
  "mountainous republic of the northern caucasus": "République montagnarde du Caucase du Nord",
  "kingdom of albania": "Royaume d’Albanie", "principality of albania": "Principauté d’Albanie",
  "kingdom of hungary": "Royaume de Hongrie", "hungarian people s republic": "République populaire hongroise",
  "kingdom of bohemia": "Royaume de Bohême", "czechoslovak republic": "République tchécoslovaque",
  "slovak state": "État slovaque", "first slovak republic": "Première République slovaque",
  "kingdom of croatia": "Royaume de Croatie", "independent state of croatia": "État indépendant de Croatie",
  "kingdom of serbia": "Royaume de Serbie", "principality of serbia": "Principauté de Serbie",
  "kingdom of bulgaria": "Royaume de Bulgarie", "principality of bulgaria": "Principauté de Bulgarie",
  "kingdom of greece": "Royaume de Grèce", "kingdom of montenegro": "Royaume du Monténégro",
  "principality of montenegro": "Principauté du Monténégro",
  "kingdom of lithuania": "Royaume de Lituanie", "kingdom of latvia": "Royaume de Lettonie",
  "kingdom of finland": "Royaume de Finlande", "grand duchy of finland": "Grand-duché de Finlande",
  "kingdom of iceland": "Royaume d’Islande", "kingdom of ireland": "Royaume d’Irlande",
  "irish free state": "État libre d’Irlande", "republic of ireland": "Irlande",
  "irish republic": "République d’Irlande", "kingdom of england": "Royaume d’Angleterre",
  "kingdom of scotland": "Royaume d’Écosse", "kingdom of great britain": "Royaume de Grande-Bretagne",
  "british commonwealth": "Commonwealth britannique", "commonwealth of england": "Commonwealth d’Angleterre",
  "protectorate of england": "Protectorat anglais", "cromwellian england": "Angleterre cromwellienne",
  "first french republic": "Première République française", "second french republic": "Deuxième République française",
  "third french republic": "Troisième République française", "fourth french republic": "Quatrième République française",
  "fifth french republic": "Cinquième République française", "kingdom of france": "Royaume de France",
  "french kingdom": "Royaume de France", "kingdom of the franks": "Royaume des Francs",
  "frankish empire": "Empire carolingien", "carolingian empire": "Empire carolingien",
  "west frankish kingdom": "Royaume de Francie occidentale", "east frankish kingdom": "Royaume de Francie orientale",
  "middle frankish kingdom": "Royaume de Francie médiane", "kingdom of burgundy": "Royaume de Bourgogne",
  "kingdom of arles": "Royaume d’Arles", "kingdom of aquitaine": "Royaume d’Aquitaine",
  "kingdom of navarre": "Royaume de Navarre", "kingdom of aragon": "Royaume d’Aragon",
  "kingdom of castile": "Royaume de Castille", "kingdom of leon": "Royaume de León",
  "kingdom of galicia": "Royaume de Galice", "kingdom of portugal": "Royaume du Portugal",
  "kingdom of spain": "Royaume d’Espagne", "crown of aragon": "Couronne d’Aragon",
  "crown of castile": "Couronne de Castille", "habsburg monarchy": "Monarchie des Habsbourg",
  "habsburg empire": "Empire des Habsbourg", "austro hungarian empire": "Empire austro-hongrois",
  "austrian hungarian empire": "Empire austro-hongrois", "dual monarchy": "Double monarchie",
  "kingdom of hungary": "Royaume de Hongrie", "kingdom of austria": "Empire d’Autriche",
  "archduchy of austria": "Archiduché d’Autriche", "austrian netherlands": "Pays-Bas autrichiens",
  "kingdom of prussia": "Royaume de Prusse", "prussian kingdom": "Royaume de Prusse",
  "kingdom of bavaria": "Royaume de Bavière", "kingdom of saxony": "Royaume de Saxe",
  "kingdom of wurttemberg": "Royaume de Wurtemberg", "kingdom of hanover": "Royaume de Hanovre",
  "kingdom of westphalia": "Royaume de Westphalie", "kingdom of the netherlands": "Royaume des Pays-Bas",
  "north german federation": "Confédération de l’Allemagne du Nord",
  "german reich": "Reich allemand", "third reich": "Troisième Reich",
  "national socialist germany": "Allemagne nazie", "nazi germany": "Allemagne nazie",
  "german reich 1871 1918": "Empire allemand", "german reich 1933 1945": "Troisième Reich",
  "russian tsardom": "Tsarat de Russie", "tsardom of russia": "Tsarat de Russie",
  "grand duchy of moscow": "Grande-principauté de Moscou", "principality of moscow": "Principauté de Moscou",
  "kievian rus": "Rus’ de Kiev", "kievan rus": "Rus’ de Kiev", "ruthenian principality": "Principauté ruthène",
  "kingdom of poland and grand duchy of lithuania": "République des Deux Nations",
  "union of lublin": "Union de Lublin", "ruthenian people s republic": "République populaire ukrainienne",
  "ukrainian soviet socialist republic": "République socialiste soviétique d’Ukraine",
  "byelorussian soviet socialist republic": "République socialiste soviétique de Biélorussie",
  "belorussian soviet socialist republic": "République socialiste soviétique de Biélorussie",
  "esthonian soviet socialist republic": "République socialiste soviétique d’Estonie",
  "latvian soviet socialist republic": "République socialiste soviétique de Lettonie",
  "lithuanian soviet socialist republic": "République socialiste soviétique de Lituanie",
  "moldavian soviet socialist republic": "République socialiste soviétique de Moldavie",
  "georgian soviet socialist republic": "République socialiste soviétique de Géorgie",
  "armenian soviet socialist republic": "République socialiste soviétique d’Arménie",
  "azerbaijan soviet socialist republic": "République socialiste soviétique d’Azerbaïdjan",
  "kazakh soviet socialist republic": "République socialiste soviétique du Kazakhstan",
  "uzbek soviet socialist republic": "République socialiste soviétique d’Ouzbékistan",
  "turkmen soviet socialist republic": "République socialiste soviétique du Turkménistan",
  "tajik soviet socialist republic": "République socialiste soviétique du Tadjikistan",
  "kirghiz soviet socialist republic": "République socialiste soviétique du Kirghizistan",
  "mongolian people s republic": "République populaire mongole",
  "mongolian people s republic": "République populaire mongole",
  "kingdom of saudi arabia": "Royaume d’Arabie saoudite",
  "united arab republic": "République arabe unie", "arab federation": "Fédération arabe",
  "federation of arab republics": "Fédération des républiques arabes",
  "united arab states": "États arabes unis", "arab kingdom of syria": "Royaume arabe de Syrie",
  "kingdom of syria": "Royaume de Syrie", "faisal s syria": "Royaume arabe de Syrie",
  "mandate for palestine": "Mandat britannique de Palestine", "mandatory palestine": "Palestine mandataire",
  "emirate of transjordan": "Émirat de Transjordanie", "kingdom of transjordan": "Royaume de Transjordanie",
  "kingdom of iraq": "Royaume d’Irak", "iraqi republic": "République d’Irak",
  "ba athist iraq": "Irak baasiste", "kingdom of iran": "État impérial d’Iran",
  "imperial state of iran": "État impérial d’Iran", "pahlavi iran": "Iran des Pahlavi",
  "qajar iran": "Iran qadjare", "safavid empire": "Empire séfévide",
  "afsharid dynasty": "Dynastie afcharide", "zand dynasty": "Dynastie Zand",
  "durrani empire": "Empire durrani", "kingdom of afghanistan": "Royaume d’Afghanistan",
  "emirate of afghanistan": "Émirat d’Afghanistan", "kingdom of nepal": "Royaume du Népal",
  "kingdom of bhutan": "Royaume du Bhoutan", "sikkim kingdom": "Royaume du Sikkim",
  "kingdom of sikkim": "Royaume du Sikkim", "kingdom of kashmir": "Royaume du Cachemire",
  "princely state of hyderabad": "État princier d’Hyderabad",
  "kingdom of mysore": "Royaume de Mysore", "maratha confederacy": "Confédération marathe",
  "maratha empire": "Empire marathe", "sikh empire": "Empire sikh",
  "maharaja of kashmir": "État princier du Cachemire", "kingdom of manipur": "Royaume de Manipur",
  "kingdom of assam": "Royaume d’Assam", "ahom kingdom": "Royaume ahom",
  "kingdom of tibet": "Royaume du Tibet", "tibetan government": "Gouvernement tibétain",
  "kingdom of mongolia": "Royaume de Mongolie", "bogd khanate": "Khanat du Bogdo",
  "mongolian people s republic": "République populaire mongole",
  "empire of japan": "Empire du Japon", "japanese shogunate": "Shogunat japonais",
  "ashikaga shogunate": "Shogunat Ashikaga", "tokugawa shogunate": "Shogunat Tokugawa",
  "ryukyu kingdom": "Royaume de Ryūkyū", "kingdom of ryukyu": "Royaume de Ryūkyū",
  "kingdom of joseon": "Royaume de Joseon", "korean empire": "Empire de Corée",
  "manchukuo": "Mandchoukouo", "mengjiang": "Mengjiang",
  "empire of china": "Empire de Chine", "qing empire": "Empire Qing",
  "ming empire": "Empire Ming", "yuan empire": "Empire Yuan",
  "mongol empire": "Empire mongol", "golden horde": "Horde d’Or",
  "il khanate": "Ilkhanat", "chagatai khanate": "Khanat de Djaghataï",
  "timurid empire": "Empire timouride", "samanid empire": "Empire samanide",
  "ghaznavid empire": "Empire ghaznévide", "seljuk empire": "Empire seldjoukide",
  "great seljuk empire": "Grand Empire seldjoukide", "khwarezmian empire": "Empire du Khwarezm",
  "khanate of khiva": "Khanat de Khiva", "emirate of bukhara": "Émirat de Boukhara",
  "bukhara khanate": "Khanat de Boukhara", "kokand khanate": "Khanat de Kokand",
  "crimean khanate": "Khanat de Crimée", "kazakh khanate": "Khanat kazakh",
  "kingdom of jerusalem": "Royaume de Jérusalem", "latin empire": "Empire latin de Constantinople",
  "byzantine empire": "Empire byzantin", "empire of trebizond": "Empire de Trébizonde",
  "empire of nicaea": "Empire de Nicée", "despotate of epirus": "Despotat d’Épire",
  "principality of antioch": "Principauté d’Antioche", "county of tripoli": "Comté de Tripoli",
  "county of edessa": "Comté d’Édesse", "mamluk sultanate": "Sultanat mamelouk",
  "mameluke sultanate": "Sultanat mamelouk", "ayyubid dynasty": "Dynastie ayyoubide",
  "fatimid caliphate": "Califat fatimide", "umayyad caliphate": "Califat omeyyade",
  "abbasid caliphate": "Califat abbasside", "rashidun caliphate": "Califat des Rachidoune",
  "emirate of cordoba": "Émirat de Cordoue", "caliphate of cordoba": "Califat de Cordoue",
  "nasrid kingdom of granada": "Royaume nasride de Grenade", "kingdom of granada": "Royaume de Grenade",
  "almohad caliphate": "Califat almohade", "almoravid dynasty": "Dynastie almoravide",
  "saadi sultanate": "Dynastie saadienne", "alaouite dynasty": "Dynastie alaouite",
  "sultanate of morocco": "Sultanat du Maroc", "kingdom of mali": "Empire du Mali",
  "mali empire": "Empire du Mali", "songhai empire": "Empire songhaï",
  "ghana empire": "Empire du Ghana", "kanem bornu": "Empire du Kanem-Bornou",
  "ethiopian empire": "Empire éthiopien", "abyssinian empire": "Empire d’Abyssinie",
  "kingdom of kongo": "Royaume du Kongo", "congo free state": "État indépendant du Congo",
  "congo free state": "État indépendant du Congo", "zaire": "Zaïre",
  "zaire republic": "République du Zaïre", "kingdom of zanzibar": "Sultanat de Zanzibar",
  "sultanate of zanzibar": "Sultanat de Zanzibar", "kingdom of buganda": "Royaume du Bouganda",
  "kingdom of rwanda": "Royaume du Rwanda", "kingdom of burundi": "Royaume du Burundi",
  "kingdom of lesotho": "Royaume du Lesotho", "kingdom of swaziland": "Royaume du Swaziland",
  "federation of nigeria": "Fédération du Nigeria", "nigerian first republic": "Première République nigériane",
  "republic of biafra": "République du Biafra", "biafra": "Biafra",
  "french upper volta": "Haute-Volta", "upper volta": "Haute-Volta",
  "republic of upper volta": "République de Haute-Volta", "burkina faso": "Burkina Faso",
  "dahomey": "Dahomey", "upper volta republic": "République de Haute-Volta",
  "federation of mali": "Fédération du Mali", "mali federation": "Fédération du Mali",
  "senegambia confederation": "Confédération de Sénégambie", "gambia colony": "Colonie de Gambie",
  "sierra leone colony": "Colonie de Sierra Leone", "gold coast colony": "Colonie de la Côte-de-l’Or",
  "ashanti empire": "Empire ashanti", "oyo empire": "Empire d’Oyo",
  "dutch cape colony": "Colonie néerlandaise du Cap", "boer republics": "Républiques boers",
  "south african union": "Union sud-africaine", "republic of south africa": "République d’Afrique du Sud",
  "kingdom of madagascar": "Royaume de Madagascar", "malagasy republic": "République malgache",
  "malagasy republic": "République malgache", "kingdom of hawaii": "Royaume d’Hawaï",
  "kingdom of tahiti": "Royaume de Tahiti", "kingdom of tonga": "Royaume des Tonga",
  "kingdom of fiji": "Royaume des Fidji", "kingdom of samoa": "Royaume de Samoa",
  "western samoa": "Samoa-Occidentales", "trust territory of the pacific islands": "Territoire sous tutelle des îles du Pacifique",
  "federated states of micronesia": "États fédérés de Micronésie",
  "palau": "Palaos", "republic of palau": "Palaos", "kiribati": "Kiribati",
  "nauru": "Nauru", "tuvalu": "Tuvalu", "vanuatu": "Vanuatu",
  "papua territory": "Territoire de Papouasie", "territory of new guinea": "Territoire de Nouvelle-Guinée",
  "kingdom of hawaii": "Royaume d’Hawaï", "republic of china": "République de Chine",
  "nationalist government of china": "Gouvernement nationaliste chinois",
  "provisional government of the french republic": "Gouvernement provisoire de la République française",
  "free france": "France libre", "vichy france": "Régime de Vichy",
  "french state": "État français", "french provisional government": "Gouvernement provisoire français",
  "french colonial empire": "Empire colonial français", "portuguese colonial empire": "Empire colonial portugais",
  "spanish colonial empire": "Empire colonial espagnol", "dutch colonial empire": "Empire colonial néerlandais",
  "danish colonial empire": "Empire colonial danois", "belgian colonial empire": "Empire colonial belge",
  "british colonial empire": "Empire colonial britannique", "colonial empire of japan": "Empire colonial japonais",
  "kingdom of england": "Royaume d’Angleterre", "kingdom of great britain": "Royaume de Grande-Bretagne",
  "united kingdom of great britain and ireland": "Royaume-Uni de Grande-Bretagne et d’Irlande",
  "united kingdom of great britain and northern ireland": "Royaume-Uni",
  "united states of america": "États-Unis", "united states": "États-Unis",
  "federal republic of germany": "Allemagne", "german democratic republic": "République démocratique allemande",
  "german empire": "Empire allemand", "weimar republic": "République de Weimar",
  "soviet union": "Union soviétique", "union of soviet socialist republics": "Union des républiques socialistes soviétiques",
  "ussr": "URSS", "russian federation": "Fédération de Russie",
  "russian empire": "Empire russe", "tsardom of russia": "Tsarat de Russie",
  "prussian kingdom": "Royaume de Prusse", "holy roman empire": "Saint-Empire romain germanique",
  "ottoman empire": "Empire ottoman", "austro hungarian empire": "Empire austro-hongrois",
  "spanish empire": "Empire espagnol", "portuguese empire": "Empire portugais",
  "mughal empire": "Empire moghol", "maurya empire": "Empire maurya",
  "gupta empire": "Empire Gupta", "maratha empire": "Empire marathe",
  "inca empire": "Empire inca", "aztec empire": "Empire aztèque",
  "blue horde": "Horde bleue", "white horde": "Horde blanche", "black horde": "Horde noire",
  "golden horde": "Horde d’Or", "great horde": "Grande Horde", "nogai horde": "Horde nogaï",
  "orate horde": "Horde oïrate", "kalmyk khanate": "Khanat kalmouk",
  "kazan khanate": "Khanat de Kazan", "astrakhan khanate": "Khanat d’Astrakhan",
  "sibir khanate": "Khanat de Sibir", "kipchak khanate": "Khanat kipchak",
  "white horde khanate": "Khanat de la Horde blanche", "blue horde khanate": "Khanat de la Horde bleue",
  "eastern chagatai khanate": "Khanat oriental de Djaghataï", "western chagatai khanate": "Khanat occidental de Djaghataï",
  "yarkent khanate": "Khanat de Yarkand", "dzungar khanate": "Khanat dzoungar",
  "republic of ragusa": "République de Raguse", "ragusa": "République de Raguse",
  "republic of genoa": "République de Gênes", "genoa": "République de Gênes",
  "republic of florence": "République de Florence", "florentine republic": "République florentine",
  "republic of siena": "République de Sienne", "republic of pisa": "République de Pise",
  "duchy of milan": "Duché de Milan", "duchy of savoy": "Duché de Savoie",
  "duchy of lorraine": "Duché de Lorraine", "duchy of brabant": "Duché de Brabant",
  "duchy of luxembourg": "Duché de Luxembourg", "duchy of cleves": "Duché de Clèves",
  "duchy of athens": "Duché d’Athènes", "duchy of modena": "Duché de Modène",
  "duchy of parma": "Duché de Parme", "duchy of mantua": "Duché de Mantoue",
  "electorate of saxony": "Électorat de Saxe", "electorate of bavaria": "Électorat de Bavière",
  "electorate of the palatinate": "Électorat palatin", "electorate of brandenburg": "Électorat de Brandebourg",
  "swiss confederacy": "Confédération suisse", "old swiss confederacy": "Ancienne Confédération suisse",
  "papal states": "États pontificaux", "pontifical states": "États pontificaux", "papal state": "États pontificaux",
  "teutonic order": "Ordre Teutonique", "livonian order": "Ordre de Livonie",
  "state of the teutonic order": "État monastique des chevaliers Teutoniques",
  "livonian confederation": "Confédération livonienne", "principality of theodoro": "Principauté de Théodoros",
  "theodoro": "Principauté de Théodoros", "despotate of morea": "Despotat de Morée",
  "despotate of serbia": "Despotat de Serbie", "principality of wallachia": "Principauté de Valachie",
  "principality of moldavia": "Principauté de Moldavie", "principality of transylvania": "Principauté de Transylvanie",
  "kingdom of bosnia": "Royaume de Bosnie", "banate of bosnia": "Banat de Bosnie",
  "kingdom of dalmatia": "Royaume de Dalmatie", "kingdom of slavonia": "Royaume de Slavonie",
  "kingdom of sicily": "Royaume de Sicile", "kingdom of naples": "Royaume de Naples",
  "ostrogothic kingdom": "Royaume ostrogoth", "visigothic kingdom": "Royaume wisigoth",
  "vandal kingdom": "Royaume vandale", "kingdom of the vandals": "Royaume des Vandales",
  "kingdom of the suebi": "Royaume des Suèves", "kingdom of asturias": "Royaume des Asturies",
  "county of flanders": "Comté de Flandre", "county of holland": "Comté de Hollande",
  "county of hainaut": "Comté de Hainaut", "county of foix": "Comté de Foix",
  "county of toulouse": "Comté de Toulouse", "county of anjou": "Comté d’Anjou",
  "county of provence": "Comté de Provence", "county of barcelona": "Comté de Barcelone",
  "principality of achaea": "Principauté d’Achaïe", "principality of galilee": "Principauté de Galilée",
  "county of jaffa": "Comté de Jaffa", "emirate of beirut": "Émirat de Beyrouth",
  "emirate of damascus": "Émirat de Damas", "emirate of aleppo": "Émirat d’Alep",
  "sultanate of rum": "Sultanat de Roum", "sultanate of konya": "Sultanat de Konya",
  "kingdom of aksum": "Royaume d’Aksoum", "aksumite empire": "Empire aksoumite",
  "kingdom of kush": "Royaume de Koush", "kingdom of makuria": "Royaume de Makurie",
  "kingdom of alodia": "Royaume d’Alodie", "sultanate of funj": "Sultanat funj",
  "kingdom of mapungubwe": "Royaume de Mapungubwe", "kingdom of zimbabwe": "Royaume du Zimbabwe",
  "kingdom of ife": "Royaume d’Ife", "kingdom of katsina": "Royaume de Katsina",
  "kingdom of kano": "Royaume de Kano", "kingdom of zazzau": "Royaume de Zaria",
  "kingdom of nupe": "Royaume de Noupé", "segu kingdom": "Royaume de Ségou",
  "toucouleur empire": "Empire toucouleur", "wassoulou empire": "Empire wassoulou",
  "kingdom of lunda": "Royaume lunda", "kingdom of kazembe": "Royaume de Kazembe",
  "kingdom of loango": "Royaume de Loango", "kingdom of ndongo": "Royaume de Ndongo",
  "kingdom of matamba": "Royaume de Matamba", "bunyoro kingdom": "Royaume du Bunyoro",
  "kingdom of karagwe": "Royaume de Karagwe", "sultanate of kilwa": "Sultanat de Kilwa",
  "kilwa sultanate": "Sultanat de Kilwa", "sultanate of pate": "Sultanat de Pate",
  "sultanate of mombasa": "Sultanat de Mombasa", "sultanate of mogadishu": "Sultanat de Mogadiscio",
  "ajuran sultanate": "Sultanat ajouran", "adal sultanate": "Sultanat d’Adal",
  "ifat sultanate": "Sultanat d’Ifat", "majerteen sultanate": "Sultanat des Majeerteen",
  "idrisid dynasty": "Dynastie idrisside", "marinid dynasty": "Dynastie mérinide",
  "merinid dynasty": "Dynastie mérinide", "hafsid dynasty": "Dynastie hafside",
  "zayyanid kingdom": "Royaume zianide", "rustamid dynasty": "Dynastie rostémide",
  "rustamid kingdom": "Royaume rostémide", "sultanate of ternate": "Sultanat de Ternate",
  "sultanate of tidore": "Sultanat de Tidore", "sultanate of makassar": "Sultanat de Makassar",
  "sultanate of gowa": "Sultanat de Gowa", "sultanate of banjar": "Sultanat de Banjar",
  "sultanate of mataram": "Sultanat de Mataram", "mataram sultanate": "Sultanat de Mataram",
  "kingdom of pajajaran": "Royaume de Pajajaran", "sunda kingdom": "Royaume de la Sonde",
  "kingdom of bali": "Royaume de Bali", "kingdom of pagan": "Royaume de Pagan",
  "pagan kingdom": "Royaume de Pagan", "konbaung dynasty": "Dynastie Konbaung",
  "taungoo dynasty": "Dynastie Taungû", "kingdom of champa": "Royaume du Champā",
  "champa kingdom": "Royaume du Champā", "kingdom of dai viet": "Royaume du Đại Việt",
  "nguyen dynasty": "Dynastie Nguyễn", "tay son dynasty": "Dynastie Tây Sơn",
  "trinh lords": "Seigneurs Trịnh", "nguyen lords": "Seigneurs Nguyễn",
  "kingdom of goryeo": "Royaume de Goryeo", "balhae": "Royaume de Balhae",
  "silla kingdom": "Royaume de Silla", "unified silla": "Silla unifiée",
  "kingdom of goguryeo": "Royaume de Koguryo", "kingdom of baekje": "Royaume de Paekche",
  "kingdom of yamato": "Royaume de Yamato", "ainu mosir": "Aïnou Moshir",
  "aztec triple alliance": "Triple Alliance aztèque", "mexica empire": "Empire aztèque",
  "tarascan state": "État tarasque", "purepecha empire": "Empire purépecha",
  "kingdom of tlaxcala": "République de Tlaxcala", "maya city states": "Cités-États mayas",
  "muisca confederation": "Confédération muisca", "chimu empire": "Royaume chimú",
  "kingdom of cusco": "Royaume de Cuzco", "mapuche nation": "Nation mapuche",
  "mapuche confederation": "Confédération mapuche", "tupinamba confederation": "Confédération tupinamba",
  "kingdom of araucania and patagonia": "Royaume d’Araucanie et de Patagonie",
  "kingdom of raiatea": "Royaume de Raiatea", "kingdom of bora bora": "Royaume de Bora-Bora",
  "kingdom of rarotonga": "Royaume de Rarotonga", "maori kingdoms": "Royaumes māoris",
  "burmese kingdoms": "Royaumes birmans",
  "emirate of the white sheep turks": "Émirat des Moutons blancs",
  "hafsid caliphate": "Califat hafside", "khanate of sibir": "Khanat de Sibir",
  "kō hawaiʻi paeʻāina": "Royaume d’Hawaï",
  "mamluke sultanate": "Sultanat mamelouk", "mamluke sultanate": "Sultanat mamelouk",
  "oirat confederation": "Confédération oïrate", "sinhalese kingdoms": "Royaumes cinghalais",
  "sultanate of delhi": "Sultanat de Delhi", "delhi sultanate": "Sultanat de Delhi",
  "swiss confederation": "Confédération suisse", "timurid emirates": "Émirats timourides",
  "tuʻi tonga empire": "Empire Tuʻi Tonga",
  "wabanaki (dawnland confederacy)": "Confédération wabanaki",
  "wattasid caliphate": "Dynastie wattasside", "zayyanid caliphate": "Califat zianide",
  "bukara khanate": "Khanat de Boukhara", "ming chinese empire": "Empire chinois des Ming",
  "quazaq khanate": "Khanat kazakh", "republic of the seven zenden": "République des Sept Zenden",
  "tsardom of muscovy": "Tsarat de Moscovie", "central asian khanates": "Khanats d’Asie centrale",
  "manchu empire": "Empire mandchou", "middag kingdom": "Royaume de Middag",
  "hindu kingdoms": "Royaumes hindous", "kong empire": "Empire kong",
  "rattanakosin kingdom": "Royaume de Rattanakosin", "fulani empire": "Empire peul",
  "grand duchy of hesse": "Grand-duché de Hesse", "republic of krakow": "République de Cracovie",
  "tanzania united republic of": "République-Unie de Tanzanie"
});

const FRENCH_MAP_PLACE_NAMES = Object.freeze({
  "beijing": "Pékin", "peking": "Pékin", "cairo": "Le Caire", "al qahira": "Le Caire",
  "timbuktu": "Tombouctou", "samarkand": "Samarcande", "venice": "Venise",
  "moscow": "Moscou", "genoa": "Gênes", "constantinople": "Constantinople",
  "kyoto": "Kyoto", "tenochtitlan": "Tenochtitlan", "cuzco": "Cuzco",
  "london": "Londres", "rome": "Rome", "athens": "Athènes", "vienna": "Vienne",
  "prague": "Prague", "warsaw": "Varsovie", "krakow": "Cracovie", "cracow": "Cracovie",
  "madrid": "Madrid", "barcelona": "Barcelone", "lisbon": "Lisbonne", "seville": "Séville",
  "granada": "Grenade", "cordoba": "Cordoue", "naples": "Naples", "florence": "Florence",
  "milan": "Milan", "turin": "Turin", "marseille": "Marseille", "lyon": "Lyon",
  "brussels": "Bruxelles", "antwerp": "Anvers", "amsterdam": "Amsterdam", "the hague": "La Haye",
  "berlin": "Berlin", "munich": "Munich", "cologne": "Cologne", "frankfurt": "Francfort",
  "hamburg": "Hambourg", "copenhagen": "Copenhague", "stockholm": "Stockholm",
  "oslo": "Oslo", "bergen": "Bergen", "helsinki": "Helsinki", "reykjavik": "Reykjavik",
  "edinburgh": "Édimbourg", "dublin": "Dublin", "belgrade": "Belgrade", "bucharest": "Bucarest",
  "sofia": "Sofia", "budapest": "Budapest", "istanbul": "Istanbul", "edirne": "Edirne",
  "ankara": "Ankara", "izmir": "Izmir", "baghdad": "Bagdad", "tehran": "Téhéran",
  "damascus": "Damas", "aleppo": "Alep", "jerusalem": "Jérusalem", "mecca": "La Mecque",
  "medina": "Médine", "riyadh": "Riyad", "muscat": "Mascate", "aden": "Aden",
  "kabul": "Kaboul", "lahore": "Lahore", "delhi": "Delhi", "new delhi": "New Delhi",
  "mumbai": "Bombay", "bombay": "Bombay", "kolkata": "Calcutta", "calcutta": "Calcutta",
  "chennai": "Madras", "madras": "Madras", "dhaka": "Dacca", "yangon": "Rangoun",
  "rangoon": "Rangoun", "bangkok": "Bangkok", "hanoi": "Hanoï", "saigon": "Saïgon",
  "ho chi minh city": "Hô Chi Minh-Ville", "phnom penh": "Phnom Penh",
  "vientiane": "Vientiane", "jakarta": "Jakarta", "batavia": "Batavia",
  "manila": "Manille", "singapore": "Singapour", "hong kong": "Hong Kong",
  "shanghai": "Shanghai", "nanjing": "Nankin", "nanking": "Nankin",
  "guangzhou": "Canton", "canton": "Canton", "tokyo": "Tokyo", "osaka": "Osaka",
  "hiroshima": "Hiroshima", "seoul": "Séoul", "pyongyang": "Pyongyang",
  "addis ababa": "Addis-Abeba", "alexandria": "Alexandrie", "lagos": "Lagos",
  "nairobi": "Nairobi", "johannesburg": "Johannesbourg", "cape town": "Le Cap",
  "casablanca": "Casablanca", "algiers": "Alger", "tripoli": "Tripoli",
  "tunis": "Tunis", "rabat": "Rabat", "marrakech": "Marrakech",
  "dakar": "Dakar", "accra": "Accra", "kinshasa": "Kinshasa",
  "luanda": "Luanda", "maputo": "Maputo", "khartoum": "Khartoum",
  "new york": "New York", "washington": "Washington", "ottawa": "Ottawa",
  "montreal": "Montréal", "quebec city": "Québec", "mexico city": "Mexico",
  "havana": "La Havane", "kingston": "Kingston", "panama city": "Panama",
  "bogota": "Bogota", "caracas": "Caracas", "quito": "Quito", "lima": "Lima",
  "cuzco": "Cuzco", "cusco": "Cuzco", "la paz": "La Paz", "santiago": "Santiago",
  "buenos aires": "Buenos Aires", "montevideo": "Montevideo",
  "rio de janeiro": "Rio de Janeiro", "sao paulo": "São Paulo",
  "brasilia": "Brasilia", "asuncion": "Asuncion", "paramaribo": "Paramaribo",
  "sydney": "Sydney", "melbourne": "Melbourne", "canberra": "Canberra",
  "auckland": "Auckland", "perth": "Perth", "adelaide": "Adélaïde"
});

export function localizeMapLabel(value, kind = "place", properties = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (kind === "country" || kind === "province") return frenchTerritoryName(raw, properties);
  const key = raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return kind === "city" ? FRENCH_MAP_PLACE_NAMES[key] ?? raw : raw;
}

const frenchRegionNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["fr"], { type: "region" })
  : null;
const ISO3_TO_ISO2 = {"AFG":"AF","ALB":"AL","DZA":"DZ","AND":"AD","AGO":"AO","ATG":"AG","ARG":"AR","ARM":"AM","AUS":"AU","AUT":"AT","AZE":"AZ","BHS":"BS","BHR":"BH","BGD":"BD","BRB":"BB","BLR":"BY","BEL":"BE","BLZ":"BZ","BEN":"BJ","BTN":"BT","BOL":"BO","BIH":"BA","BWA":"BW","BRA":"BR","BRN":"BN","BGR":"BG","BFA":"BF","BDI":"BI","CPV":"CV","KHM":"KH","CMR":"CM","CAN":"CA","CAF":"CF","TCD":"TD","CHL":"CL","CHN":"CN","COL":"CO","COM":"KM","COG":"CG","COD":"CD","CRI":"CR","CIV":"CI","HRV":"HR","CUB":"CU","CYP":"CY","CZE":"CZ","DNK":"DK","DJI":"DJ","DMA":"DM","DOM":"DO","ECU":"EC","EGY":"EG","SLV":"SV","GNQ":"GQ","ERI":"ER","EST":"EE","SWZ":"SZ","ETH":"ET","FJI":"FJ","FIN":"FI","FRA":"FR","GAB":"GA","GMB":"GM","GEO":"GE","DEU":"DE","GHA":"GH","GRC":"GR","GRD":"GD","GTM":"GT","GIN":"GN","GNB":"GW","GUY":"GY","HTI":"HT","HND":"HN","HUN":"HU","ISL":"IS","IND":"IN","IDN":"ID","IRN":"IR","IRQ":"IQ","IRL":"IE","ISR":"IL","ITA":"IT","JAM":"JM","JPN":"JP","JOR":"JO","KAZ":"KZ","KEN":"KE","KIR":"KI","PRK":"KP","KOR":"KR","KWT":"KW","KGZ":"KG","LAO":"LA","LVA":"LV","LBN":"LB","LSO":"LS","LBR":"LR","LBY":"LY","LIE":"LI","LTU":"LT","LUX":"LU","MDG":"MG","MWI":"MW","MYS":"MY","MDV":"MV","MLI":"ML","MLT":"MT","MHL":"MH","MRT":"MR","MUS":"MU","MEX":"MX","FSM":"FM","MDA":"MD","MCO":"MC","MNG":"MN","MNE":"ME","MAR":"MA","MOZ":"MZ","MMR":"MM","NAM":"NA","NRU":"NR","NPL":"NP","NLD":"NL","NZL":"NZ","NIC":"NI","NER":"NE","NGA":"NG","MKD":"MK","NOR":"NO","OMN":"OM","PAK":"PK","PLW":"PW","PAN":"PA","PNG":"PG","PRY":"PY","PER":"PE","PHL":"PH","POL":"PL","PRT":"PT","QAT":"QA","ROU":"RO","RUS":"RU","RWA":"RW","KNA":"KN","LCA":"LC","VCT":"VC","WSM":"WS","SMR":"SM","STP":"ST","SAU":"SA","SEN":"SN","SRB":"RS","SYC":"SC","SLE":"SL","SGP":"SG","SVK":"SK","SVN":"SI","SLB":"SB","SOM":"SO","ZAF":"ZA","SSD":"SS","ESP":"ES","LKA":"LK","SDN":"SD","SUR":"SR","SWE":"SE","CHE":"CH","SYR":"SY","TWN":"TW","TJK":"TJ","TZA":"TZ","THA":"TH","TLS":"TL","TGO":"TG","TON":"TO","TTO":"TT","TUN":"TN","TUR":"TR","TKM":"TM","TUV":"TV","UGA":"UG","UKR":"UA","ARE":"AE","GBR":"GB","USA":"US","URY":"UY","UZB":"UZ","VUT":"VU","VAT":"VA","VEN":"VE","VNM":"VN","YEM":"YE","ZMB":"ZM","ZWE":"ZW","XKX":"XK"};

export function frenchTerritoryName(value, properties = {}) {
  const frenchSource = ["NAME_FR", "name_fr", "name_french", "ADMIN_FR", "ADMIN_0_FR", "FORMAL_FR", "formal_fr", "NAME_1_FR", "name_1_fr", "NAME_ALT_FR", "ABBREV_FR"]
    .map(key => properties?.[key]).find(candidate => typeof candidate === "string" && candidate.trim());
  const raw = String(frenchSource ?? value ?? territoryName(properties) ?? "").trim();
  if (!raw) return "";
  const key = raw.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const owner = String(properties.SUBJECTO ?? properties.SOVEREIGNT ?? "").trim().toLowerCase();
  if (/^(aquitaine|duchy of aquitaine)$/.test(key) && /england|britain/.test(owner)) return "Aquitaine anglaise";
  if (/^(guyenne|gascony)$/.test(key) && /england|britain/.test(owner)) return key === "guyenne" ? "Guyenne anglaise" : "Gascogne anglaise";
  if (FRENCH_POLITICAL_ENTITY_NAMES[key]) return FRENCH_POLITICAL_ENTITY_NAMES[key];
  if (FRENCH_HISTORICAL_NAMES[key]) return FRENCH_HISTORICAL_NAMES[key];
  const administrativeForm = key.match(/^(kingdom|empire|duchy|principality|republic|sultanate|khanate|emirate|county|province|colony|territory|state|region|department|district|governorate|prefecture) of (.+)$/);
  if (administrativeForm) {
    const prefixes = { kingdom: "Royaume", empire: "Empire", duchy: "Duché", principality: "Principauté",
      republic: "République", sultanate: "Sultanat", khanate: "Khanat", emirate: "Émirat",
      county: "Comté", province: "Province", colony: "Colonie", territory: "Territoire",
      state: "État", region: "Région", department: "Département", district: "District", governorate: "Gouvernorat", prefecture: "Préfecture" };
    const place = FRENCH_HISTORICAL_NAMES[administrativeForm[2]];
    if (place) {
      const form = administrativeForm[1];
      const connector = form === "sultanate" && /^[aeiouh]/i.test(place) ? " d’" : " de ";
      return prefixes[form] + connector + place;
    }
  }
  const iso3 = String(properties.ISO_A3 ?? properties.ADM0_A3 ?? properties.SOV_A3 ?? "").toUpperCase();
  const iso2 = String(properties.ISO_A2 ?? properties.iso_a2 ?? ISO3_TO_ISO2[iso3] ?? "").toUpperCase();
  if (frenchRegionNames && /^[A-Z]{2}$/.test(iso2) && iso2 !== "-99") {
    const localized = frenchRegionNames.of(iso2);
    if (localized && localized !== iso2) return localized;
  }
  return raw;
}

export function buildTerritoryLabels(territories) {
  const features = [];
  for (const feature of territories?.features ?? []) {
    const rawName = territoryName(feature.properties);
    const name = frenchTerritoryName(rawName, feature.properties);
    const point = polygonInteriorLabelPoint(feature);
    if (!name || !point || !point.every(Number.isFinite)) continue;
    features.push({
      type: "Feature",
      properties: { name, kind: "country", minZoom: 1, priority: 90 },
      geometry: { type: "Point", coordinates: point }
    });
  }
  return { type: "FeatureCollection", features };
}

export function territoryColor(feature) {
 const p=feature?.properties??{},name=territoryName(p)||"terra",owner=String(p.SUBJECTO??p.SOVEREIGNT??"").trim()||name;
 const identity=String(p.ADM0_A3??p.SOV_A3??p.ISO_A3??owner).toUpperCase(),n=owner.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase(),region=name.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 if(identity==="FRA"||/^(france|french republic|french empire)$/.test(n)||/french|new france/.test(region))return "#3159A6";
 if(BRITISH_TERRITORY_NAMES.has(n)||/british/.test(region))return "#B83A43";
 if(SPANISH_TERRITORY_NAMES.has(n)||/spanish|spain|new spain|peru \(spain\)/.test(region))return "#D9A52B";
 if(PORTUGUESE_TERRITORY_NAMES.has(n))return "#3D805B";
 if(/ottoman/.test(n))return "#A63C42";if(/holy roman empire|germany|german/.test(n))return "#A98A42";
 let hash=2166136261;for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);return TERRITORY_PALETTE[(hash>>>0)%TERRITORY_PALETTE.length];
}
const selectedTerritoryCollator = new Intl.Collator(undefined, { sensitivity: "accent" });
function territoryMatchesSelectedCountry(feature, selectedCountry) {
  if (!selectedCountry) return false;
  const p = feature?.properties ?? {};
  for (let index = 0; index < TERRITORY_MATCH_FIELDS.length; index++) {
    const name = p[TERRITORY_MATCH_FIELDS[index]];
    if (name && selectedTerritoryCollator.compare(String(name), selectedCountry) === 0) return true;
  }
  return false;
}
export function classifyHistoricalTerritoryStyle(feature){
 const p=feature?.properties??{},s=String(p.historicalStatus??p.status??p.STATUS??p.CONTROL_STATUS??"").toLowerCase();
 if(CONTESTED_STATUSES.has(s)||p.DISPUTED===1||p.DISPUTED==="1")return "contested";
 if(INFLUENCE_STATUSES.has(s))return "influence";
 if(UNCLAIMED_STATUSES.has(s))return "unclaimed";return "sovereign";
}
export function classifyPhysicalCellVisual(c){
  // Les cellules sont un support de calcul : elles ne sont jamais dessinées en rectangles.
  return null;
}
function drawPhysicalWorldLayer(ctx,world,w,h,projection,terrainGrid=null){
 if(!world)return 0;let count=0;ctx.save();
 const renderScale = projection.renderScale ?? 1;
 const standardDash = [2 * renderScale, 3 * renderScale];
 const earthquakeDash = [5 * renderScale, 4 * renderScale];
 // Repère les événements physiques sans créer de tableau ni de callback temporaire.
 const events = world.events ?? [];
 let hasTerrainEvent = false;
 for (const event of events) {
  if (event.type === "tsunami" || event.type === "meteor-impact" || event.type === "earthquake") {
   hasTerrainEvent = true;
   break;
  }
 }
 if (terrainGrid && projection.type === "equirectangular" && hasTerrainEvent) {
  drawTerrainRaster(ctx,w,h,terrainGrid,projection.viewport,1,false,world,true);
 }
 const zoom=Number(projection.lodZoom??projection.viewport?.zoom??1);
 for(const event of events){
  const center=projectCoordinate([event.longitude,event.latitude],w,h,projection);
  const north=projectCoordinate([event.longitude,Math.min(89.8,event.latitude+event.radiusKm/111.32)],w,h,projection);
  const east=projectCoordinate([event.longitude+event.radiusKm/(111.32*Math.max(.18,Math.cos(event.latitude*Math.PI/180))),event.latitude],w,h,projection);
  const radius=center?Math.max(2,Math.min(900,Math.hypot((east?.x??center.x)-center.x,(north?.y??center.y)-center.y)/Math.SQRT2)):0;
   if(center&&radius>1&&!event.visualExpired){
   ctx.save();ctx.globalAlpha=.68;ctx.lineWidth=Math.max(1,Math.min(3,1.25*Math.sqrt(zoom)))*(projection.renderScale??1);
   ctx.strokeStyle=event.type==="tsunami"?"rgba(105,210,225,.9)":event.type==="earthquake"?"rgba(235,190,125,.92)":"rgba(255,154,83,.95)";
   ctx.setLineDash?.(event.type === "earthquake" ? earthquakeDash : standardDash);
   for(const scale of [.62,1]){ctx.beginPath();ctx.arc(center.x,center.y,radius*scale,0,Math.PI*2);ctx.stroke();}
   if(event.type==="earthquake"){
    ctx.setLineDash?.([]);ctx.strokeStyle="rgba(255,226,177,1)";ctx.lineWidth=Math.max(3,2.4*Math.sqrt(zoom))*(projection.renderScale??1);
    const angle=(event.ruptureBearingDeg??35)*Math.PI/180;
    for(const sign of [-1,1]){const dx=Math.cos(angle+Math.PI/2)*radius*.8*sign,dy=Math.sin(angle+Math.PI/2)*radius*.8*sign;ctx.beginPath();ctx.moveTo(center.x-dx,center.y-dy);ctx.lineTo(center.x-dx*.28+Math.cos(angle)*3,center.y-dy*.28+Math.sin(angle)*3);ctx.lineTo(center.x+dx*.18-Math.cos(angle)*2,center.y+dy*.18-Math.sin(angle)*2);ctx.lineTo(center.x+dx*.72,center.y+dy*.72);ctx.stroke();}
   }
   ctx.restore();
  }
  if(event.type==="meteor-impact"&&!event.surfaceExpired&&center&&terrainGrid&&sampleElevation(terrainGrid,event.longitude,event.latitude)>=0){
   const lavaNorth=projectCoordinate([event.longitude,Math.min(89.8,event.latitude+(event.lavaRadiusKm??8)/111.32)],w,h,projection);
   const lavaEast=projectCoordinate([event.longitude+(event.lavaRadiusKm??8)/(111.32*Math.max(.18,Math.cos(event.latitude*Math.PI/180))),event.latitude],w,h,projection);
   const lavaRadius=Math.max(5,Math.min(48,Math.hypot((lavaEast?.x??center.x)-center.x,(lavaNorth?.y??center.y)-center.y)/Math.SQRT2));
   if(typeof ctx.createRadialGradient==="function"){const glow=ctx.createRadialGradient(center.x,center.y,Math.max(1,lavaRadius*.08),center.x,center.y,lavaRadius);
   glow.addColorStop(0,"rgba(255,250,174,.98)");glow.addColorStop(.24,"rgba(255,119,24,.96)");glow.addColorStop(.62,"rgba(220,45,12,.78)");glow.addColorStop(1,"rgba(110,22,12,0)");
   ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=glow;ctx.beginPath();ctx.arc(center.x,center.y,lavaRadius,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  if(event.type==="earthquake"&&center&&radius>1){
   // Cicatrice diffuse permanente : elle reste après la disparition des anneaux.
   if(typeof ctx.createRadialGradient==="function"){const scar=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,radius);
   scar.addColorStop(0,"rgba(85,55,38,.34)");scar.addColorStop(.42,"rgba(105,73,55,.20)");scar.addColorStop(.78,"rgba(105,73,55,.08)");scar.addColorStop(1,"rgba(105,73,55,0)");
   ctx.save();ctx.fillStyle=scar;ctx.beginPath();ctx.arc(center.x,center.y,radius,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  if(!event.visualExpired)count++;
 }
 ctx.restore();return count;
}
export function getTerritoryFillSimplificationProfile(zoom = 1) {
  return getLandCoastSimplificationProfile(zoom);
}

// Les contours politiques suivent exactement le littoral du masque terrestre.
// Cela évite qu'une seconde géométrie plus fine fasse ressortir des micro-îles
// ou des découpes côtières absentes du fond physique.
export function getTerritoryOutlineSimplificationProfile(zoom = 1) {
  return getLandCoastSimplificationProfile(zoom);
}

function drawTerritoryLayer(context,collection,width,height,projection,selectedCountry="",pass="all",fillOpacity=.52){
 if(!collection?.features)return 0;let drawn=0;const zoom=Number(projection.lodZoom??projection.viewport?.zoom??1),profile=pass==="fill"?getTerritoryFillSimplificationProfile(zoom):getTerritoryOutlineSimplificationProfile(zoom),renderScale=projection.renderScale??1,influenceDash=[3*renderScale,3*renderScale],contestedDash=[2*renderScale,2*renderScale];context.save();
 for(const feature of collection.features){if(!feature?.geometry||isAntarcticLandFeature(feature))continue;const status=classifyHistoricalTerritoryStyle(feature),nationalColor=territoryColor(feature),selected=territoryMatchesSelectedCountry(feature,selectedCountry);
  const paint=path=>{
   const fillPath=()=>{if(path)context.fill(path,"evenodd");else context.fill("evenodd");};
   const strokePath=()=>{if(path)context.stroke(path);else context.stroke();};
   if(pass!=="outlines"){const statusOpacity=status==="influence"?.28:status==="contested"?.72:status==="unclaimed"?.12:1;context.globalCompositeOperation="source-over";context.globalAlpha=fillOpacity*statusOpacity;context.fillStyle=nationalColor;fillPath();}
   if(pass!=="fill"){context.globalCompositeOperation="source-over";context.globalAlpha=status==="influence"?.42:.78;context.setLineDash?.(status==="influence"?influenceDash:status==="contested"?contestedDash:[]);context.strokeStyle=nationalColor;context.lineWidth=Math.max(.72,Math.min(1.45,.88*Math.sqrt(zoom)))*renderScale;context.lineJoin="round";strokePath();context.setLineDash?.([]);context.globalAlpha=.46;context.strokeStyle="#14232c";context.lineWidth=Math.max(.45,Math.min(.85,.55*Math.sqrt(zoom)))*renderScale;strokePath();
    if(selected){context.globalAlpha=.96;context.strokeStyle="#fff0b4";context.lineWidth=Math.max(1.5,Math.min(2.8,1.7*Math.sqrt(zoom)))*renderScale;strokePath();context.globalAlpha=.9;context.strokeStyle="#fff";context.lineWidth=.65*renderScale;strokePath();}
   }
  };
  const path=getProjectedPath(feature,width,height,projection,profile);if(path)paint(path);else{context.beginPath();if(!traceGeometry(context,feature.geometry,width,height,projection,profile))continue;paint(null);}
  drawn++;
 }
 context.restore();return drawn;
}

function pointLon(value){return Number(value)||0;}
export function getCityLabelLimit(_zoom = 1) {
  return 5;
}

/** Calcule un budget stable de labels secondaires selon le zoom et la densité demandée. */
export function getMapLabelCandidateProfile(zoom = 1, labelDensity = 1) {
  const rawZoom = Number(zoom);
  const level = Number.isFinite(rawZoom) ? Math.max(1, Math.min(20, rawZoom)) : 1;
  const rawDensity = Number(labelDensity);
  const density = Number.isFinite(rawDensity) && rawDensity > 0
    ? Math.max(0.5, Math.min(1.1, rawDensity)) : 1;
  const baseCandidateLimit = level < 1.5 ? 48 : level < 3 ? 90 : level < 6 ? 180 : Infinity;
  return {
    density,
    candidateLimit: Number.isFinite(baseCandidateLimit)
      ? Math.max(24, Math.floor(baseCandidateLimit * density)) : Infinity,
    cityLabelLimit: Math.max(2, Math.round(getCityLabelLimit(level) * density))
  };
}

/** Taille des labels interpolée sans seuil brutal, en pixels de rendu. */
export function getMapLabelFontSize(kind, zoom = 1, renderScale = 1) {
  const rawZoom = Number(zoom);
  const level = Number.isFinite(rawZoom) ? Math.max(1, Math.min(20, rawZoom)) : 1;
  const smooth = value => value * value * (3 - 2 * value);
  const blend = (value, start, end) => smooth(Math.max(0, Math.min(1, (value - start) / (end - start))));
  const base = kind === "continent" || kind === "country" ? 13
    : kind === "ocean" ? 11.5
      : kind === "sea" ? 10.2
        : kind === "strait" ? 9.2
          : kind === "province" ? 9 : 10;
  const progressive = kind === "country" ? 2 * blend(level, 1.5, 4) : 0.8 * blend(Math.log(level), 0, Math.log(20));
  const rawScale = Number(renderScale);
  const scale = Number.isFinite(rawScale) ? Math.max(0.1, rawScale) : 1;
  return (base + progressive) * scale;
}

/** Résout la signature typographique et le contraste d'un label selon l'ère active. */
export function getMapLabelStyle(kind, theme = {}, fontSize = 12, renderScale = 1) {
  const typography = theme.typography ?? {};
  const colors = theme.colors ?? {};
  const displayFont = typography.display || "Georgia";
  const bodyFont = typography.body || "Arial";
  const isDisplay = kind === "country" || kind === "continent";
  const family = isDisplay ? displayFont : bodyFont;
  const weight = kind === "country" ? 700 : kind === "continent" ? 600 : kind === "city" ? 600 : 500;
  const isOcean = kind === "ocean" || kind === "sea" || kind === "strait";
  const font = `${isOcean ? "italic " : ""}${weight} ${fontSize}px "${family}", ${isDisplay ? "Georgia, serif" : "Arial, sans-serif"}`;
  const surface = colors.surface || "#0c1d27";
  const text = colors.text || "#f0e6cf";
  const accent = colors.accent || "#d9b878";
  const isCountry = kind === "country";
  const isCity = kind === "city";
  const isContinent = kind === "continent";
  return {
    font,
    fill: isCity ? accent : text,
    stroke: surface,
    alpha: isCountry ? 1 : isCity ? 0.96 : isContinent ? 0.9 : kind === "ocean" ? 0.74 : kind === "sea" ? 0.68 : kind === "strait" ? 0.62 : 0.76,
    lineWidth: (isCountry ? 4.4 : isCity ? 2.8 : isContinent ? 3.2 : kind === "ocean" ? 2.2 : kind === "sea" ? 1.95 : kind === "strait" ? 1.7 : 3) * renderScale,
    shadowColor: surface,
    shadowBlur: (isCountry ? 3.2 : isContinent ? 2 : isOcean ? 1.1 : 0) * renderScale,
    markerFill: accent,
    markerStroke: surface
  };
}

/** Calcule une emprise unique pour collision, interaction et placement du marqueur. */
export function getMapLabelLayout(kind, point, textWidth, fontSize, renderScale = 1) {
  const rawScale = Number(renderScale);
  const rawWidth = Number(textWidth);
  const rawSize = Number(fontSize);
  const rawX = Number(point?.x);
  const rawY = Number(point?.y);
  const scale = Number.isFinite(rawScale) ? Math.max(0.1, rawScale) : 1;
  const width = Number.isFinite(rawWidth) ? Math.max(0, rawWidth) : 0;
  const size = Number.isFinite(rawSize) ? Math.max(1, rawSize) : 1;
  const x = Number.isFinite(rawX) ? rawX : 0;
  const pointY = Number.isFinite(rawY) ? rawY : 0;
  const isCountry = kind === "country";
  const isCity = kind === "city";
  const horizontalPadding = (isCountry ? 7 : isCity ? 6 : 4) * scale;
  const verticalPadding = (isCountry ? 6 : isCity ? 5 : 3) * scale;
  const labelY = pointY + (isCity ? 5 : 0) * scale;
  const textLeft = x - width / 2;
  const box = {
    left: textLeft - horizontalPadding,
    right: textLeft + width + horizontalPadding,
    top: labelY - size - verticalPadding,
    bottom: labelY + (isCity ? 7 : 4) * scale
  };
  const hitPadding = (isCity ? 3 : 1.5) * scale;
  const hitBounds = {
    left: box.left - hitPadding,
    right: box.right + hitPadding,
    top: box.top - hitPadding,
    bottom: box.bottom + hitPadding
  };
  return {
    textX: textLeft,
    textY: labelY,
    box,
    hitBounds,
    marker: isCity ? {
      x,
      y: pointY - 1 * scale,
      radius: 2.2 * scale,
      lineWidth: 1.2 * scale
    } : null
  };
}

/** Vérifie que la zone interactive englobe l'emprise visuelle et le marqueur. */
export function isMapLabelLayoutGeometryConsistent(layout) {
  if (!layout?.box || !layout?.hitBounds) return false;
  const normalize = bounds => {
    const value = {
      left: Number(bounds.left), right: Number(bounds.right),
      top: Number(bounds.top), bottom: Number(bounds.bottom)
    };
    if (!Object.values(value).every(Number.isFinite)
      || value.left > value.right || value.top > value.bottom) return null;
    return value;
  };
  const box = normalize(layout.box);
  const hit = normalize(layout.hitBounds);
  const textX = Number(layout.textX), textY = Number(layout.textY);
  if (!box || !hit || !Number.isFinite(textX) || !Number.isFinite(textY)) return false;
  const epsilon = 1e-7;
  if (hit.left > box.left + epsilon || hit.right < box.right - epsilon
    || hit.top > box.top + epsilon || hit.bottom < box.bottom - epsilon) return false;
  if (textX < box.left - epsilon || textX > box.right + epsilon
    || textY < box.top - epsilon || textY > box.bottom + epsilon) return false;
  if (layout.marker) {
    const marker = layout.marker;
    const x = Number(marker.x), y = Number(marker.y);
    const radius = Number(marker.radius), lineWidth = Number(marker.lineWidth);
    if (![x, y, radius, lineWidth].every(Number.isFinite) || radius < 0 || lineWidth < 0) return false;
    const extent = radius + lineWidth / 2;
    if (x - extent < hit.left - epsilon || x + extent > hit.right + epsilon
      || y - extent < hit.top - epsilon || y + extent > hit.bottom + epsilon) return false;
  }
  return true;
}

/** Ajuste une emprise au viewport sans dissocier texte, marqueur et zone interactive. */
export function fitMapLabelLayoutToViewport(layout, width, height, margin = 8) {
  if (!layout?.box || !layout?.hitBounds) return null;
  const viewportWidth = Number(width), viewportHeight = Number(height);
  const rawMargin = Number(margin);
  const safeMargin = Number.isFinite(rawMargin) ? Math.max(0, rawMargin) : 8;
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
    || viewportWidth <= safeMargin * 2 || viewportHeight <= safeMargin * 2) return null;
  const normalizeBounds = bounds => {
    const normalized = {
      left: Number(bounds.left), right: Number(bounds.right),
      top: Number(bounds.top), bottom: Number(bounds.bottom)
    };
    if (!Object.values(normalized).every(Number.isFinite)
      || normalized.left > normalized.right || normalized.top > normalized.bottom) return null;
    return normalized;
  };
  if (!isMapLabelLayoutGeometryConsistent(layout)) return null;
  const box = normalizeBounds(layout.box);
  const hitBounds = normalizeBounds(layout.hitBounds);
  const textX = Number(layout.textX), textY = Number(layout.textY);
  if (!box || !hitBounds || !Number.isFinite(textX) || !Number.isFinite(textY)) return null;
  let marker = null;
  if (layout.marker) {
    marker = {
      ...layout.marker,
      x: Number(layout.marker.x), y: Number(layout.marker.y),
      radius: Number(layout.marker.radius), lineWidth: Number(layout.marker.lineWidth)
    };
    if (![marker.x, marker.y, marker.radius, marker.lineWidth].every(Number.isFinite)
      || marker.radius < 0 || marker.lineWidth < 0) return null;
  }
  const availableWidth = viewportWidth - safeMargin * 2;
  const availableHeight = viewportHeight - safeMargin * 2;
  if (hitBounds.right - hitBounds.left > availableWidth
    || hitBounds.bottom - hitBounds.top > availableHeight) return null;
  const dx = hitBounds.left < safeMargin ? safeMargin - hitBounds.left
    : hitBounds.right > viewportWidth - safeMargin ? viewportWidth - safeMargin - hitBounds.right : 0;
  const dy = hitBounds.top < safeMargin ? safeMargin - hitBounds.top
    : hitBounds.bottom > viewportHeight - safeMargin ? viewportHeight - safeMargin - hitBounds.bottom : 0;
  const shiftBounds = bounds => ({
    left: bounds.left + dx, right: bounds.right + dx,
    top: bounds.top + dy, bottom: bounds.bottom + dy
  });
  return {
    ...layout,
    textX: textX + dx,
    textY: textY + dy,
    box: shiftBounds(box),
    hitBounds: shiftBounds(hitBounds),
    marker: marker ? { ...marker, x: marker.x + dx, y: marker.y + dy } : null,
    viewportOffset: { x: dx, y: dy }
  };
}

function drawMapLabels(context, collection, width, height, projection, theme, zoom, physicalWorld = null, labelDensity = 1) {
  if (!collection?.features) return [];
  const hits = [];
  const occupiedCells = new Map();
  const renderScale = projection.renderScale ?? 1;
  const collisionCellSize = LABEL_COLLISION_CELL_SIZE * renderScale;
  // L'ordre de priorité est calculé une seule fois par collection ; le seuil de zoom
  // reste évalué à chaque rendu pour que les labels apparaissent au bon moment.
  const densityProfile = getMapLabelCandidateProfile(zoom, labelDensity);
  const candidates = getSortedLabelCandidates(collection);
  const cityLabelLimit = densityProfile.cityLabelLimit;
  let cityLabelsDrawn = 0;
  context.save();
  let visibleSecondaryCandidates = 0;
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const feature = candidates[candidateIndex];
    const kind = feature.properties?.kind ?? "place";
    if (Number(feature.properties?.minZoom ?? 1) > zoom) continue;
    if (zoom < 3 && kind === "province") continue;
    if (kind === "city" && cityLabelsDrawn >= cityLabelLimit) continue;
    if (feature.geometry?.type !== "Point") continue;
    const point = projectCoordinate(feature.geometry.coordinates, width, height, projection);
    if (!point || point.x < 12 * renderScale || point.x > width - 12 * renderScale || point.y < 12 * renderScale || point.y > height - 12 * renderScale) continue;
    const name = localizeMapLabel(feature.properties?.name, kind, feature.properties ?? {});
    if (!name) continue;
    // Les candidats hors écran ou non éligibles ne consomment pas le budget visible.
    if (kind !== "country" && visibleSecondaryCandidates++ >= densityProfile.candidateLimit) continue;
    const permanentlySubmerged = kind === "city" && isCityPermanentlySubmerged(feature, physicalWorld);
    const fontSize = getMapLabelFontSize(kind, zoom, renderScale);
    const displayName = kind === "country" ? name.toLocaleUpperCase("fr-FR") : name;
    const style = getMapLabelStyle(kind, theme, fontSize, renderScale);
    context.font = style.font;
    const textWidth = getCachedLabelTextWidth(context, style.font, displayName);
    const rawLayout = getMapLabelLayout(kind, point, textWidth, fontSize, renderScale);
    const layout = fitMapLabelLayoutToViewport(rawLayout, width, height, 8 * renderScale);
    if (!layout) continue;
    const { textX: x, textY: y, box } = layout;
    if (labelBoxCollides(layout.hitBounds, occupiedCells, collisionCellSize)) continue;
    addLabelBox(layout.hitBounds, occupiedCells, collisionCellSize);
    if (kind === "city") cityLabelsDrawn++;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineWidth = style.lineWidth;
    context.lineJoin = "round";
    context.strokeStyle = style.stroke;
    context.fillStyle = permanentlySubmerged ? "#92999d" : style.fill;
    context.globalAlpha = style.alpha;
    context.shadowColor = style.shadowColor;
    context.shadowBlur = style.shadowBlur;
    context.strokeText(displayName, x, y);
    context.fillText(displayName, x, y);
    if (layout.marker) {
      context.shadowBlur = 0;
      context.beginPath();
      context.arc(layout.marker.x, layout.marker.y, layout.marker.radius, 0, Math.PI * 2);
      context.fillStyle = permanentlySubmerged ? "#7f898e" : style.markerFill;
      context.fill();
      context.strokeStyle = style.markerStroke;
      context.lineWidth = layout.marker.lineWidth;
      context.stroke();
    }
    hits.push({ name: displayName, kind, x: point.x, y: point.y, bounds: layout.hitBounds, coordinates: feature.geometry.coordinates });
  }
  context.restore();
  return hits;
}

const labelTextWidthCache = new Map();
const LABEL_TEXT_WIDTH_CACHE_LIMIT = 4096;

function getCachedLabelTextWidth(context, font, text) {
  const key = `${font}\\u0000${text}`;
  if (labelTextWidthCache.has(key)) {
    const width = labelTextWidthCache.get(key);
    labelTextWidthCache.delete(key);
    labelTextWidthCache.set(key, width);
    return width;
  }
  const width = context.measureText(text).width;
  labelTextWidthCache.set(key, width);
  while (labelTextWidthCache.size > LABEL_TEXT_WIDTH_CACHE_LIMIT) {
    labelTextWidthCache.delete(labelTextWidthCache.keys().next().value);
  }
  return width;
}

const physicalTerrainChangeCache = new WeakMap();
function hasPhysicalTerrainChanges(world) {
  if (!world?.currentCells?.length) return false;
  const revision = Number(world.revision ?? 0);
  const cached = physicalTerrainChangeCache.get(world);
  if (cached?.revision === revision) return cached.changed;
  let changed = false;
  for (const cell of world.currentCells) {
    if (Boolean(cell?.inundated)
      || Math.abs(Number(cell?.elevationDeltaM) || 0) > 0.01
      || Number(cell?.tsunamiWaterDepthM) > 0.01
      || Number(cell?.waterDepthM) > 0.01) {
      changed = true;
      break;
    }
  }
  physicalTerrainChangeCache.set(world, { revision, changed });
  return changed;
}

function parseWebGLColor(value) {
  if (typeof value !== "string") return [0.32, 0.39, 0.31, 1];
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).concat(1);
  }
  const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgba) return [Number(rgba[1]) / 255, Number(rgba[2]) / 255,
    Number(rgba[3]) / 255, rgba[4] === undefined ? 1 : Number(rgba[4])];
  return [0.32, 0.39, 0.31, 1];
}

const renderObjectIds = new WeakMap();
let nextRenderObjectId = 1;
const staticLayerCache = new WeakMap();
const STATIC_LAYER_CACHE_LIMIT = 3;
const STATIC_LAYER_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const STATIC_LAYER_TIMING_KEYS = [
  "relief-base", "land-mask-path", "terres-et-cotes", "land-feature-classification",
  "land-canvas-fallback", "land-webgl-pipeline", "land-webgl-geometry-build",
  "land-webgl-buffer-upload", "land-webgl-cache-build", "land-webgl-draw-submit",
  "land-webgl-compose", "land-coast-canvas-fallback", "territoires-couleurs",
  "ombrage-multidirectionnel", "hachures", "glaciers", "lacs", "rivières", "repères-altitude"
];

function renderObjectId(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return 0;
  let id = renderObjectIds.get(value);
  if (!id) { id = nextRenderObjectId++; renderObjectIds.set(value, id); }
  return id;
}

function captureTerrainLayerStage(target, stage) {
  if (typeof window === "undefined" || window.__TERRA_CAPTURE_LAYER_STAGES !== true
    || !target?.canvas || typeof target.drawImage !== "function") return;
  const source = target.canvas;
  let surface;
  if (typeof OffscreenCanvas !== "undefined") surface = new OffscreenCanvas(source.width, source.height);
  else if (typeof document !== "undefined") {
    surface = document.createElement("canvas");
    surface.width = source.width;
    surface.height = source.height;
  }
  const context = surface?.getContext("2d");
  if (!context) return;
  context.drawImage(source, 0, 0);
  window.__TERRA_LAYER_STAGE_CANVASES ??= {};
  window.__TERRA_LAYER_STAGE_CANVASES[stage] = surface;
}

function staticLayerSignature(width, height, pixelRatio, year, theme, projection, options, layers) {
  const view = projection.viewport ?? {};
  const terrainGpu = getTerrainWebGLTileStats(options.terrainTileStore);
  return [
    width, height, pixelRatio, year, theme.id, options.technologyLevel ?? 0,
    projection.type, Number(view.zoom ?? 1).toFixed(4),
    Number(view.centerLongitude ?? 0).toFixed(4), Number(view.centerLatitude ?? 0).toFixed(4),
    projection.lodZoom, projection.renderScale,
    renderObjectId(layers.land?.features), renderObjectId(layers.glaciers?.features),
    renderObjectId(layers.lakes?.features), renderObjectId(layers.rivers?.features),
    renderObjectId(layers.elevationPoints?.features), renderObjectId(layers.territories?.features),
    renderObjectId(options.terrain), isTerrainHillshadePrepared(options.terrain) ? 1 : 0,
    renderObjectId(options.terrainTileStore), terrainGpu?.uploads ?? 0, terrainGpu?.tileCount ?? 0,
    terrainGpu?.lod ?? -1, terrainGpu?.visibleTiles ?? 0,
    options.terrainEnabled !== false ? 1 : 0,
    globalThis.__TERRA_DISABLE_TERRAIN_WEBGL_TILES === true ? 1 : 0,
    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL === true ? 1 : 0,
    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL === true ? 1 : 0,
    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST === true ? 1 : 0,
    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES === true ? 1 : 0,
    globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES === true ? 1 : 0,
    typeof window !== "undefined" && window.__TERRA_CAPTURE_LAYER_STAGES === true ? 1 : 0, options.terrainQuality ?? 1,
    options.terrainMode ?? "political", Number(options.physicalWorld?.revision ?? 0),
    Number(options.countryOpacity ?? 0.52), options.interactive ? 1 : 0
  ].join("|");
}

function getStaticLayerCache(canvas) {
  let cache = staticLayerCache.get(canvas);
  if (!cache) { cache = new Map(); staticLayerCache.set(canvas, cache); }
  return cache;
}

function createStaticSurface(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    return surface;
  }
  return null;
}

export function getStaticLayerCacheStats(canvas) {
  const cache = canvas && staticLayerCache.get(canvas);
  return {
    entries: cache?.size ?? 0,
    maxEntries: STATIC_LAYER_CACHE_LIMIT,
    bytes: cache?.bytes ?? 0,
    maxBytes: STATIC_LAYER_CACHE_MAX_BYTES
  };
}

/** Profil décoratif de profondeur océanique, accordé à la palette historique. */
export function getOceanDepthProfile(theme = {}) {
  const era = theme.id || "present";
  const profiles = {
    exploration: { centerAlpha: 0.015, middleAlpha: 0.07, edgeAlpha: 0.29, shelfAlpha: 0.045, shelfRadius: 0.52 },
    westphalia: { centerAlpha: 0.012, middleAlpha: 0.065, edgeAlpha: 0.27, shelfAlpha: 0.04, shelfRadius: 0.5 },
    revolution: { centerAlpha: 0.01, middleAlpha: 0.055, edgeAlpha: 0.23, shelfAlpha: 0.03, shelfRadius: 0.48 },
    modern: { centerAlpha: 0.012, middleAlpha: 0.07, edgeAlpha: 0.3, shelfAlpha: 0.05, shelfRadius: 0.54 },
    present: { centerAlpha: 0.008, middleAlpha: 0.075, edgeAlpha: 0.34, shelfAlpha: 0.055, shelfRadius: 0.56 },
    future: { centerAlpha: 0.006, middleAlpha: 0.085, edgeAlpha: 0.38, shelfAlpha: 0.065, shelfRadius: 0.58 }
  };
  return profiles[era] || profiles.present;
}

function drawOceanDepth(context, width, height, theme) {
  if (typeof context.createRadialGradient !== "function") return false;
  const profile = getOceanDepthProfile(theme);
  const centerX = width * 0.5;
  const centerY = height * 0.48;
  const radius = Math.max(width, height) * 0.76;
  const depth = context.createRadialGradient(centerX, centerY, radius * 0.08, centerX, centerY, radius);
  depth.addColorStop(0, `rgba(0,0,0,${profile.centerAlpha})`);
  depth.addColorStop(0.62, `rgba(0,0,0,${profile.middleAlpha})`);
  depth.addColorStop(1, `rgba(0,0,0,${profile.edgeAlpha})`);
  context.save();
  context.fillStyle = depth;
  context.fillRect(0, 0, width, height);
  const shelf = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * profile.shelfRadius);
  shelf.addColorStop(0, "rgba(255,255,255,0)");
  shelf.addColorStop(0.72, `rgba(255,255,255,${profile.shelfAlpha})`);
  shelf.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = shelf;
  context.fillRect(0, 0, width, height);
  context.restore();
  return true;
}

export function renderWorldMap(canvas, featureCollection, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("Canvas cartographique requis.");
  if (!featureCollection || featureCollection.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
    throw new TypeError("Une FeatureCollection GeoJSON est requise.");
  }
  const width = Math.max(1, options.width ?? canvas.clientWidth ?? 960);
  const height = Math.max(1, options.height ?? Math.round(width * 0.52));
  const pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contexte Canvas 2D indisponible.");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const year = options.year ?? 1444;
  const theme = getCartographicTheme(year, options.technologyLevel ?? 0);
  const projection = {
    type: options.projection ?? "equirectangular",
    viewport: options.viewport ?? {},
    lodZoom: Number(options.lodZoom ?? options.viewport?.zoom ?? 1),
    renderScale: Math.max(0.1, Number(options.renderScale ?? 1))
  };
  const renderStartedAt = globalThis.performance?.now?.() ?? Date.now();
  const renderTimings = {};
  const measureLayer = (name, draw) => {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const value = draw();
    renderTimings[name] = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    return value;
  };
  const visibleLand = selectVisibleFeatures(featureCollection, projection.viewport);
  const visibleGlaciers = selectVisibleFeatures(options.glaciers, projection.viewport);
  const visibleLakes = selectVisibleFeatures(options.lakes, projection.viewport);
  const visibleRivers = selectVisibleFeatures(options.rivers, projection.viewport);
  const visibleElevationPoints = selectVisibleFeatures(options.elevationPoints, projection.viewport);
  const visibleLabels = selectVisibleFeatures(options.labels, projection.viewport);
  const visibleTerritories = selectVisibleFeatures(options.territories, projection.viewport);
  const visiblePoliticalBoundaries = selectVisibleFeatures(options.politicalBoundaries, projection.viewport);
  const layers = {
    land: visibleLand, glaciers: visibleGlaciers, lakes: visibleLakes,
    rivers: visibleRivers, elevationPoints: visibleElevationPoints,
    territories: visibleTerritories
  };
  const cacheSignature = staticLayerSignature(width, height, pixelRatio, year, theme, projection, options, layers);
  const canCacheStatic = typeof context.drawImage === "function"
    && (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined");
  let staticStats = null;
  let terrainEnabled = false;
  let terrainRenderer = "canvas2d";
  let landWebGLStats = null;
  let staticCacheHit = false;

  const drawStaticLayers = target => {
    target.fillStyle = theme.colors.ocean;
    target.fillRect(0, 0, width, height);
    drawOceanDepth(target, width, height, theme);
    target.save();
    target.strokeStyle = theme.colors.grid;
    target.globalAlpha = 0.10;
    target.lineWidth = 0.35 * projection.renderScale;
    for (let longitude = -150; longitude <= 180; longitude += 30) {
      const a = projectCoordinate([longitude, -85], width, height, projection);
      const b = projectCoordinate([longitude, 85], width, height, projection);
      if (a && b) { target.beginPath(); target.moveTo(a.x, a.y); target.lineTo(b.x, b.y); target.stroke(); }
    }
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      target.beginPath();
      let started = false;
      for (let longitude = -180; longitude <= 180; longitude += 3) {
        const point = projectCoordinate([longitude, latitude], width, height, projection);
        if (!point) { started = false; continue; }
        if (!started) { target.moveTo(point.x, point.y); started = true; }
        else target.lineTo(point.x, point.y);
      }
      target.stroke();
    }
    target.restore();

    const coastProfile = getLandCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
    // Le continent antarctique est déjà rempli par sa couche blanche dédiée :
    // ne pas retracer son anneau GeoJSON comme une côte visible.
    const landFeatureGroups = getLandFeatureGroups(visibleLand?.features ?? []);
    const { landCoastFeatures, antarcticFeatures, landCoastFeatureSet } = landFeatureGroups;
    const hasLandCoastFeature = feature => landCoastFeatureSet.has(feature);
    const landCoastCollection = { ...visibleLand, features: landCoastFeatures };
    let landClipPath = null;
    if (options.terrainEnabled !== false && projection.type === "equirectangular" && visibleLand?.features?.length) {
      target.save();
      landClipPath = measureLayer("land-mask-path", () =>
        buildLandClipPath(visibleLand, width, height, projection, coastProfile));
      if (globalThis.__TERRA_DISABLE_LAND_TERRAIN_CLIP !== true) {
        if (landClipPath) {
          target.clip(landClipPath, "evenodd");
        } else {
          target.beginPath();
          for (const feature of visibleLand.features) {
            if (feature?.geometry && !isAntarcticLandFeature(feature)) {
              traceGeometry(target, feature.geometry, width, height, projection, coastProfile);
            }
          }
          target.clip("evenodd");
        }
      }
      const disableReliefBase = globalThis.__TERRA_DISABLE_RELIEF_BASE === true;
      if (!disableReliefBase && options.terrainTileStore && globalThis.__TERRA_DISABLE_TERRAIN_WEBGL_TILES !== true
        && !hasPhysicalTerrainChanges(options.physicalWorld)
        && typeof target.drawImage === "function") {
        try {
          const surface = renderTerrainWebGLTiles(options.terrainTileStore, backingWidth, backingHeight,
            projection.viewport, { onTileReady: options.onTerrainTileReady });
          if (surface) {
            if (typeof window !== "undefined") {
              // Surface WebGL dédiée : relief seul, avant composition Canvas et masques.
              window.__TERRA_TERRAIN_ONLY_CANVAS = surface;
              window.__TERRA_TERRAIN_ONLY_MODE = "webgl-tiles";
            }
            target.save();
            target.setTransform(1, 0, 0, 1, 0, 0);
            target.drawImage(surface, 0, 0, backingWidth, backingHeight);
            target.restore();
            terrainEnabled = true;
            terrainRenderer = "webgl-tiles";
          }
        } catch {
          terrainRenderer = "canvas2d-fallback";
        }
      }
      if (!terrainEnabled && !disableReliefBase) {
        terrainEnabled = measureLayer("relief-base", () => drawTerrainRaster(target, width, height,
          options.terrain, projection.viewport, options.terrainQuality ?? 1, true, options.physicalWorld));
        if (terrainRenderer === "canvas2d") terrainRenderer = "canvas2d";
      } else {
        renderTimings["relief-base"] = 0;
      }
      target.restore();
      // L'Antarctique reçoit un aplat neige autonome après le relief : les tuiles
      // ETOPO ne peuvent donc ni le masquer ni le rendre transparent au zoom mondial.
      if (projection.type === "equirectangular" && visibleLand?.features?.length
        && globalThis.__TERRA_DISABLE_ANTARCTIC_LAND_BASE !== true) {
        if (antarcticFeatures.length) {
          measureLayer("antarctic-land-base", () => drawAntarcticLandBase(target,
            antarcticFeatures, width, height, projection));
        }
      }
      captureTerrainLayerStage(target, "01-after-relief");
      if (typeof window !== "undefined" && target?.canvas) {
        window.__TERRA_TERRAIN_DIAGNOSTIC_CANVAS = target.canvas;
      }
    }
    // Le fond terrestre sert uniquement de masque géographique sous les pays.
    // Les polygones simples passent au GPU ; les trous, anneaux invalides et
    // géométries traversant l'antiméridien conservent le remplissage Canvas.
    const landFill = terrainEnabled ? "rgba(255,255,255,0.055)" : "#53665f";
    const geographicRenderer = options.geographicWebGLRenderer;
    const canRenderLandWebGL = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL !== true
      && geographicRenderer?.renderLayers && geographicRenderer.canvas
      && projection.type === "equirectangular" && typeof geographicRenderer.supports === "function";
    const landCount = measureLayer("terres-et-cotes", () => {
      if (!canRenderLandWebGL) {
        return drawPolygonLayer(target, landCoastCollection, width, height, projection, landFill,
          theme.colors.coast, 0.85, 1, true, Infinity, coastProfile);
      }
      try {
        const classification = measureLayer("land-feature-classification", () =>
          getLandWebGLClassification(visibleLand.features, geographicRenderer, hasLandCoastFeature));
        const { supportedLand, unsupportedLand, unsupportedLandFallback, supportedCoasts, unsupportedCoasts } = classification;
        let drawn = 0;
        if (unsupportedLandFallback.length) {
          drawn += measureLayer("land-canvas-fallback", () => drawPolygonLayer(target,
            { ...visibleLand, features: unsupportedLandFallback }, width, height, projection,
            landFill, null, 0, 1, true, Infinity, coastProfile));
        } else {
          renderTimings["land-canvas-fallback"] = 0;
        }
        const ratio = backingWidth / width;
        landWebGLStats = measureLayer("land-webgl-pipeline", () => geographicRenderer.renderLayers([
          { key: "land-fill", type: "polygons", features: supportedLand, color: parseWebGLColor(landFill) },
          { key: "land-coast", type: "boundaries", features: supportedCoasts,
            color: parseWebGLColor(theme.colors.coast), lineWidth: 0.85 * ratio }
        ], backingWidth, backingHeight, projection.viewport));
        renderTimings["land-webgl-geometry-build"] = landWebGLStats.geometryBuildMs ?? 0;
        renderTimings["land-webgl-buffer-upload"] = landWebGLStats.bufferUploadMs ?? 0;
        renderTimings["land-webgl-cache-build"] = landWebGLStats.cacheBuildMs ?? 0;
        renderTimings["land-webgl-draw-submit"] = landWebGLStats.drawSubmitMs ?? 0;
        measureLayer("land-webgl-compose", () => {
          target.save();
          target.setTransform(1, 0, 0, 1, 0, 0);
          target.drawImage(geographicRenderer.canvas, 0, 0, backingWidth, backingHeight);
          target.restore();
        });
        if (unsupportedCoasts.length) {
          measureLayer("land-coast-canvas-fallback", () => drawPolygonLayer(target,
            { ...visibleLand, features: unsupportedCoasts }, width, height, projection,
            "rgba(0,0,0,0)", theme.colors.coast, 0.85, 1, true, Infinity, coastProfile));
        } else {
          renderTimings["land-coast-canvas-fallback"] = 0;
        }
        return drawn + supportedLand.length;
      } catch {
        return drawPolygonLayer(target, landCoastCollection, width, height, projection, landFill,
          theme.colors.coast, 0.85, 1, true, Infinity, coastProfile);
      }
    });
    // Liseré discret : sépare visuellement la côte de l'océan sans concurrencer les frontières.
    measureLayer("liseré-côtier", () => drawPolygonLayer(target, landCoastCollection,
      width, height, projection, "rgba(0,0,0,0)",
      theme.colors.accent, 0.42, 0.24, true, Infinity, coastProfile));
    captureTerrainLayerStage(target, "02-after-land");
    const reliefMode = options.terrainMode === "relief";
    const countryOpacity = Math.max(0, Math.min(1, Number(options.countryOpacity ?? 0.52)));
    const territoryCount = measureLayer("territoires-couleurs", () => drawTerritoryLayer(target, visibleTerritories, width, height, projection, "", "fill", countryOpacity * (reliefMode ? 0.28 : 1)));
    captureTerrainLayerStage(target, "03-after-territories");
    // Diagnostic A/B : permet d'isoler l'ombrage Canvas tuilé du relief WebGL.
    // Désactivé uniquement si le développeur active explicitement le drapeau global.
    if (terrainEnabled && globalThis.__TERRA_DISABLE_HILLSHADE_OVERLAY !== true
      && (projection.lodZoom ?? 1) >= 2.5 && options.terrainEnabled !== false
      && projection.type === "equirectangular" && visibleLand?.features?.length) {
      target.save();
      if (globalThis.__TERRA_DISABLE_LAND_TERRAIN_CLIP !== true) {
        if (landClipPath) {
          target.clip(landClipPath, "evenodd");
        } else {
          target.beginPath();
          for (const feature of visibleLand.features) if (feature?.geometry) traceGeometry(target, feature.geometry, width, height, projection, coastProfile);
          target.clip("evenodd");
        }
      }
      target.globalCompositeOperation = "overlay";
      target.globalAlpha = reliefMode ? 0.66 : 0.52;
      const hillshadeQuality = Math.min(Number(options.terrainQuality ?? 1), 0.62);
      measureLayer("ombrage-multidirectionnel", () => drawTerrainRaster(target, width, height, options.terrain, projection.viewport, hillshadeQuality, true, options.physicalWorld, false, true));
      target.restore();
    }
    captureTerrainLayerStage(target, "04-after-hillshade");
    if (!options.interactive && (projection.lodZoom ?? 1) >= 2.5 && ["parchment", "paper"].includes(theme.texture)) {
      measureLayer("hachures", () => drawLandHachures(target, visibleLand, width, height, projection, theme.colors.coast));
    }
    const detailProfile = getSecondaryDetailProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
    const visibleGlacierFeatures = [];
    if (detailProfile.glaciers) {
      for (const feature of visibleGlaciers?.features ?? []) {
        if (isAntarcticLandFeature(feature)) continue;
        const properties = feature.properties;
        const scaleRank = Number(properties?.scalerank ?? properties?.SCALERANK
          ?? properties?.min_zoom ?? properties?.MIN_ZOOM ?? 0);
        if (scaleRank <= 4) visibleGlacierFeatures.push(feature);
      }
    }
    const glaciersVisible = { type: "FeatureCollection", features: visibleGlacierFeatures };
    const majorLakes = { type: "FeatureCollection", features: selectMajorLakeFeatures(visibleLakes, detailProfile.lakesRank, MAX_VISIBLE_LAKES) };
    const majorRivers = { type: "FeatureCollection", features: selectMajorRiverFeatures(visibleRivers, detailProfile.riversRank, detailProfile.riversMax) };
    let geographicDetailGpu = false;
    let glacierCount = 0, lakeCount = 0, riverCount = 0;
    const lakeProfile = getLakeCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
    const riverProfile = getBoundarySimplificationProfile(projection.lodZoom ?? 1);
    if (geographicRenderer?.renderLayers && geographicRenderer.canvas && projection.type === "equirectangular") {
      try {
        const glacierPartition = partitionFeatures(glaciersVisible.features, feature => geographicRenderer.supports(feature));
        const lakePartition = partitionFeatures(majorLakes.features, feature => geographicRenderer.supports(feature));
        const supportedGlaciers = glacierPartition.supported;
        const unsupportedGlaciers = glacierPartition.unsupported;
        const supportedLakes = lakePartition.supported;
        const unsupportedLakes = lakePartition.unsupported;
        // Diagnostic A/B : bascule les rivières WebGL vers le rendu Canvas sans toucher aux autres couches.
        const disableGpuRiverLines = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES === true;
        const riverPartition = disableGpuRiverLines
          ? { supported: [], unsupported: majorRivers.features }
          : partitionFeatures(majorRivers.features, feature => geographicRenderer.supportsLine(feature));
        const supportedRivers = riverPartition.supported;
        const unsupportedRivers = riverPartition.unsupported;
        const ratio = backingWidth / width;
        const glacierLayers = [];
        for (const rank of [0, 1, 2, 3, 4]) {
          const ranked = supportedGlaciers.filter(feature => getGlacierRenderStyle(feature).rank === rank);
          if (!ranked.length) continue;
          const color = parseWebGLColor("#dce8e5");
          color[3] *= getGlacierRenderStyle({ properties: { scalerank: rank } }).fillAlpha;
          glacierLayers.push({ key: "glacier-fills-rank-" + rank, type: "polygons", features: ranked, color });
        }
        const lakeLayers = [];
        for (const rank of [0, 1, 2, 3, 4]) {
          const ranked = supportedLakes.filter(feature => getLakeRenderStyle(feature).rank === rank);
          if (!ranked.length) continue;
          const color = parseWebGLColor(theme.colors.ocean);
          color[3] *= getLakeRenderStyle({ properties: { scalerank: rank } }).fillAlpha;
          lakeLayers.push({ key: "lake-fills-rank-" + rank, type: "polygons", features: ranked, color });
        }
        const riverLayers = [];
        for (const rank of [0, 1, 2, 3, 4]) {
          const ranked = supportedRivers.filter(feature => riverFeatureRank(feature) === rank);
          if (!ranked.length) continue;
          const style = getRiverRenderStyle({ properties: { scalerank: rank } });
          const color = parseWebGLColor(theme.colors.accent);
          color[3] *= style.alpha;
          riverLayers.push({
            key: "river-lines-rank-" + rank, type: "lines", features: ranked,
            color, lineWidth: style.lineWidth * ratio
          });
        }
        measureLayer("details-geographiques-webgl", () => geographicRenderer.renderLayers([
          ...glacierLayers,
          ...lakeLayers,
          ...riverLayers
        ], backingWidth, backingHeight, projection.viewport));
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.drawImage(geographicRenderer.canvas, 0, 0, backingWidth, backingHeight);
        target.restore();
        glacierCount = measureLayer("glaciers", () => {
          drawGlacierFillLayers(target, { ...glaciersVisible, features: unsupportedGlaciers }, width, height, projection, 4);
          drawGlacierOutlineLayers(target, glaciersVisible, width, height, projection, 4);
          return glaciersVisible.features.length;
        });
        lakeCount = measureLayer("lacs", () => {
          drawPolygonLayer(target, { ...majorLakes, features: unsupportedLakes }, width, height, projection, theme.colors.ocean, null, 0, 1, true, detailProfile.lakesRank, lakeProfile);
          drawLakeOutlineLayer(target, majorLakes, width, height, projection, theme.colors.accent, lakeProfile, detailProfile.lakesRank);
          return majorLakes.features.length;
        });
        riverCount = measureLayer("rivières", () =>
          drawLineLayer(target, { ...majorRivers, features: unsupportedRivers }, width, height, projection, theme.colors.accent, 0.7, riverProfile, detailProfile.riversRank, detailProfile.riversMax)
          + supportedRivers.length);
        geographicDetailGpu = true;
      } catch {
        geographicDetailGpu = false;
      }
    }
    if (!geographicDetailGpu) {
      glacierCount = measureLayer("glaciers", () =>
        drawGlacierLayers(target, glaciersVisible, width, height, projection, 4));
      lakeCount = measureLayer("lacs", () => {
        let count = 0;
        for (const feature of majorLakes.features) {
          const style = getLakeRenderStyle(feature);
          if (style.rank > detailProfile.lakesRank) continue;
          count += drawPolygonLayer(target, { type: "FeatureCollection", features: [feature] },
            width, height, projection, theme.colors.ocean, null, 0, style.fillAlpha, true,
            detailProfile.lakesRank, lakeProfile);
          count += drawLakeOutlineLayer(target, { type: "FeatureCollection", features: [feature] },
            width, height, projection, theme.colors.accent, lakeProfile, detailProfile.lakesRank);
        }
        return count ? majorLakes.features.filter(feature => getLakeRenderStyle(feature).rank <= detailProfile.lakesRank).length : 0;
      });
      riverCount = measureLayer("rivières", () => drawLineLayer(target, visibleRivers, width, height, projection, theme.colors.accent, 0.7, riverProfile, detailProfile.riversRank, detailProfile.riversMax));
    }
    const elevationPointCount = measureLayer("repères-altitude", () => options.interactive ? 0 : drawElevationPoints(target, visibleElevationPoints, width, height, projection, theme));
    return { terrainEnabled, terrainRenderer, landCount, territoryCount, glacierCount, lakeCount,
      riverCount, elevationPointCount, webglStats: landWebGLStats };
  };

  if (canCacheStatic) {
    const cache = getStaticLayerCache(canvas);
    let record = cache.get(cacheSignature);
    if (record) {
      cache.delete(cacheSignature);
      cache.set(cacheSignature, record);
      staticStats = { ...record.stats, webglStats: null };
      staticCacheHit = true;
      for (const key of STATIC_LAYER_TIMING_KEYS) renderTimings[key] = 0;
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      context.drawImage(record.surface, 0, 0, width, height);
      renderTimings["cache-statique"] = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    } else {
      const surface = createStaticSurface(backingWidth, backingHeight);
      const surfaceContext = surface?.getContext?.("2d");
      if (surfaceContext) {
        surfaceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        staticStats = drawStaticLayers(surfaceContext);
        context.drawImage(surface, 0, 0, width, height);
        const surfaceBytes = surface.width * surface.height * 4;
        record = { surface, stats: staticStats, bytes: surfaceBytes };
        if (surfaceBytes <= STATIC_LAYER_CACHE_MAX_BYTES) {
          cache.set(cacheSignature, record);
          cache.bytes = (cache.bytes ?? 0) + surfaceBytes;
          while (cache.size > STATIC_LAYER_CACHE_LIMIT || cache.bytes > STATIC_LAYER_CACHE_MAX_BYTES) {
            const oldestKey = cache.keys().next().value;
            const oldest = cache.get(oldestKey);
            cache.delete(oldestKey);
            cache.bytes -= Math.max(0, oldest?.bytes ?? 0);
          }
        }
      } else {
        staticStats = drawStaticLayers(context);
      }
    }
  } else {
    staticStats = drawStaticLayers(context);
  }

  terrainEnabled = Boolean(staticStats?.terrainEnabled);
  const territoryOutlineCount = measureLayer("frontières-territoriales", () => drawTerritoryLayer(context, visibleTerritories, width, height, projection, options.selectedCountry ?? "", "outlines", Number(options.countryOpacity ?? 0.52)));
  const physicalContext = options.physicalOverlayContext ?? context;
  if (options.physicalOverlayContext) {
    const overlayCanvas = physicalContext.canvas;
    const targetWidth = Math.round(width * pixelRatio), targetHeight = Math.round(height * pixelRatio);
    if (overlayCanvas.width !== targetWidth) overlayCanvas.width = targetWidth;
    if (overlayCanvas.height !== targetHeight) overlayCanvas.height = targetHeight;
    physicalContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    physicalContext.clearRect(0, 0, width, height);
  }
  const physicalChangeCount = measureLayer("catastrophes-et-geographie", () => drawPhysicalWorldLayer(physicalContext, options.physicalWorld, width, height, projection, options.terrain));
  const boundaryRenderer = options.geographicWebGLRenderer;
  const canRenderBoundariesWebGL = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_BOUNDARIES !== true
    && boundaryRenderer?.renderLayers && boundaryRenderer.canvas
    && projection.type === "equirectangular";
  let boundariesWebGLRendered = false;
  let politicalBoundaryCount = 0;
  let administrativeBoundaryCount = 0;
  if (canRenderBoundariesWebGL) {
    try {
      const politicalPartition = partitionFeatures(visiblePoliticalBoundaries?.features, feature => boundaryRenderer.supportsBoundary(feature));
      const supportedPolitical = politicalPartition.supported;
      const unsupportedPolitical = politicalPartition.unsupported;
      const ratio = backingWidth / width;
      measureLayer("frontieres-webgl", () => boundaryRenderer.renderLayers([
        { key: "political-boundary-halo", type: "boundaries", features: supportedPolitical,
          color: parseWebGLColor("#ead7aa"), lineWidth: (options.interactive ? 1.65 : 2.35) * ratio },
        { key: "political-boundary-core", type: "boundaries", features: supportedPolitical,
          color: parseWebGLColor("#293945"), lineWidth: (options.interactive ? 0.75 : 1.05) * ratio },
      ], backingWidth, backingHeight, projection.viewport));
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(boundaryRenderer.canvas, 0, 0, backingWidth, backingHeight);
      context.restore();
      politicalBoundaryCount = supportedPolitical.length;
      if (unsupportedPolitical.length) {
        politicalBoundaryCount += drawStyledBoundaryLayer(context,
          { ...visiblePoliticalBoundaries, features: unsupportedPolitical }, width, height, projection,
          "#ead7aa", options.interactive ? 1.65 : 2.35, [], true);
        drawStyledBoundaryLayer(context,
          { ...visiblePoliticalBoundaries, features: unsupportedPolitical }, width, height, projection,
          "#293945", options.interactive ? 0.75 : 1.05, [], true);
      }
      boundariesWebGLRendered = true;
    } catch (error) {
      console.info("Frontières WebGL indisponibles ; fallback Canvas conservé.", error);
    }
  }
  if (!boundariesWebGLRendered) {
    politicalBoundaryCount = measureLayer("frontieres-politiques", () =>
      drawStyledBoundaryLayer(context, visiblePoliticalBoundaries, width, height, projection, "#ead7aa", options.interactive ? 1.65 : 2.35, [], true)
      + drawStyledBoundaryLayer(context, visiblePoliticalBoundaries, width, height, projection, "#293945", options.interactive ? 0.75 : 1.05, [], true));
    administrativeBoundaryCount = 0;
  }
  const labelHits = measureLayer("etiquettes", () => drawMapLabels(context, visibleLabels, width, height, projection, theme, projection.lodZoom ?? projection.viewport.zoom ?? 1, options.physicalWorld, options.qualityProfile?.labelDensity ?? 1));

  const sumFamilyTimings = keys => keys.reduce((sum, key) => sum + (renderTimings[key] ?? 0), 0);
  const renderFamilies = {
    physicalMs: sumFamilyTimings(["relief-base", "ombrage-multidirectionnel", "catastrophes-et-geographie"]),
    politicalMs: sumFamilyTimings(["territoires-couleurs", "frontières-territoriales", "frontieres-politiques", "frontieres-administratives", "frontieres-webgl"]),
    dynamicMs: sumFamilyTimings(["etiquettes", "hachures", "details-geographiques-webgl"])
  };
  return {
    theme, projection: projection.type, viewport: { ...projection.viewport }, featureCount: featureCollection.features.length,
    renderTimings, renderFamilies, totalRenderMs: Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - renderStartedAt),
    landCount: staticStats?.landCount ?? 0, territoryCount: staticStats?.territoryCount ?? 0,
    territoryOutlineCount, physicalChangeCount, glacierCount: staticStats?.glacierCount ?? 0,
    lakeCount: staticStats?.lakeCount ?? 0, riverCount: staticStats?.riverCount ?? 0,
    elevationPointCount: staticStats?.elevationPointCount ?? 0, politicalBoundaryCount,
    administrativeBoundaryCount, labelHits, terrainEnabled, terrainRenderer: staticStats?.terrainRenderer ?? "canvas2d",
    webglStats: staticStats?.webglStats ?? null,
    terrainTileStats: getTerrainWebGLTileStats(options.terrainTileStore),
    projectedPathCacheStats: getProjectedPathCacheStats(),
    staticCacheHit, width, height
  };
}

export function getProjectedPathCacheStats() {
  // Path2D n'expose pas sa taille mémoire réelle ; 32 octets par sommet est
  // une estimation de budget (coordonnées + structures de chemin), pas une
  // mesure native du heap ni de la mémoire GPU.
  return {
    cachedPaths: projectedPathCacheLru.size,
    maxCachedPaths: MAX_PROJECTED_PATHS,
    cachedVertices: projectedPathVertexCount,
    maxCachedVertices: MAX_PROJECTED_PATH_VERTICES,
    estimatedBytes: projectedPathVertexCount * 32,
    maxEstimatedBytes: MAX_PROJECTED_PATH_VERTICES * 32,
    projectedPathCacheHits,
    projectedPathCacheMisses,
    projectedPathCacheBuilds,
    projectedPathCacheEvictions,
    projectedViewportProfileHits,
    projectedViewportProfileMisses,
    projectedViewportProfileEntries: projectedViewportProfileCache.size,
    maxProjectedViewportProfiles: MAX_PROJECTED_VIEWPORT_PROFILES,
    combinedLandMaskCacheHits,
    combinedLandMaskCacheMisses,
    combinedLandMaskCacheBuilds,
    combinedLandMaskCacheEvictions,
    combinedLandMaskCacheEntries: combinedLandMaskCache.size,
    maxCombinedLandMaskCacheEntries: COMBINED_LAND_MASK_CACHE_LIMIT,
    antarcticClassificationCacheHits,
    antarcticClassificationCacheMisses,
    antarcticClassificationCoordinatesScanned,
    landFeatureGroupCacheHits,
    landFeatureGroupCacheMisses,
    landWebGLClassificationCacheHits,
    landWebGLClassificationCacheMisses
  };
}
