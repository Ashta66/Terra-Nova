import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";
import { drawTerrainRaster } from "./terrain.js";
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

// Profil volontairement plus léger : le coût des contours augmente fortement
// avec les données 1:10m ; les micro-îlots restent masqués même au zoom rapproché.
export function getCoastSimplificationProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  if (level <= 1.5) return { tolerance: 1.2, minRingArea: 2 };
  if (level <= 4) return { tolerance: 1.5, minRingArea: 2.8 };
  if (level <= 10) return { tolerance: 1.9, minRingArea: 4 };
  return { tolerance: 2.3, minRingArea: 5.5 };
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
    if (farthest !== -1) {
      keep[farthest] = 1;
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
const PROJECTED_PATHS_PER_FEATURE = 3;
const MAX_PROJECTED_PATHS = 512;
const MAX_PROJECTED_PATH_VERTICES = 250_000;
let projectedPathVertexCount = 0;

function touchProjectedPath(entry, feature) {
  projectedPathCacheLru.delete(entry);
  projectedPathCacheLru.set(entry, feature);
}

function getProjectedPath(feature, width, height, projection, coastProfile = null) {
  if (typeof Path2D === "undefined" || !feature?.geometry) return null;
  const viewport = projection.viewport ?? {};
  const key = [
    projection.type, width, height,
    Number(viewport.zoom ?? 1).toFixed(4),
    ((((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360) - 180).toFixed(4),
    Number(viewport.centerLatitude ?? 0).toFixed(4),
    coastProfile ? Number(coastProfile.tolerance).toFixed(3) : "full",
    coastProfile ? Number(coastProfile.minRingArea).toFixed(3) : "all"
  ].join(":");
  let entries = projectedPathCache.get(feature);
  if (!entries) {
    entries = new Map();
    projectedPathCache.set(feature, entries);
  }
  if (entries.has(key)) {
    const cached = entries.get(key);
    touchProjectedPath(cached, feature);
    return cached.path;
  }
  const path = new Path2D();
  const vertexCount = traceGeometry(path, feature.geometry, width, height, projection, coastProfile);
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

function drawPolygonLayer(context, collection, width, height, projection, fill, stroke, lineWidth, alpha = 1, simplifyCoast = false) {
  if (!collection?.features) return 0;
  let drawn = 0;
  context.save();
  context.globalAlpha = alpha;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    const coastProfile = simplifyCoast ? getCoastSimplificationProfile(projection.viewport?.zoom ?? 1) : null;
    const cachedPath = getProjectedPath(feature, width, height, projection, coastProfile);
    if (!cachedPath) {
      context.beginPath();
      if (!traceGeometry(context, feature.geometry, width, height, projection, coastProfile)) continue;
    }
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    // CanvasRenderingContext2D accepts either a cached Path2D or the current path.
    if (cachedPath) {
      context.fill(cachedPath, "evenodd");
      context.stroke(cachedPath);
    } else {
      context.fill("evenodd");
      context.stroke();
    }
    drawn++;
  }
  context.restore();
  return drawn;
}

function drawLineLayer(context, collection, width, height, projection, color, lineWidth, simplifyProfile = null) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
    const geometry = feature?.geometry;
    if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) continue;
    const cachedPath = getProjectedPath(feature, width, height, projection, simplifyProfile);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
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

function getBoundarySimplificationProfile(zoom = 1) {
  const level = Math.max(1, Number(zoom) || 1);
  if (level <= 1.5) return { tolerance: 0.75 };
  if (level <= 4) return { tolerance: 0.5 };
  if (level <= 10) return { tolerance: 0.28 };
  return { tolerance: 0.12 };
}

function drawStyledBoundaryLayer(context, collection, width, height, projection, color, lineWidth, dash = [], precisionAware = false) {
  if (!collection?.features) return 0;
  let count = 0;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.globalAlpha = 0.92;
  const simplifyProfile = getBoundarySimplificationProfile(projection.viewport?.zoom ?? 1);
  for (const feature of collection.features) {
    const precision = Number(feature?.properties?.BORDERPRECISION ?? feature?.properties?.borderPrecision ?? 3);
    context.setLineDash?.(precisionAware && precision < 3 ? [3, 2] : dash);
    count += drawLineLayer(context, { type: "FeatureCollection", features: [feature] }, width, height, projection, color, lineWidth, simplifyProfile);
  }
  context.restore();
  return count;
}

function drawLandHachures(context, collection, width, height, projection, color) {
  if (!collection?.features || typeof context.clip !== "function") return;
  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = color;
  context.lineWidth = 0.45;
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    context.save();
    const cachedPath = getProjectedPath(feature, width, height, projection);
    if (cachedPath) {
      context.clip(cachedPath, "evenodd");
    } else {
      context.beginPath();
      if (traceGeometry(context, feature.geometry, width, height, projection)) context.clip("evenodd");
    }
    if (cachedPath || typeof Path2D === "undefined") {
      for (let offset = -height; offset < width; offset += 13) {
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

function drawElevationPoints(context, collection, width, height, projection, theme) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Point") continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = projectCoordinate([longitude, latitude], width, height, projection);
    if (!point) continue;
    const elevation = Number(feature.properties?.elevation_m ?? 0);
    const isMountain = feature.properties?.kind === "mountain";
    const isDepression = feature.properties?.kind === "depression";
    context.save();
    context.fillStyle = isDepression ? "#6f8f9b" : theme.colors.accent;
    context.strokeStyle = theme.colors.coast;
    context.lineWidth = 0.8;
    context.beginPath();
    if (isMountain) {
      const size = elevation >= 7000 ? 5 : elevation >= 4000 ? 4 : 3;
      context.moveTo(point.x, point.y - size);
      context.lineTo(point.x + size, point.y + size);
      context.lineTo(point.x - size, point.y + size);
      context.closePath();
    } else {
      context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    }
    context.fill();
    context.stroke();
    if (isMountain && elevation >= 5000 && typeof context.fillText === "function") {
      context.font = "10px Georgia, serif";
      context.textAlign = "left";
      context.fillStyle = theme.colors.text;
      context.fillText(feature.properties?.name ?? "Sommet", point.x + 6, point.y - 4);
    }
    context.restore();
    drawn++;
  }
  return drawn;
}


const sortedLabelCollections = new WeakMap();
const LABEL_COLLISION_CELL_SIZE = 64;

function getSortedLabelCandidates(collection) {
  let candidates = sortedLabelCollections.get(collection);
  if (!candidates) {
    candidates = [...collection.features].sort((a, b) => {
      const rank = kind => kind === "continent" ? 0 : kind === "ocean" ? 1 : kind === "country" ? 2 : kind === "province" ? 3 : kind === "city" ? 4 : 5;
      return rank(a.properties?.kind) - rank(b.properties?.kind);
    });
    sortedLabelCollections.set(collection, candidates);
  }
  return candidates;
}

function labelBoxCollides(box, occupiedCells) {
  const minX = Math.floor(box.left / LABEL_COLLISION_CELL_SIZE);
  const maxX = Math.floor(box.right / LABEL_COLLISION_CELL_SIZE);
  const minY = Math.floor(box.top / LABEL_COLLISION_CELL_SIZE);
  const maxY = Math.floor(box.bottom / LABEL_COLLISION_CELL_SIZE);
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

function addLabelBox(box, occupiedCells) {
  const minX = Math.floor(box.left / LABEL_COLLISION_CELL_SIZE);
  const maxX = Math.floor(box.right / LABEL_COLLISION_CELL_SIZE);
  const minY = Math.floor(box.top / LABEL_COLLISION_CELL_SIZE);
  const maxY = Math.floor(box.bottom / LABEL_COLLISION_CELL_SIZE);
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

export function buildTerritoryLabels(territories, provinces = null) {
  const features = [];
  for (const feature of territories?.features ?? []) {
    const name = territoryName(feature.properties);
    const point = polygonInteriorLabelPoint(feature);
    if (!name || !point || !point.every(Number.isFinite)) continue;
    features.push({
      type: "Feature",
      properties: { name, kind: "country", minZoom: 1.25, priority: 90 },
      geometry: { type: "Point", coordinates: point }
    });
  }
  for (const feature of provinces?.features ?? []) {
    const name = territoryName(feature.properties);
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
  const properties = feature?.properties ?? {};
  const name = territoryName(properties) || "terra";
  const identity = String(properties.ADM0_A3 ?? properties.SOV_A3 ?? properties.ISO_A3 ?? name).toUpperCase();
  const normalized = name.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
  // Traditional historical heraldic associations; deliberately muted for atlas readability.
  if (identity === "FRA" || /^(france|french republic)$/.test(normalized)) return "#3159A6"; // France: bleu roi
  if (["england", "english territory", "kingdom of england", "great britain"].includes(normalized)) return "#B83A43"; // England: red
  if (["castile", "aragon", "granada", "spain", "crown of castile"].includes(normalized)) return "#D9A52B"; // Iberian crowns: gold / ochre
  if (["portugal", "kingdom of portugal"].includes(normalized)) return "#3D805B";
  if (/^(scotland|kingdom of scotland)$/.test(normalized)) return "#456C9C";
  if (/^(ireland|lordship of ireland)$/.test(normalized)) return "#47815E";
  if (/ottoman empire|ottoman/.test(normalized)) return "#A63C42";
  if (/holy roman empire|germany|german/.test(normalized)) return "#A98A42";
  if (/venice|venetian/.test(normalized)) return "#B94D43";
  if (/poland|lithuania/.test(normalized)) return "#A84A52";
  if (/byzantine|constantinople/.test(normalized)) return "#80649B";
  if (/mali|songhai/.test(normalized)) return "#A9823D";
  if (/morocco|marinid/.test(normalized)) return "#477B55";
  if (/hungary/.test(normalized)) return "#A64A49";
  if (/sweden|kalmar/.test(normalized)) return "#4F79A8";
  if (/denmark/.test(normalized)) return "#B94B4B";
  if (/novgorod|russia|rus'/.test(normalized)) return "#9B4650";
  if (/ming|china|qing/.test(normalized)) return "#B64D42";
  if (/japan|shogun/.test(normalized)) return "#B94B55";
  const palette = ["#B66F62","#668D78","#B18A4F","#718BAF","#9A769F","#B47E91","#6D9B9C","#A28A62","#7E86A8","#A27B5D","#78936B","#B07862","#64899B","#A18A9A","#9A9A61","#8B765E","#6F9A88","#A77C75","#7885A0","#B08B69"];
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return palette[(hash >>> 0) % palette.length];
}
function territoryMatchesSelectedCountry(feature, selectedCountry) {
  if (!selectedCountry) return false;
  const p = feature?.properties ?? {};
  const names = [p.NAME, p.ADMIN, p.name, p.NAME_EN, p.SOVEREIGNT, p.NAME_LONG].filter(Boolean);
  return names.some(name => String(name).localeCompare(selectedCountry, undefined, { sensitivity: "accent" }) === 0);
}
function drawTerritoryLayer(context, collection, width, height, projection, selectedCountry = "") {
  if (!collection?.features) return 0;
  let drawn = 0;
  const profile = getCoastSimplificationProfile(projection.viewport?.zoom ?? 1);
  context.save();
  for (const feature of collection.features) {
    if (!feature?.geometry) continue;
    const path = getProjectedPath(feature, width, height, projection, profile);
    if (path) {
      const nationalColor = territoryColor(feature);
      context.fillStyle = nationalColor;
      context.globalAlpha = 0.58;
      context.fill(path, "evenodd");
      // Saturated national edge, then a dark separator: adjacent similar hues remain distinguishable.
      context.globalAlpha = 0.98;
      context.strokeStyle = nationalColor;
      context.lineWidth = Math.max(1.35, Math.min(3.2, 2.1 * Math.sqrt(projection.viewport?.zoom ?? 1)));
      context.lineJoin = "round";
      context.stroke(path);
      context.globalAlpha = 0.82;
      context.strokeStyle = "#101820";
      context.lineWidth = Math.max(0.65, Math.min(1.65, 0.95 * Math.sqrt(projection.viewport?.zoom ?? 1)));
      context.stroke(path);
      if (territoryMatchesSelectedCountry(feature, selectedCountry)) {
        context.globalAlpha = 0.22; context.fillStyle = "#fff4c2"; context.fill(path, "evenodd");
        context.globalAlpha = 1; context.strokeStyle = "#fff1b0";
        context.lineWidth = Math.max(3.2, Math.min(7, 4.2 * Math.sqrt(projection.viewport?.zoom ?? 1))); context.stroke(path);
        context.strokeStyle = "#fff"; context.lineWidth = Math.max(1.1, Math.min(2.2, 1.45 * Math.sqrt(projection.viewport?.zoom ?? 1))); context.stroke(path);
      }
      drawn++;
    } else {
      context.beginPath();
      if (!traceGeometry(context, feature.geometry, width, height, projection, profile)) continue;
      const nationalColor = territoryColor(feature);
      context.fillStyle = nationalColor;
      context.globalAlpha = 0.58;
      context.fill("evenodd");
      context.globalAlpha = 0.98;
      context.strokeStyle = nationalColor;
      context.lineWidth = Math.max(1.35, Math.min(3.2, 2.1 * Math.sqrt(projection.viewport?.zoom ?? 1)));
      context.lineJoin = "round";
      context.stroke();
      context.globalAlpha = 0.82;
      context.strokeStyle = "#101820";
      context.lineWidth = Math.max(0.65, Math.min(1.65, 0.95 * Math.sqrt(projection.viewport?.zoom ?? 1)));
      context.stroke();
      if (territoryMatchesSelectedCountry(feature, selectedCountry)) {
        context.globalAlpha = 0.22; context.fillStyle = "#fff4c2"; context.fill("evenodd");
        context.globalAlpha = 1; context.strokeStyle = "#fff1b0";
        context.lineWidth = Math.max(3.2, Math.min(7, 4.2 * Math.sqrt(projection.viewport?.zoom ?? 1))); context.stroke();
        context.strokeStyle = "#fff"; context.lineWidth = Math.max(1.1, Math.min(2.2, 1.45 * Math.sqrt(projection.viewport?.zoom ?? 1))); context.stroke();
      }
      drawn++;
    }
  }
  context.restore();
  return drawn;
}

function drawMapLabels(context, collection, width, height, projection, theme, zoom) {
  if (!collection?.features) return [];
  const hits = [];
  const occupiedCells = new Map();
  // L'ordre de priorité est calculé une seule fois par collection ; le seuil de zoom
  // reste évalué à chaque rendu pour que les labels apparaissent au bon moment.
  for (const feature of getSortedLabelCandidates(collection)) {
    if (Number(feature.properties?.minZoom ?? 1) > zoom) continue;
    if (feature.geometry?.type !== "Point") continue;
    const point = projectCoordinate(feature.geometry.coordinates, width, height, projection);
    if (!point || point.x < 12 || point.x > width - 12 || point.y < 12 || point.y > height - 12) continue;
    const name = String(feature.properties?.name ?? "");
    if (!name) continue;
    const kind = feature.properties?.kind ?? "place";
    const fontSize = kind === "continent" ? 13 : kind === "country" ? (zoom < 3 ? 13 : 15) : kind === "province" ? 9 : 10;
    const displayName = kind === "country" ? name.toLocaleUpperCase("fr-FR") : name;
    context.save();
    context.font = kind === "city" ? `700 ${fontSize}px Arial, sans-serif` : kind === "province" ? `600 ${fontSize}px Arial, sans-serif` : `700 ${fontSize}px Georgia, serif`;
    const textWidth = context.measureText(displayName).width;
    const x = point.x - textWidth / 2;
    const y = point.y + (kind === "city" ? 5 : 0);
    const box = { left: x - (kind === "country" ? 7 : 4), right: x + textWidth + (kind === "country" ? 7 : 4), top: y - fontSize - (kind === "country" ? 6 : 3), bottom: y + (kind === "city" ? 7 : 4) };
    if (labelBoxCollides(box, occupiedCells)) { context.restore(); continue; }
    addLabelBox(box, occupiedCells);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineWidth = kind === "country" ? 4.8 : kind === "city" ? 3.2 : 3.4;
    context.lineJoin = "round";
    context.strokeStyle = kind === "country" ? "rgba(17,35,47,0.96)" : "rgba(12,29,39,0.94)";
    context.fillStyle = kind === "country" ? "#fff0c8" : kind === "city" ? "#ffffff" : kind === "ocean" ? "#a9c6cf" : theme.colors.text;
    context.globalAlpha = kind === "city" || kind === "country" ? 1 : kind === "province" ? 0.86 : 0.78;
    if (kind === "country") {
      context.shadowColor = "rgba(0,0,0,0.65)";
      context.shadowBlur = 4;
    }
    context.strokeText(displayName, x, y);
    context.fillText(displayName, x, y);
    if (kind === "city") {
      context.beginPath();
      context.arc(point.x, point.y - 1, 2.2, 0, Math.PI * 2);
      context.fillStyle = "#f5d58e";
      context.fill();
      context.strokeStyle = "rgba(12,29,39,0.95)";
      context.lineWidth = 1.2;
      context.stroke();
    }
    context.restore();
    hits.push({ name, kind, x: point.x, y: point.y, bounds: { left: x - 5, right: x + textWidth + 5, top: y - fontSize - 5, bottom: y + 6 }, coordinates: feature.geometry.coordinates });
  }
  return hits;
}

export function renderWorldMap(canvas, featureCollection, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("Canvas cartographique requis.");
  if (!featureCollection || featureCollection.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
    throw new TypeError("Une FeatureCollection GeoJSON est requise.");
  }
  const width = Math.max(1, options.width ?? canvas.clientWidth ?? 960);
  const height = Math.max(1, options.height ?? Math.round(width * 0.52));
  const pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);
  // Redimensionner un canvas réinitialise son bitmap et tout son état graphique.
  // Ne toucher aux dimensions que lorsqu'elles changent réellement : le rendu
  // peut ainsi être rappelé pendant le pan/zoom sans réallouer le bitmap à chaque frame.
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contexte Canvas 2D indisponible.");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const year = options.year ?? 1444;
  const theme = getCartographicTheme(year, options.technologyLevel ?? 0);
  const projection = { type: options.projection ?? "equirectangular", viewport: options.viewport ?? {} };

  context.fillStyle = theme.colors.ocean;
  context.fillRect(0, 0, width, height);
  // Le raster actuel est géoréférencé en équirectangulaire ; ne pas l’afficher sous une autre projection.
  let terrainEnabled = false;

  context.save();
  context.strokeStyle = theme.colors.grid;
  context.globalAlpha = 0.10;
  context.lineWidth = 0.35;
  for (let longitude = -150; longitude <= 180; longitude += 30) {
    const a = projectCoordinate([longitude, -85], width, height, projection);
    const b = projectCoordinate([longitude, 85], width, height, projection);
    if (a && b) { context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); }
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    context.beginPath();
    let started = false;
    for (let longitude = -180; longitude <= 180; longitude += 3) {
      const point = projectCoordinate([longitude, latitude], width, height, projection);
      if (!point) { started = false; continue; }
      if (!started) { context.moveTo(point.x, point.y); started = true; }
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  context.restore();

  const visibleLand = selectVisibleFeatures(featureCollection, projection.viewport);
  const coastProfile = getCoastSimplificationProfile(projection.viewport?.zoom ?? 1);
  // Le raster ETOPO est limité à la géométrie terrestre effectivement affichée.
  // Ainsi, le trait de côte, le remplissage et le relief partagent le même contour
  // simplifié : la côte du raster ne peut plus apparaître décalée sous le trait orange.
  if (options.terrainEnabled !== false && projection.type === "equirectangular" && visibleLand?.features?.length) {
    context.save();
    context.beginPath();
    for (const feature of visibleLand.features) {
      if (feature?.geometry) traceGeometry(context, feature.geometry, width, height, projection, coastProfile);
    }
    context.clip("evenodd");
    terrainEnabled = drawTerrainRaster(context, width, height, options.terrain, projection.viewport, options.terrainQuality ?? 1, true);
    context.restore();
  }
  const visibleGlaciers = selectVisibleFeatures(options.glaciers, projection.viewport);
  const visibleLakes = selectVisibleFeatures(options.lakes, projection.viewport);
  const visibleRivers = selectVisibleFeatures(options.rivers, projection.viewport);
  const visibleElevationPoints = selectVisibleFeatures(options.elevationPoints, projection.viewport);
  const visibleLabels = selectVisibleFeatures(options.labels, projection.viewport);
  const visibleTerritories = selectVisibleFeatures(options.territories, projection.viewport);
  const visiblePoliticalBoundaries = selectVisibleFeatures(options.politicalBoundaries, projection.viewport);
  const visibleAdministrativeBoundaries = selectVisibleFeatures(options.administrativeBoundaries, projection.viewport);
  const landFill = terrainEnabled ? "rgba(255,255,255,0.055)" : theme.colors.land;
  const landCount = drawPolygonLayer(context, visibleLand, width, height, projection, landFill, theme.colors.coast, 0.85, 1, true);
  // Les aplats politiques restent présents pendant le déplacement : seule la texture coûteuse est suspendue.
  const territoryCount = drawTerritoryLayer(context, visibleTerritories, width, height, projection, options.selectedCountry ?? "");
  if (!options.interactive && ["parchment", "paper"].includes(theme.texture)) drawLandHachures(context, visibleLand, width, height, projection, theme.colors.coast);
  const glacierCount = drawPolygonLayer(context, visibleGlaciers, width, height, projection, "#dce8e5", "#9ebfc3", 0.7, 0.88);
  const lakeCount = drawPolygonLayer(context, visibleLakes, width, height, projection, theme.colors.ocean, theme.colors.accent, 0.55);
  const riverCount = drawLineLayer(context, visibleRivers, width, height, projection, theme.colors.accent, 0.7);
  const elevationPointCount = options.interactive ? 0 : drawElevationPoints(context, visibleElevationPoints, width, height, projection, theme);
  const politicalBoundaryCount = drawStyledBoundaryLayer(context, visiblePoliticalBoundaries, width, height, projection, "#ead7aa", options.interactive ? 1.65 : 2.35, [], true)
    + drawStyledBoundaryLayer(context, visiblePoliticalBoundaries, width, height, projection, "#293945", options.interactive ? 0.75 : 1.05, [], true);
  const administrativeBoundaryCount = drawStyledBoundaryLayer(context, visibleAdministrativeBoundaries, width, height, projection, "#91b7c4", options.interactive ? 0.48 : 0.65, [2.2, 2.4]);
  const labelHits = drawMapLabels(context, visibleLabels, width, height, projection, theme, projection.viewport.zoom ?? 1);

  return {
    theme, projection: projection.type, viewport: { ...projection.viewport }, featureCount: featureCollection.features.length,
    landCount, territoryCount, lakeCount, riverCount, glacierCount, elevationPointCount, politicalBoundaryCount, administrativeBoundaryCount, labelHits, terrainEnabled, width, height
  };
}


export function getProjectedPathCacheStats() {
  return { cachedPaths: projectedPathCacheLru.size, maxCachedPaths: MAX_PROJECTED_PATHS, cachedVertices: projectedPathVertexCount, maxCachedVertices: MAX_PROJECTED_PATH_VERTICES };
}
