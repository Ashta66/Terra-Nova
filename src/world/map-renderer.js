import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";
import { drawTerrainRaster, sampleElevation, isTerrainHillshadePrepared } from "./terrain.js";
import { renderTerrainWebGLTiles, getTerrainWebGLTileStats } from "./terrain-webgl.js";
import { selectGeoSpatialFeatures } from "./geo-spatial-index.js";

export const selectVisibleFeatures = selectGeoSpatialFeatures;

function createContinuousProjector(width, height, projection) {
  const viewport = projection.viewport ?? {};
  const unwrappedProjection = projection.type === "orthographic"
    ? projection
    : { ...projection, viewport: { ...viewport, wrapLongitude: false } };
  let previousLongitude = null;
  return coordinate => {
    let longitude = coordinate[0];
    if (projection.type !== "orthographic") {
      if (previousLongitude === null) {
        longitude += 360 * Math.round((Number(viewport.centerLongitude ?? 0) - longitude) / 360);
      } else {
        while (longitude - previousLongitude > 180) longitude -= 360;
        while (longitude - previousLongitude < -180) longitude += 360;
      }
      previousLongitude = longitude;
    }
    return projectCoordinate([longitude, coordinate[1]], width, height, unwrappedProjection);
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
    const coordinates = [];
    const collect = value => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) coordinates.push(value);
      else for (const child of value) collect(child);
    };
    collect(feature?.geometry?.coordinates);
    if (coordinates.length) {
      const longitudes = coordinates.map(point => point[0]);
      const latitudes = coordinates.map(point => point[1]);
      const meanLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
      area = Math.abs((Math.max(...longitudes) - Math.min(...longitudes)) * 111.32 * Math.cos(meanLatitude * Math.PI / 180) * (Math.max(...latitudes) - Math.min(...latitudes)) * 111.32);
    }
  }
  lakeAreaScores.set(feature, area);
  return area;
}

/** Ne conserve que les 12 lacs les plus importants parmi les entités visibles. */
export function selectMajorLakeFeatures(collection, maxRank = 1, maxFeatures = MAX_VISIBLE_LAKES) {
  if (!collection?.features) return [];
  return collection.features
    .filter(feature => {
      if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)) return false;
      const rawRank = feature.properties?.scalerank ?? feature.properties?.SCALERANK ?? feature.properties?.min_zoom ?? feature.properties?.MIN_ZOOM;
      const rank = Number(rawRank);
      return (Number.isFinite(rank) ? rank : 1) <= maxRank;
    })
    .sort((a, b) => {
      const rankOf = feature => {
        const value = Number(feature.properties?.scalerank ?? feature.properties?.SCALERANK ?? feature.properties?.min_zoom ?? feature.properties?.MIN_ZOOM);
        return Number.isFinite(value) ? value : 1;
      };
      return rankOf(a) - rankOf(b) || lakeGeographicArea(b) - lakeGeographicArea(a);
    })
    .slice(0, Math.max(0, maxFeatures));
}


const EARTH_RADIUS_KM=6371,MIN_ISLAND_AREA_KM2=100,MIN_LAKE_AREA_KM2=500;
function ringAreaKm2(ring){if(!Array.isArray(ring)||ring.length<4)return 0;let sum=0;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(!Array.isArray(a)||!Array.isArray(b))continue;const la=Number(a[0])*Math.PI/180,lb=Number(b[0])*Math.PI/180,pa=Number(a[1])*Math.PI/180,pb=Number(b[1])*Math.PI/180;sum+=(lb-la)*(2+Math.sin(pa)+Math.sin(pb));}return Math.abs(sum)*EARTH_RADIUS_KM*EARTH_RADIUS_KM/2;}
function polygonAreaKm2(polygon){if(!Array.isArray(polygon)||!polygon.length)return 0;return Math.max(0,ringAreaKm2(polygon[0])-polygon.slice(1).reduce((s,ring)=>s+ringAreaKm2(ring),0));}
export function filterSmallIslandComponents(collection,minAreaKm2=MIN_ISLAND_AREA_KM2,preserveLargestPerFeature=false){
 if(!collection?.features)return collection;const features=[];
 for(const feature of collection.features){const g=feature?.geometry;
  if(g?.type==="Polygon"){if(polygonAreaKm2(g.coordinates)>=minAreaKm2||preserveLargestPerFeature)features.push(feature);continue;}
  if(g?.type!=="MultiPolygon"){features.push(feature);continue;}
  const ranked=g.coordinates.map((polygon,index)=>({polygon,index,area:polygonAreaKm2(polygon)})).sort((a,b)=>b.area-a.area||a.index-b.index);
  let kept=ranked.filter(x=>x.area>=minAreaKm2);if(preserveLargestPerFeature&&!kept.length&&ranked.length)kept=[ranked[0]];if(!kept.length)continue;
  const coordinates=kept.sort((a,b)=>a.index-b.index).map(x=>x.polygon),geometry=coordinates.length===1?{type:"Polygon",coordinates:coordinates[0]}:{type:"MultiPolygon",coordinates};
  const {bbox,...rest}=feature;features.push({...rest,geometry});
 }return {...collection,features};
}
export function filterMajorLakeFeatures(collection,minAreaKm2=MIN_LAKE_AREA_KM2){
 if(!collection?.features)return collection;return {...collection,features:collection.features.filter(feature=>{if(!["Polygon","MultiPolygon"].includes(feature?.geometry?.type))return false;const raw=feature.properties?.scalerank??feature.properties?.SCALERANK??feature.properties?.min_zoom??feature.properties?.MIN_ZOOM,rank=Number(raw);return (!Number.isFinite(rank)||rank<=1)&&lakeGeographicArea(feature)>=minAreaKm2;})};
}

// Simplification Douglas-Peucker en pixels écran. La tolérance est donc
// constante visuellement : en zoomant, les détails géographiques réapparaissent.
export function simplifyClosedRing(points, tolerance = 0.55) {
  if (!Array.isArray(points) || points.length <= 4 || tolerance <= 0) return points ?? [];
  const ring = points.length > 1
    && points[0].x === points[points.length - 1].x
    && points[0].y === points[points.length - 1].y
    ? points.slice(0, -1)
    : points.slice();
  if (ring.length <= 3) return [...ring, ring[0]];

  const distanceToSegmentSquared = (point, start, end) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    const x = start.x + t * dx, y = start.y + t * dy;
    return (point.x - x) ** 2 + (point.y - y) ** 2;
  };
  const simplifyOpen = input => {
    if (input.length <= 2) return input;
    const keep = new Uint8Array(input.length);
    keep[0] = 1; keep[input.length - 1] = 1;
    const stack = [[0, input.length - 1]];
    const threshold = tolerance * tolerance;
    while (stack.length) {
      const [first, last] = stack.pop();
      let maxDistance = threshold, farthest = -1;
      for (let i = first + 1; i < last; i++) {
        const distance = distanceToSegmentSquared(input[i], input[first], input[last]);
        if (distance > maxDistance) { maxDistance = distance; farthest = i; }
      }
      if (farthest !== -1) {
        keep[farthest] = 1;
        stack.push([first, farthest], [farthest, last]);
      }
    }
    return input.filter((_, index) => keep[index]);
  };

  // Une boucle fermée a des extrémités identiques : on la coupe au sommet
  // le plus éloigné du premier point pour éviter que DP ne l'efface entièrement.
  let split = 1, farthest = -1;
  for (let i = 1; i < ring.length; i++) {
    const distance = (ring[i].x - ring[0].x) ** 2 + (ring[i].y - ring[0].y) ** 2;
    if (distance > farthest) { farthest = distance; split = i; }
  }
  const firstHalf = simplifyOpen(ring.slice(0, split + 1));
  const secondHalf = simplifyOpen([...ring.slice(split), ring[0]]);
  const result = [...firstHalf, ...secondHalf.slice(1, -1)];
  if (result.length < 3) return [...ring, ring[0]];
  result.push(result[0]);
  return result;
}
 
function simplifyOpenLine(points, tolerance = 0.5) {
  if (!Array.isArray(points) || points.length <= 2 || tolerance <= 0) return points ?? [];
  const distanceToSegmentSquared = (point, start, end) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (dx === 0 && dy === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
    const x = start.x + t * dx, y = start.y + t * dy;
    return (point.x - x) ** 2 + (point.y - y) ** 2;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const threshold = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = threshold, farthest = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegmentSquared(points[i], points[first], points[last]);
      if (distance > maxDistance) { maxDistance = distance; farthest = i; }
    }
    if (farthest !== -1) {      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function projectedRingArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function traceRing(context, ring, width, height, projection, coastProfile) {
  const project = createContinuousProjector(width, height, projection);
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
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  if (polygons.length) {
    let vertices = 0;
    const polygonProfile = coastProfile ?? { tolerance: 0.55, minRingArea: 0.7 };
    for (const polygon of polygons) {
      const exterior = polygon[0];
      if (!exterior) continue;
      const exteriorCount = traceRing(context, exterior, width, height, projection, polygonProfile);
      if (!exteriorCount) continue;
      vertices += exteriorCount;
      for (const hole of polygon.slice(1)) vertices += traceRing(context, hole, width, height, projection, polygonProfile);
    }
    return vertices;
  }
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  if (lines.length) {
    let vertices = 0;
    for (const line of lines) {
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
      const project = createContinuousProjector(width, height, projection);
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
const PROJECTED_PATHS_PER_FEATURE = 6;
const MAX_PROJECTED_PATHS = 2048;
const MAX_PROJECTED_PATH_VERTICES = 500_000;
let projectedPathVertexCount = 0;
let projectedPathCacheHits = 0;
let projectedPathCacheMisses = 0;
let combinedLandMaskCacheHits = 0;
let combinedLandMaskCacheMisses = 0;

function touchProjectedPath(entry, feature) {
  projectedPathCacheLru.delete(entry);
  projectedPathCacheLru.set(entry, feature);
}

function getProjectedPath(feature, width, height, projection, coastProfile = null) {
  if (typeof Path2D === "undefined" || !feature?.geometry) return null;
  const viewport = projection.viewport ?? {};
  const zoom = Math.max(1, Number(viewport.zoom ?? 1));
  // Les chemins sont partagés dans de très petites cellules de vue. Le centre
  // est quantifié à 1°/zoom (au plus ~1,34 px d'écart au rendu), ce qui évite
  // de reconstruire toutes les géométries après chaque micro-déplacement.
  const centerStep = 1 / zoom;
  const normalizedLongitude = ((((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360) - 180);
  const snappedLongitude = Math.round(normalizedLongitude / centerStep) * centerStep;
  const snappedLatitude = Math.round(Number(viewport.centerLatitude ?? 0) / centerStep) * centerStep;
  const pathProjection = {
    ...projection,
    viewport: { ...viewport, centerLongitude: snappedLongitude, centerLatitude: snappedLatitude }
  };
  const key = [
    projection.type, width, height, zoom.toFixed(4),
    snappedLongitude.toFixed(4), snappedLatitude.toFixed(4),
    coastProfile ? Number(coastProfile.tolerance).toFixed(3) : "full",
    coastProfile ? Number(coastProfile.minRingArea).toFixed(3) : "all"
  ].join(":");
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
  const path = new Path2D();
  const vertexCount = traceGeometry(path, feature.geometry, width, height, pathProjection, coastProfile);
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
  }
  while (projectedPathCacheLru.size > MAX_PROJECTED_PATHS || projectedPathVertexCount > MAX_PROJECTED_PATH_VERTICES) {
    const [oldest, oldestFeature] = projectedPathCacheLru.entries().next().value;
    projectedPathCacheLru.delete(oldest);
    projectedPathVertexCount -= oldest.vertexCount;
    const oldestEntries = projectedPathCache.get(oldestFeature);
    if (oldestEntries?.get(oldest.key) === oldest) oldestEntries.delete(oldest.key);
  }
  return path;
}

const combinedLandMaskCache = new Map();
const COMBINED_LAND_MASK_CACHE_LIMIT = 12;

/** Construit et met en cache le masque terrestre composé à partir des Path2D des features. */
export function buildLandClipPath(collection, width, height, projection, coastProfile) {
  if (typeof Path2D === "undefined") return null;
  const features = collection?.features ?? [];
  const viewport = projection.viewport ?? {};
  const zoom = Math.max(1, Number(viewport.zoom ?? 1));
  const centerStep = 1 / zoom;
  const centerLongitude = ((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360 - 180;
  const snappedLongitude = Math.round(centerLongitude / centerStep) * centerStep;
  const snappedLatitude = Math.round(Number(viewport.centerLatitude ?? 0) / centerStep) * centerStep;
  const key = [
    width, height, projection.type, zoom.toFixed(4),
    snappedLongitude.toFixed(4), snappedLatitude.toFixed(4),
    coastProfile ? Number(coastProfile.tolerance).toFixed(3) : "full",
    coastProfile ? Number(coastProfile.minRingArea).toFixed(3) : "all",
    renderObjectId(features)
  ].join(":");
  const cached = combinedLandMaskCache.get(key);
  if (cached) {
    combinedLandMaskCacheHits++;
    combinedLandMaskCache.delete(key);
    combinedLandMaskCache.set(key, cached);
    return cached;
  }
  combinedLandMaskCacheMisses++;
  const combined = new Path2D();
  if (typeof combined.addPath !== "function") return null;
  let appended = 0;
  for (const feature of features) {
    if (!feature?.geometry) continue;
    const cachedPath = getProjectedPath(feature, width, height, projection, coastProfile);
    if (cachedPath) {
      combined.addPath(cachedPath);
      appended++;
    } else if (traceGeometry(combined, feature.geometry, width, height, projection, coastProfile)) {
      appended++;
    }
  }
  if (!appended) return null;
  combinedLandMaskCache.set(key, combined);
  while (combinedLandMaskCache.size > COMBINED_LAND_MASK_CACHE_LIMIT) {
    combinedLandMaskCache.delete(combinedLandMaskCache.keys().next().value);
  }
  return combined;
}

function isAntarcticLandFeature(feature) {
  const bbox = feature?.bbox ?? feature?.geometry?.bbox;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    return Number(bbox[1]) <= -70 && Number(bbox[3]) <= -60
      && Number(bbox[2]) - Number(bbox[0]) >= 300;
  }

  // Parcours itératif : certains GeoJSON côtiers contiennent des anneaux
  // de centaines de milliers de sommets. Éviter la récursion et les spreads
  // Math.min/Math.max, qui dépassent la limite d'arguments du moteur JS.
  const pending = [feature?.geometry?.coordinates];
  let minLatitude = Infinity, maxLatitude = -Infinity;
  let minLongitude = Infinity, maxLongitude = -Infinity;
  let coordinateCount = 0;
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
      continue;
    }
    for (let index = 0; index < value.length; index++) pending.push(value[index]);
  }
  return coordinateCount > 0 && minLatitude <= -70 && maxLatitude <= -60
    && maxLongitude - minLongitude >= 300;
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
      const coast = ring.filter(point => Array.isArray(point) && Number.isFinite(point[0])
        && Number.isFinite(point[1]) && point[1] > -88.5);
      if (coast.length < 3) continue;
      const project = createContinuousProjector(width, height, projection);
      const points = coast.map(project).filter(Boolean);
      if (points.length < 3) continue;
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
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
  let drawn = 0;  const renderScale = projection.renderScale ?? 1;
  context.save();
  context.globalAlpha = alpha;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    const featureRank = Number(feature.properties?.scalerank ?? feature.properties?.SCALERANK ?? feature.properties?.min_zoom ?? feature.properties?.MIN_ZOOM ?? 0);
    if (featureRank > maxRank) continue;
    const coastProfile = simplifyCoast ? (coastProfileOverride ?? getCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1)) : null;
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

function riverFeatureRank(feature) {
  const raw = feature?.properties?.scalerank ?? feature?.properties?.SCALERANK ?? feature?.properties?.min_zoom ?? feature?.properties?.MIN_ZOOM;
  const rank = Number(raw);
  // Les collections synthétiques ou anciennes sans scalerank restent classées
  // comme cours d'eau secondaires, jamais comme affluents éliminés par défaut.
  return Number.isFinite(rank) ? rank : 1;
}
function lineVertexCount(feature) {
  const geometry = feature?.geometry;
  const lines = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
  return lines.reduce((total, line) => total + (Array.isArray(line) ? line.length : 0), 0);
}
export function selectMajorRiverFeatures(collection, maxRank = 1, maxFeatures = 18) {
  if (!collection?.features) return [];
  return collection.features
    .filter(feature => ["LineString", "MultiLineString"].includes(feature?.geometry?.type) && riverFeatureRank(feature) <= maxRank)
    .sort((a, b) => riverFeatureRank(a) - riverFeatureRank(b) || lineVertexCount(b) - lineVertexCount(a))
    .slice(0, maxFeatures);
}

function drawLineLayer(context, collection, width, height, projection, color, lineWidth, simplifyProfile = null, maxRank = Infinity, maxFeatures = Infinity) {
  if (!collection?.features) return 0;
  let drawn = 0;
  const renderScale = projection.renderScale ?? 1;
  const candidates = Number.isFinite(maxFeatures)
    ? selectMajorRiverFeatures(collection, maxRank, maxFeatures)
    : collection.features;
  for (const feature of candidates) {
    const geometry = feature?.geometry;
    if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) continue;
    const cachedPath = getProjectedPath(feature, width, height, projection, simplifyProfile);
    context.strokeStyle = color;
    context.lineWidth = lineWidth * renderScale;
    const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    if (cachedPath) {
      context.stroke(cachedPath);
      // Conserver la sémantique historique : un cours d'eau multi-segments
      // compte chaque ligne réellement dessinée, même avec un chemin Path2D unique.
      drawn += lines.length;
      continue;
    }
    for (const line of lines) {
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
  let count = 0;
  context.save();
  const renderScale = projection.renderScale ?? 1;
  context.strokeStyle = color;
  context.lineWidth = lineWidth * renderScale;
  context.globalAlpha = 0.92;
  const scaledDash = dash.map(value => value * renderScale);
  const simplifyProfile = getBoundarySimplificationProfile(zoom);
  for (const feature of collection.features) {
    const properties = feature?.properties ?? {};
    const precision = Number(properties.BORDERPRECISION ?? properties.borderPrecision ?? 3);
    const rank = Number(properties.scalerank ?? properties.SCALERANK ?? properties.min_zoom ?? properties.MIN_ZOOM ?? 0);
    if (administrative && ((zoom < 5 && rank > 1) || (zoom < 8 && rank > 3))) continue;
    context.setLineDash?.(precisionAware && precision < 3 ? [3 * renderScale, 2 * renderScale] : scaledDash);
    count += drawLineLayer(context, { type: "FeatureCollection", features: [feature] }, width, height, projection, color, lineWidth, simplifyProfile);
  }
  context.restore();
  return count;
}

function drawLandHachures(context, collection, width, height, projection, color) {
  if (!collection?.features || typeof context.clip !== "function") return;
  context.save();
  const renderScale = projection.renderScale ?? 1;
  context.globalAlpha = 0.12;
  context.strokeStyle = color;
  context.lineWidth = 0.45 * renderScale;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    context.save();
    const coastProfile = getLandCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
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

function drawElevationPoints(context, collection, width, height, projection, theme) {
  if (!collection?.features) return 0;
  let drawn = 0;
  const renderScale = projection.renderScale ?? 1;
  const zoom = Number(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
  const profile = getSecondaryDetailProfile(zoom);
  const candidates = [...collection.features].filter(feature => feature.geometry?.type === "Point").sort((a, b) => Math.abs(Number(b.properties?.elevation_m ?? 0)) - Math.abs(Number(a.properties?.elevation_m ?? 0))).slice(0, profile.elevationMax);
  for (const feature of candidates) {
    if (feature.geometry?.type !== "Point") continue;
    const elevation = Number(feature.properties?.elevation_m ?? 0);
    const isMountain = feature.properties?.kind === "mountain";
    const isDepression = feature.properties?.kind === "depression";
    if (zoom < 2.5 && !(isMountain && elevation >= 7000)) continue;
    if (zoom < 4 && isDepression && elevation > -400) continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = projectCoordinate([longitude, latitude], width, height, projection);
    if (!point) continue;
    context.save();
    context.fillStyle = isDepression ? "#6f8f9b" : theme.colors.accent;
    context.strokeStyle = theme.colors.coast;
    context.lineWidth = 0.8 * renderScale;
    if (isMountain) {
      // Les triangles de sommets sont supprimés : le relief ETOPO suffit à
      // lire les montagnes. On conserve uniquement le nom des très hauts sommets.
      if (elevation >= 5000 && typeof context.fillText === "function") {        context.font = `${10 * renderScale}px Georgia, serif`;
        context.textAlign = "left";
        context.fillStyle = theme.colors.text;
        context.fillText(feature.properties?.name ?? "Sommet", point.x + 6 * renderScale, point.y - 4 * renderScale);
      }
      context.restore();
      drawn++;
      continue;
    }
    context.beginPath();
    context.arc(point.x, point.y, 2.2 * renderScale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    drawn++;
  }
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
    if (!Number.isFinite(Number(cell.longitude)) || !Number.isFinite(Number(cell.latitude))) continue;
    const longitude = ((Number(cell.longitude) + 180) % 360 + 360) % 360 - 180;
    const latitude = Math.max(-90, Math.min(90, Number(cell.latitude)));
    const x = Math.min(PHYSICAL_LABEL_BUCKET_COLUMNS - 1, Math.floor((longitude + 180) / PHYSICAL_LABEL_BUCKET_SIZE));
    const y = Math.max(0, Math.min(89, Math.floor((latitude + 90) / PHYSICAL_LABEL_BUCKET_SIZE)));
    const key = y * PHYSICAL_LABEL_BUCKET_COLUMNS + x;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(cell);
  }
  const index = { revision: world.revision, buckets, results: new Map() };
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
  const resultKey = longitude.toFixed(4) + ":" + latitude.toFixed(4);
  if (index.results.has(resultKey)) return index.results.get(resultKey);
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const centerX = Math.min(PHYSICAL_LABEL_BUCKET_COLUMNS - 1, Math.floor((wrappedLongitude + 180) / PHYSICAL_LABEL_BUCKET_SIZE));
  const centerY = Math.max(0, Math.min(89, Math.floor((latitude + 90) / PHYSICAL_LABEL_BUCKET_SIZE)));
  let nearest = null, best = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    const y = centerY + dy;
    if (y < 0 || y >= 90) continue;
    for (let dx = -2; dx <= 2; dx++) {
      const x = (centerX + dx + PHYSICAL_LABEL_BUCKET_COLUMNS) % PHYSICAL_LABEL_BUCKET_COLUMNS;
      for (const cell of index.buckets.get(y * PHYSICAL_LABEL_BUCKET_COLUMNS + x) ?? []) {
        const deltaLongitude = ((Number(cell.longitude) - longitude + 540) % 360) - 180;
        const deltaLatitude = Number(cell.latitude) - latitude;
        const distance = Math.hypot(deltaLongitude * Math.cos(latitude * Math.PI / 180), deltaLatitude);
        if (distance < best) { best = distance; nearest = cell; }
      }
    }
  }
  const submerged = Boolean(nearest && (nearest.inundated || nearest.permanentlySubmerged) && best < 2.2);
  index.results.set(resultKey, submerged);
  return submerged;
}

function getSortedLabelCandidates(collection) {
  let candidates = sortedLabelCollections.get(collection);
  if (!candidates) {
    candidates = [...collection.features].sort((a, b) => {
      const rank = kind => kind === "continent" ? 0 : kind === "ocean" ? 1 : kind === "country" ? 2 : kind === "province" ? 3 : kind === "city" ? 4 : 5;
      const kindDifference = rank(a.properties?.kind) - rank(b.properties?.kind);
      if (kindDifference) return kindDifference;
      if (a.properties?.kind === "city" && b.properties?.kind === "city") {
        const rankA = Number(a.properties?.scalerank ?? a.properties?.SCALERANK ?? a.properties?.minZoom ?? 99);
        const rankB = Number(b.properties?.scalerank ?? b.properties?.SCALERANK ?? b.properties?.minZoom ?? 99);
        if (rankA !== rankB) return rankA - rankB;
        const populationDifference = Number(b.properties?.POP_MAX ?? b.properties?.pop_max ?? 0)
          - Number(a.properties?.POP_MAX ?? a.properties?.pop_max ?? 0);
        if (populationDifference) return populationDifference;
      }
      // Départage stable : à priorité égale, l'ordre ne dépend pas de l'ordre
      // d'arrivée des sources GeoJSON ou de leur fusion asynchrone.
      return String(a.properties?.name ?? "").localeCompare(
        String(b.properties?.name ?? ""), "fr", { sensitivity: "base" }
      );
    });
    sortedLabelCollections.set(collection, candidates);
  }
  return candidates;
}

function labelBoxCollides(box, occupiedCells, cellSize = LABEL_COLLISION_CELL_SIZE) {
  const minX = Math.floor(box.left / cellSize);
  const maxX = Math.floor(box.right / cellSize);
  const minY = Math.floor(box.top / cellSize);
  const maxY = Math.floor(box.bottom / cellSize);
  const checked = new Set();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (const other of occupiedCells.get(`${x}:${y}`) ?? []) {
        if (checked.has(other)) continue;
        checked.add(other);
        if (!(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom)) return true;
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
      if (!occupiedCells.has(key)) occupiedCells.set(key, []);
      occupiedCells.get(key).push(box);
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

function territoryName(properties = {}) {
  for (const key of ["NAME", "ADMIN", "name", "NAME_EN", "name_en", "SOVEREIGNT", "NAME_LONG"]) {
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
  "new zealand": "Nouvelle-Zélande"
};

const frenchRegionNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["fr"], { type: "region" })
  : null;
const ISO3_TO_ISO2 = {"AFG":"AF","ALB":"AL","DZA":"DZ","AND":"AD","AGO":"AO","ATG":"AG","ARG":"AR","ARM":"AM","AUS":"AU","AUT":"AT","AZE":"AZ","BHS":"BS","BHR":"BH","BGD":"BD","BRB":"BB","BLR":"BY","BEL":"BE","BLZ":"BZ","BEN":"BJ","BTN":"BT","BOL":"BO","BIH":"BA","BWA":"BW","BRA":"BR","BRN":"BN","BGR":"BG","BFA":"BF","BDI":"BI","CPV":"CV","KHM":"KH","CMR":"CM","CAN":"CA","CAF":"CF","TCD":"TD","CHL":"CL","CHN":"CN","COL":"CO","COM":"KM","COG":"CG","COD":"CD","CRI":"CR","CIV":"CI","HRV":"HR","CUB":"CU","CYP":"CY","CZE":"CZ","DNK":"DK","DJI":"DJ","DMA":"DM","DOM":"DO","ECU":"EC","EGY":"EG","SLV":"SV","GNQ":"GQ","ERI":"ER","EST":"EE","SWZ":"SZ","ETH":"ET","FJI":"FJ","FIN":"FI","FRA":"FR","GAB":"GA","GMB":"GM","GEO":"GE","DEU":"DE","GHA":"GH","GRC":"GR","GRD":"GD","GTM":"GT","GIN":"GN","GNB":"GW","GUY":"GY","HTI":"HT","HND":"HN","HUN":"HU","ISL":"IS","IND":"IN","IDN":"ID","IRN":"IR","IRQ":"IQ","IRL":"IE","ISR":"IL","ITA":"IT","JAM":"JM","JPN":"JP","JOR":"JO","KAZ":"KZ","KEN":"KE","KIR":"KI","PRK":"KP","KOR":"KR","KWT":"KW","KGZ":"KG","LAO":"LA","LVA":"LV","LBN":"LB","LSO":"LS","LBR":"LR","LBY":"LY","LIE":"LI","LTU":"LT","LUX":"LU","MDG":"MG","MWI":"MW","MYS":"MY","MDV":"MV","MLI":"ML","MLT":"MT","MHL":"MH","MRT":"MR","MUS":"MU","MEX":"MX","FSM":"FM","MDA":"MD","MCO":"MC","MNG":"MN","MNE":"ME","MAR":"MA","MOZ":"MZ","MMR":"MM","NAM":"NA","NRU":"NR","NPL":"NP","NLD":"NL","NZL":"NZ","NIC":"NI","NER":"NE","NGA":"NG","MKD":"MK","NOR":"NO","OMN":"OM","PAK":"PK","PLW":"PW","PAN":"PA","PNG":"PG","PRY":"PY","PER":"PE","PHL":"PH","POL":"PL","PRT":"PT","QAT":"QA","ROU":"RO","RUS":"RU","RWA":"RW","KNA":"KN","LCA":"LC","VCT":"VC","WSM":"WS","SMR":"SM","STP":"ST","SAU":"SA","SEN":"SN","SRB":"RS","SYC":"SC","SLE":"SL","SGP":"SG","SVK":"SK","SVN":"SI","SLB":"SB","SOM":"SO","ZAF":"ZA","SSD":"SS","ESP":"ES","LKA":"LK","SDN":"SD","SUR":"SR","SWE":"SE","CHE":"CH","SYR":"SY","TWN":"TW","TJK":"TJ","TZA":"TZ","THA":"TH","TLS":"TL","TGO":"TG","TON":"TO","TTO":"TT","TUN":"TN","TUR":"TR","TKM":"TM","TUV":"TV","UGA":"UG","UKR":"UA","ARE":"AE","GBR":"GB","USA":"US","URY":"UY","UZB":"UZ","VUT":"VU","VAT":"VA","VEN":"VE","VNM":"VN","YEM":"YE","ZMB":"ZM","ZWE":"ZW","XKX":"XK"};

export function frenchTerritoryName(value, properties = {}) {
  const raw = String(value ?? territoryName(properties) ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const owner = String(properties.SUBJECTO ?? properties.SOVEREIGNT ?? "").trim().toLowerCase();
  if (/^(aquitaine|duchy of aquitaine)$/.test(key) && /england|britain/.test(owner)) return "Aquitaine anglaise";
  if (/^(guyenne|gascony)$/.test(key) && /england|britain/.test(owner)) return key === "guyenne" ? "Guyenne anglaise" : "Gascogne anglaise";
  if (FRENCH_HISTORICAL_NAMES[key]) return FRENCH_HISTORICAL_NAMES[key];
  const iso3 = String(properties.ISO_A3 ?? properties.ADM0_A3 ?? properties.SOV_A3 ?? "").toUpperCase();
  const iso2 = String(properties.ISO_A2 ?? properties.iso_a2 ?? ISO3_TO_ISO2[iso3] ?? "").toUpperCase();
  if (frenchRegionNames && /^[A-Z]{2}$/.test(iso2) && iso2 !== "-99") {
    const localized = frenchRegionNames.of(iso2);
    if (localized && localized !== iso2) return localized;
  }
  return raw;
}

export function buildTerritoryLabels(territories, provinces = null) {
  const features = [];
  for (const feature of territories?.features ?? []) {
    const rawName = territoryName(feature.properties);
    const name = frenchTerritoryName(rawName, feature.properties);
    const point = polygonInteriorLabelPoint(feature);
    if (!name || !point || !point.every(Number.isFinite)) continue;
    features.push({
      type: "Feature",
      properties: { name, kind: "country", minZoom: 1.25, priority: 90 },
      geometry: { type: "Point", coordinates: point }
    });
  }
  for (const feature of provinces?.features ?? []) {
    const rawName = territoryName(feature.properties);
    const name = frenchTerritoryName(rawName, feature.properties);
    const point = polygonInteriorLabelPoint(feature);
    if (!name || !point || !point.every(Number.isFinite)) continue;
    features.push({
      type: "Feature",
      properties: { name, kind: "province", minZoom: 3.5, priority: 55 },
      geometry: { type: "Point", coordinates: point }
    });
  }
  return { type: "FeatureCollection", features };
}

export function territoryColor(feature) {
 const p=feature?.properties??{},name=territoryName(p)||"terra",owner=String(p.SUBJECTO??p.SOVEREIGNT??"").trim()||name;
 const identity=String(p.ADM0_A3??p.SOV_A3??p.ISO_A3??owner).toUpperCase(),n=owner.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase(),region=name.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 if(identity==="FRA"||/^(france|french republic|french empire)$/.test(n)||/french|new france/.test(region))return "#3159A6";
 if(["england","english territory","kingdom of england","great britain","britain","british empire","united kingdom","united kingdom of great britain and ireland"].includes(n)||/british/.test(region))return "#B83A43";
 if(["castile","aragon","granada","spain","crown of castile","spanish empire"].includes(n)||/spanish|spain|new spain|peru \(spain\)/.test(region))return "#D9A52B";
 if(["portugal","kingdom of portugal"].includes(n))return "#3D805B";
 if(/ottoman/.test(n))return "#A63C42";if(/holy roman empire|germany|german/.test(n))return "#A98A42";
 const palette=["#B66F62","#668D78","#B18A4F","#718BAF","#9A769F","#B47E91","#6D9B9C","#A28A62","#7E86A8","#A27B5D","#78936B","#B07862","#64899B","#A18A9A","#9A9A61","#8B765E","#6F9A88","#A77C75","#7885A0","#B08B69"];
 let hash=2166136261;for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);return palette[(hash>>>0)%palette.length];
}
function territoryMatchesSelectedCountry(feature, selectedCountry) {
  if (!selectedCountry) return false;
  const p = feature?.properties ?? {};
  const names = [p.NAME, p.ADMIN, p.name, p.NAME_EN, p.SOVEREIGNT, p.NAME_LONG, p.SUBJECTO].filter(Boolean);
  return names.some(name => String(name).localeCompare(selectedCountry, undefined, { sensitivity: "accent" }) === 0);
}
export function classifyHistoricalTerritoryStyle(feature){
 const p=feature?.properties??{},s=String(p.historicalStatus??p.status??p.STATUS??p.CONTROL_STATUS??"").toLowerCase();
 if(["contested","disputed","contesté","disputé"].includes(s)||p.DISPUTED===1||p.DISPUTED==="1")return "contested";
 if(["influence","sphere-of-influence","influence-zone","non-state","cultural"].includes(s))return "influence";
 if(["unclaimed","unoccupied","no-claim"].includes(s))return "unclaimed";return "sovereign";
}
export function classifyPhysicalCellVisual(c){
  // Les cellules sont un support de calcul : elles ne sont jamais dessinées en rectangles.
  return null;
}
function drawPhysicalWorldLayer(ctx,world,w,h,projection,terrainGrid=null){
 if(!world)return 0;let count=0;ctx.save();
 // Une passe unique pour les côtes modifiées, et non une passe complète par événement.
 if(terrainGrid&&projection.type==="equirectangular"&&(world.events??[]).some(e=>["tsunami","meteor-impact","earthquake"].includes(e.type))){
  drawTerrainRaster(ctx,w,h,terrainGrid,projection.viewport,1,false,world,true);
 }
 const zoom=Number(projection.lodZoom??projection.viewport?.zoom??1);
 for(const event of world.events??[]){
  const center=projectCoordinate([event.longitude,event.latitude],w,h,projection);
  const north=projectCoordinate([event.longitude,Math.min(89.8,event.latitude+event.radiusKm/111.32)],w,h,projection);
  const east=projectCoordinate([event.longitude+event.radiusKm/(111.32*Math.max(.18,Math.cos(event.latitude*Math.PI/180))),event.latitude],w,h,projection);
  const radius=center?Math.max(2,Math.min(900,Math.hypot((east?.x??center.x)-center.x,(north?.y??center.y)-center.y)/Math.SQRT2)):0;
   if(center&&radius>1&&!event.visualExpired){
   ctx.save();ctx.globalAlpha=.68;ctx.lineWidth=Math.max(1,Math.min(3,1.25*Math.sqrt(zoom)))*(projection.renderScale??1);
   ctx.strokeStyle=event.type==="tsunami"?"rgba(105,210,225,.9)":event.type==="earthquake"?"rgba(235,190,125,.92)":"rgba(255,154,83,.95)";
   ctx.setLineDash?.((event.type==="earthquake"?[5,4]:[2,3]).map(value=>value*(projection.renderScale??1)));
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
 if(!collection?.features)return 0;let drawn=0;const zoom=Number(projection.lodZoom??projection.viewport?.zoom??1),profile=pass==="fill"?getTerritoryFillSimplificationProfile(zoom):getTerritoryOutlineSimplificationProfile(zoom),renderScale=projection.renderScale??1;context.save();
 for(const feature of collection.features){if(!feature?.geometry)continue;const status=classifyHistoricalTerritoryStyle(feature),nationalColor=territoryColor(feature),selected=territoryMatchesSelectedCountry(feature,selectedCountry);
  const paint=path=>{
   const fillPath=()=>{if(path)context.fill(path,"evenodd");else context.fill("evenodd");};
   const strokePath=()=>{if(path)context.stroke(path);else context.stroke();};
   if(pass!=="outlines"){const statusOpacity=status==="influence"?.28:status==="contested"?.72:status==="unclaimed"?.12:1;context.globalCompositeOperation="source-over";context.globalAlpha=fillOpacity*statusOpacity;context.fillStyle=nationalColor;fillPath();}
   if(pass!=="fill"){context.globalCompositeOperation="source-over";context.globalAlpha=status==="influence"?.42:.78;context.setLineDash?.((status==="influence"?[3,3]:status==="contested"?[2,2]:[]).map(value=>value*renderScale));context.strokeStyle=nationalColor;context.lineWidth=Math.max(.72,Math.min(1.45,.88*Math.sqrt(zoom)))*renderScale;context.lineJoin="round";strokePath();context.setLineDash?.([]);context.globalAlpha=.46;context.strokeStyle="#14232c";context.lineWidth=Math.max(.45,Math.min(.85,.55*Math.sqrt(zoom)))*renderScale;strokePath();
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

/** Taille des labels interpolée sans seuil brutal, en pixels de rendu. */
export function getMapLabelFontSize(kind, zoom = 1, renderScale = 1) {  const level = Math.max(1, Math.min(20, Number(zoom) || 1));
  const smooth = value => value * value * (3 - 2 * value);
  const blend = (value, start, end) => smooth(Math.max(0, Math.min(1, (value - start) / (end - start))));
  const base = kind === "continent" ? 13 : kind === "country" ? 13 : kind === "province" ? 9 : 10;
  const progressive = kind === "country" ? 2 * blend(level, 1.5, 4) : 0.8 * blend(Math.log(level), 0, Math.log(20));
  return (base + progressive) * Math.max(0.1, Number(renderScale) || 1);
}

function drawMapLabels(context, collection, width, height, projection, theme, zoom, physicalWorld = null, labelDensity = 1) {
  if (!collection?.features) return [];
  const hits = [];
  const occupiedCells = new Map();
  const renderScale = projection.renderScale ?? 1;
  const collisionCellSize = LABEL_COLLISION_CELL_SIZE * renderScale;
  // L'ordre de priorité est calculé une seule fois par collection ; le seuil de zoom
  // reste évalué à chaque rendu pour que les labels apparaissent au bon moment.
  const density = Math.max(0.5, Math.min(1.1, Number(labelDensity) || 1));
  const baseCandidateLimit = zoom < 1.5 ? 48 : zoom < 3 ? 90 : zoom < 6 ? 180 : Infinity;
  const candidateLimit = Number.isFinite(baseCandidateLimit)
    ? Math.max(24, Math.floor(baseCandidateLimit * density)) : Infinity;
  const candidates = getSortedLabelCandidates(collection);
  const cityLabelLimit = Math.max(2, Math.round(getCityLabelLimit(zoom) * density));
  let cityLabelsDrawn = 0;
  for (let candidateIndex = 0; candidateIndex < Math.min(candidates.length, candidateLimit); candidateIndex++) {
    const feature = candidates[candidateIndex];
    if (Number(feature.properties?.minZoom ?? 1) > zoom) continue;
    const kind = feature.properties?.kind ?? "place";
    if (zoom < 3 && kind === "province") continue;
    if (kind === "city" && cityLabelsDrawn >= cityLabelLimit) continue;
    if (feature.geometry?.type !== "Point") continue;
    const point = projectCoordinate(feature.geometry.coordinates, width, height, projection);
    if (!point || point.x < 12 * renderScale || point.x > width - 12 * renderScale || point.y < 12 * renderScale || point.y > height - 12 * renderScale) continue;
    const name = String(feature.properties?.name ?? "");
    if (!name) continue;
    const permanentlySubmerged = kind === "city" && isCityPermanentlySubmerged(feature, physicalWorld);
    const fontSize = getMapLabelFontSize(kind, zoom, renderScale);
    const displayName = kind === "country" ? name.toLocaleUpperCase("fr-FR") : name;
    context.save();
    context.font = kind === "city" ? `700 ${fontSize}px Arial, sans-serif` : kind === "province" ? `600 ${fontSize}px Arial, sans-serif` : `700 ${fontSize}px Georgia, serif`;
    const textWidth = context.measureText(displayName).width;
    const x = point.x - textWidth / 2;
    const y = point.y + (kind === "city" ? 5 * renderScale : 0);
    const box = { left: x - (kind === "country" ? 7 : 4) * renderScale, right: x + textWidth + (kind === "country" ? 7 : 4) * renderScale, top: y - fontSize - (kind === "country" ? 6 : 3) * renderScale, bottom: y + (kind === "city" ? 7 : 4) * renderScale };
    if (labelBoxCollides(box, occupiedCells, collisionCellSize)) { context.restore(); continue; }
    addLabelBox(box, occupiedCells, collisionCellSize);
    if (kind === "city") cityLabelsDrawn++;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineWidth = (kind === "country" ? 4.8 : kind === "city" ? 3.2 : 3.4) * renderScale;
    context.lineJoin = "round";
    context.strokeStyle = kind === "country" ? "rgba(17,35,47,0.96)" : "rgba(12,29,39,0.94)";
    context.fillStyle = permanentlySubmerged ? "#92999d" : kind === "country" ? "#fff0c8" : kind === "city" ? "#ffffff" : kind === "ocean" ? "#a9c6cf" : theme.colors.text;
    context.globalAlpha = kind === "city" || kind === "country" ? 1 : kind === "province" ? 0.86 : 0.78;
    if (kind === "country") {
      context.shadowColor = "rgba(0,0,0,0.65)";
      context.shadowBlur = 4 * renderScale;
    }
    context.strokeText(displayName, x, y);
    context.fillText(displayName, x, y);
    if (kind === "city") {
      context.beginPath();
      context.arc(point.x, point.y - 1 * renderScale, 2.2 * renderScale, 0, Math.PI * 2);
      context.fillStyle = permanentlySubmerged ? "#7f898e" : "#f5d58e";
      context.fill();
      context.strokeStyle = "rgba(12,29,39,0.95)";
      context.lineWidth = 1.2 * renderScale;
      context.stroke();
    }
    context.restore();
    hits.push({ name, kind, x: point.x, y: point.y, bounds: { left: x - 5 * renderScale, right: x + textWidth + 5 * renderScale, top: y - fontSize - 5 * renderScale, bottom: y + 6 * renderScale }, coordinates: feature.geometry.coordinates });
  }
  return hits;
}

const physicalTerrainChangeCache = new WeakMap();
function hasPhysicalTerrainChanges(world) {
  if (!world?.currentCells?.length) return false;
  const revision = Number(world.revision ?? 0);
  const cached = physicalTerrainChangeCache.get(world);
  if (cached?.revision === revision) return cached.changed;
  const changed = world.currentCells.some(cell =>
    Boolean(cell?.inundated)
    || Math.abs(Number(cell?.elevationDeltaM) || 0) > 0.01
    || Number(cell?.tsunamiWaterDepthM) > 0.01
    || Number(cell?.waterDepthM) > 0.01
  );
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
  const visibleAdministrativeBoundaries = selectVisibleFeatures(options.administrativeBoundaries, projection.viewport);
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
    // Banquise antarctique géographique : indépendante des tuiles ETOPO et de leur LOD.
    // Elle est peinte sous le relief et les polygones terrestres, sans passe GPU.
    if (projection.type === "equirectangular") {
      const viewport = projection.viewport ?? {};
      const centerLongitude = Number(viewport.centerLongitude ?? 0);
      const iceProject = createContinuousProjector(width, height, projection);
      const ring = [];
      for (let step = 0; step <= 120; step++) {
        const longitude = centerLongitude - 180 + step * 3;
        const point = iceProject([longitude, -68]);
        if (point) ring.push(point);
      }
      for (let step = 120; step >= 0; step--) {
        const longitude = centerLongitude - 180 + step * 3;
        const point = iceProject([longitude, -90]);
        if (point) ring.push(point);
      }
      if (ring.length >= 4) {
        const gradient = target.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "rgba(239,247,250,0.04)");
        gradient.addColorStop(0.45, "rgba(239,247,250,0.72)");
        gradient.addColorStop(1, "rgba(248,251,252,0.96)");
        target.save();
        target.beginPath();
        target.moveTo(ring[0].x, ring[0].y);
        for (let index = 1; index < ring.length; index++) target.lineTo(ring[index].x, ring[index].y);
        target.closePath();
        target.fillStyle = gradient;
        target.fill();
        target.restore();
      }
    }
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
            if (feature?.geometry) traceGeometry(target, feature.geometry, width, height, projection, coastProfile);
          }
          target.clip("evenodd");
        }
      }
      if (options.terrainTileStore && globalThis.__TERRA_DISABLE_TERRAIN_WEBGL_TILES !== true
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
      if (!terrainEnabled) {
        terrainEnabled = measureLayer("relief-base", () => drawTerrainRaster(target, width, height,
          options.terrain, projection.viewport, options.terrainQuality ?? 1, true, options.physicalWorld));
        if (terrainRenderer === "canvas2d") terrainRenderer = "canvas2d";
      } else {
        renderTimings["relief-base"] = 0;
      }
      target.restore();
      // L'Antarctique reçoit un aplat neige autonome après le relief : les tuiles
      // ETOPO ne peuvent donc ni le masquer ni le rendre transparent au zoom mondial.
      if (projection.type === "equirectangular" && visibleLand?.features?.length) {
        const antarcticFeatures = visibleLand.features.filter(isAntarcticLandFeature);
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
        return drawPolygonLayer(target, visibleLand, width, height, projection, landFill,
          theme.colors.coast, 0.85, 1, true, Infinity, coastProfile);
      }
      try {
        const classification = measureLayer("land-feature-classification", () => {
          const supportedLand = [];
          const unsupportedLand = [];
          const supportedCoasts = [];
          const unsupportedCoasts = [];
          for (const feature of visibleLand.features) {
            (globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_POLYGON_FILL === true || !geographicRenderer.supports(feature)
              ? unsupportedLand : supportedLand).push(feature);
            (
              globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_LAND_COAST === true
                || !geographicRenderer.supportsBoundary(feature)
                ? unsupportedCoasts
                : supportedCoasts
            ).push(feature);
          }
          return { supportedLand, unsupportedLand, supportedCoasts, unsupportedCoasts };
        });
        const { supportedLand, unsupportedLand, supportedCoasts, unsupportedCoasts } = classification;
        let drawn = 0;
        if (unsupportedLand.length) {
          drawn += measureLayer("land-canvas-fallback", () => drawPolygonLayer(target,
            { ...visibleLand, features: unsupportedLand }, width, height, projection,
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
        return drawPolygonLayer(target, visibleLand, width, height, projection, landFill,
          theme.colors.coast, 0.85, 1, true, Infinity, coastProfile);
      }
    });
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
    const glaciersVisible = detailProfile.glaciers ? {
      type: "FeatureCollection",
      features: (visibleGlaciers?.features ?? []).filter(feature => Number(feature.properties?.scalerank ?? feature.properties?.SCALERANK ?? feature.properties?.min_zoom ?? feature.properties?.MIN_ZOOM ?? 0) <= 4)
    } : { type: "FeatureCollection", features: [] };
    const majorLakes = { type: "FeatureCollection", features: selectMajorLakeFeatures(visibleLakes, detailProfile.lakesRank, MAX_VISIBLE_LAKES) };
    const majorRivers = { type: "FeatureCollection", features: selectMajorRiverFeatures(visibleRivers, detailProfile.riversRank, detailProfile.riversMax) };
    let geographicDetailGpu = false;
    let glacierCount = 0, lakeCount = 0, riverCount = 0;
    const lakeProfile = getLakeCoastSimplificationProfile(projection.lodZoom ?? projection.viewport?.zoom ?? 1);
    const riverProfile = getBoundarySimplificationProfile(projection.lodZoom ?? 1);
    if (geographicRenderer?.renderLayers && geographicRenderer.canvas && projection.type === "equirectangular") {
      try {
        const supportedGlaciers = glaciersVisible.features.filter(feature => geographicRenderer.supports(feature));
        const supportedLakes = majorLakes.features.filter(feature => geographicRenderer.supports(feature));
        // Diagnostic A/B : bascule les rivières WebGL vers le rendu Canvas sans toucher aux autres couches.
        const disableGpuRiverLines = globalThis.__TERRA_DISABLE_GEOGRAPHIC_WEBGL_RIVER_LINES === true;
        const supportedRivers = disableGpuRiverLines ? []
          : majorRivers.features.filter(feature => geographicRenderer.supportsLine(feature));
        const ratio = backingWidth / width;
        const glacierColor = parseWebGLColor("#dce8e5"); glacierColor[3] = 0.88;
        const lakeColor = parseWebGLColor(theme.colors.ocean);
        const riverColor = parseWebGLColor(theme.colors.accent);
        measureLayer("details-geographiques-webgl", () => geographicRenderer.renderLayers([
          { key: "glacier-fills", type: "polygons", features: supportedGlaciers, color: glacierColor },
          { key: "lake-fills", type: "polygons", features: supportedLakes, color: lakeColor },
          { key: "river-lines", type: "lines", features: supportedRivers, color: riverColor, lineWidth: 0.7 * ratio }        ], backingWidth, backingHeight, projection.viewport));
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.drawImage(geographicRenderer.canvas, 0, 0, backingWidth, backingHeight);
        target.restore();
        const unsupportedGlaciers = glaciersVisible.features.filter(feature => !geographicRenderer.supports(feature));
        const unsupportedLakes = majorLakes.features.filter(feature => !geographicRenderer.supports(feature));
        const unsupportedRivers = disableGpuRiverLines ? majorRivers.features
          : majorRivers.features.filter(feature => !geographicRenderer.supportsLine(feature));
        glacierCount = measureLayer("glaciers", () => {
          drawPolygonLayer(target, { ...glaciersVisible, features: unsupportedGlaciers }, width, height, projection, "#dce8e5", null, 0, 0.88, false, 4);
          drawPolygonLayer(target, glaciersVisible, width, height, projection, "rgba(0,0,0,0)", "#9ebfc3", 0.7, 0.88, false, 4);
          return glaciersVisible.features.length;
        });
        lakeCount = measureLayer("lacs", () => {
          drawPolygonLayer(target, { ...majorLakes, features: unsupportedLakes }, width, height, projection, theme.colors.ocean, null, 0, 1, true, detailProfile.lakesRank, lakeProfile);
          drawPolygonLayer(target, majorLakes, width, height, projection, "rgba(0,0,0,0)", theme.colors.accent, 0.55, 1, true, detailProfile.lakesRank, lakeProfile);
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
      glacierCount = measureLayer("glaciers", () => glaciersVisible.features.length
        ? drawPolygonLayer(target, glaciersVisible, width, height, projection, "#dce8e5", "#9ebfc3", 0.7, 0.88, false, 4) : 0);
      lakeCount = measureLayer("lacs", () => drawPolygonLayer(target, majorLakes, width, height, projection, theme.colors.ocean, theme.colors.accent, 0.55, 1, true, detailProfile.lakesRank, lakeProfile));
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
      const supportedPolitical = (visiblePoliticalBoundaries?.features ?? [])
        .filter(feature => boundaryRenderer.supportsBoundary(feature));
      const supportedAdministrative = (visibleAdministrativeBoundaries?.features ?? [])
        .filter(feature => boundaryRenderer.supportsBoundary(feature));
      const unsupportedPolitical = (visiblePoliticalBoundaries?.features ?? [])
        .filter(feature => !boundaryRenderer.supportsBoundary(feature));
      const unsupportedAdministrative = (visibleAdministrativeBoundaries?.features ?? [])
        .filter(feature => !boundaryRenderer.supportsBoundary(feature));
      const ratio = backingWidth / width;
      measureLayer("frontieres-webgl", () => boundaryRenderer.renderLayers([
        { key: "political-boundary-halo", type: "boundaries", features: supportedPolitical,
          color: parseWebGLColor("#ead7aa"), lineWidth: (options.interactive ? 1.65 : 2.35) * ratio },
        { key: "political-boundary-core", type: "boundaries", features: supportedPolitical,
          color: parseWebGLColor("#293945"), lineWidth: (options.interactive ? 0.75 : 1.05) * ratio },
        { key: "administrative-boundary-lines", type: "boundaries", features: supportedAdministrative,
          color: parseWebGLColor("#91b7c4"), lineWidth: (options.interactive ? 0.48 : 0.65) * ratio }
      ], backingWidth, backingHeight, projection.viewport));
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(boundaryRenderer.canvas, 0, 0, backingWidth, backingHeight);
      context.restore();
      politicalBoundaryCount = supportedPolitical.length;
      administrativeBoundaryCount = supportedAdministrative.length;
      if (unsupportedPolitical.length) {
        politicalBoundaryCount += drawStyledBoundaryLayer(context,
          { ...visiblePoliticalBoundaries, features: unsupportedPolitical }, width, height, projection,
          "#ead7aa", options.interactive ? 1.65 : 2.35, [], true);
        drawStyledBoundaryLayer(context,
          { ...visiblePoliticalBoundaries, features: unsupportedPolitical }, width, height, projection,
          "#293945", options.interactive ? 0.75 : 1.05, [], true);
      }
      if (unsupportedAdministrative.length) {
        administrativeBoundaryCount += drawStyledBoundaryLayer(context,
          { ...visibleAdministrativeBoundaries, features: unsupportedAdministrative }, width, height, projection,
          "#91b7c4", options.interactive ? 0.48 : 0.65, [2.2, 2.4], false, true);
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
    administrativeBoundaryCount = measureLayer("frontieres-administratives", () =>
      drawStyledBoundaryLayer(context, visibleAdministrativeBoundaries, width, height, projection, "#91b7c4", options.interactive ? 0.48 : 0.65, [2.2, 2.4], false, true));
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
    combinedLandMaskCacheHits,
    combinedLandMaskCacheMisses,
    combinedLandMaskCacheEntries: combinedLandMaskCache.size,
    maxCombinedLandMaskCacheEntries: COMBINED_LAND_MASK_CACHE_LIMIT
  };
}
