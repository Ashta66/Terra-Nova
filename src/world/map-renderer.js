import { renderTerrainWebGL, getTerrainWebGLStats } from "./terrain-webgl.js";
import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";
import { drawTerrainRaster } from "./terrain.js";


const spatialIndexes = new WeakMap();
function coordinateBounds(feature) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const visit=value=>{
    if(!Array.isArray(value)) return;
    if(value.length>=2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      minX=Math.min(minX,value[0]); maxX=Math.max(maxX,value[0]);
      minY=Math.min(minY,value[1]); maxY=Math.max(maxY,value[1]); return;
    }
    for(const child of value) visit(child);
  };
  visit(feature?.geometry?.coordinates);
  return Number.isFinite(minX)?{minX,minY,maxX,maxY}:null;
}
export function createGeoFeatureIndex(collection, cellSize=10) {
  if(!collection || !Array.isArray(collection.features)) throw new TypeError("FeatureCollection requise.");
  if(!Number.isFinite(cellSize) || cellSize<=0 || cellSize>180) throw new RangeError("Taille de cellule invalide.");
  const columns=Math.ceil(360/cellSize), rows=Math.ceil(180/cellSize), cells=new Map(), global=[];
  const key=(x,y)=>y*columns+x;
  for(const feature of collection.features) {
    const b=coordinateBounds(feature); if(!b) continue;
    if(b.maxX-b.minX>180) { global.push({feature,b}); continue; }
    const x0=Math.max(0,Math.floor((b.minX+180)/cellSize)), x1=Math.min(columns-1,Math.floor((b.maxX+180)/cellSize));
    const y0=Math.max(0,Math.floor((90-b.maxY)/cellSize)), y1=Math.min(rows-1,Math.floor((90-b.minY)/cellSize));
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
      const k=key(x,y); if(!cells.has(k)) cells.set(k,[]); cells.get(k).push({feature,b});
    }
  }
  return {featureCount:collection.features.length,query({west=-180,east=180,south=-90,north=90}={}) {
    if(east-west>=360 || (west<=-180 && east>=180)) return collection.features;
    const intervals=west<=east
      ? (west < -180 ? [[west+360,180],[-180,east]] : east>180 ? [[west,180],[-180,east-360]] : [[west,east]])
      : [[west,180],[-180,east]];
    const found=new Set(), lo=Math.max(-90,south), hi=Math.min(90,north);
    if(lo>hi) return [];
    for(const [left,right] of intervals) {
      const x0=Math.max(0,Math.floor((left+180)/cellSize)), x1=Math.min(columns-1,Math.floor((right+180)/cellSize));
      const y0=Math.max(0,Math.floor((90-hi)/cellSize)), y1=Math.min(rows-1,Math.floor((90-lo)/cellSize));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) for(const e of cells.get(key(x,y))??[]) {
        if(e.b.maxY>=lo && e.b.minY<=hi && e.b.maxX>=left && e.b.minX<=right) found.add(e.feature);
      }
    }
    for(const e of global) if(e.b.maxY>=lo && e.b.minY<=hi) found.add(e.feature);
    return [...found];
  }};
}
function visibleFeatures(collection, projection) {
  if(!collection?.features) return [];
  if(projection.type!=="equirectangular") return collection.features;
  let index=spatialIndexes.get(collection);
  if(!index) { index=createGeoFeatureIndex(collection); spatialIndexes.set(collection,index); }
  const v=projection.viewport??{}, zoom=Math.max(1,Number(v.zoom??1));
  const lon=Number(v.centerLongitude??0), lat=Number(v.centerLatitude??0);
  return index.query({west:lon-180/zoom,east:lon+180/zoom,south:lat-90/zoom,north:lat+90/zoom});
}

function traceRing(context, ring, width, height, projection) {
  let started = false;
  for (const coordinate of ring) {
    const point = projectCoordinate(coordinate, width, height, projection);
    if (!point) { started = false; continue; }
    if (!started) { context.moveTo(point.x, point.y); started = true; }
    else context.lineTo(point.x, point.y);
  }
  if (started) context.closePath();
}

function traceGeometry(context, geometry, width, height, projection) {
  if (!geometry) return false;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!polygons.length) return false;
  for (const polygon of polygons) for (const ring of polygon) traceRing(context, ring, width, height, projection);
  return true;
}

function drawPolygonLayer(context, collection, width, height, projection, fill, stroke, lineWidth, alpha = 1, features = collection?.features) {
  if (!collection?.features) return 0;
  let drawn = 0;
  context.save();
  context.globalAlpha = alpha;
  for (const feature of features ?? []) {
    if (!feature?.geometry) continue;
    context.beginPath();
    if (!traceGeometry(context, feature.geometry, width, height, projection)) continue;
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.fill("evenodd");
    context.stroke();
    drawn++;
  }
  context.restore();
  return drawn;
}

function drawLineLayer(context, collection, width, height, projection, color, lineWidth, features = collection?.features) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of features ?? []) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    for (const line of lines) {
      context.beginPath();
      let started = false;
      for (const coordinate of line) {
        const point = projectCoordinate(coordinate, width, height, projection);
        if (!point) { started = false; continue; }
        if (!started) { context.moveTo(point.x, point.y); started = true; }
        else context.lineTo(point.x, point.y);
      }
      if (started) {
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
        drawn++;
      }
    }
  }
  return drawn;
}

function drawLandHachures(context, collection, width, height, projection, color, features = collection?.features) {
  if (!collection?.features || typeof context.clip !== "function") return;
  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = color;
  context.lineWidth = 0.45;
  for (const feature of features ?? []) {
    if (!feature?.geometry) continue;
    context.save();
    context.beginPath();
    if (traceGeometry(context, feature.geometry, width, height, projection)) {
      context.clip("evenodd");
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

function drawElevationPoints(context, collection, width, height, projection, theme, features = collection?.features) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of features ?? []) {
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


function drawMapLabels(context, collection, width, height, projection, theme, zoom, features = collection?.features) {
  if (!collection?.features) return [];
  const hits = [];
  const occupied = [];
  const candidates = (features ?? [])
    .filter(feature => Number(feature.properties?.minZoom ?? 1) <= zoom)
    .sort((a, b) => {
      const rank = kind => kind === "continent" ? 0 : kind === "ocean" ? 1 : 2;
      return rank(a.properties?.kind) - rank(b.properties?.kind);
    });
  for (const feature of candidates) {
    if (feature.geometry?.type !== "Point") continue;
    const point = projectCoordinate(feature.geometry.coordinates, width, height, projection);
    if (!point || point.x < 12 || point.x > width - 12 || point.y < 12 || point.y > height - 12) continue;
    const name = String(feature.properties?.name ?? "");
    if (!name) continue;
    const kind = feature.properties?.kind ?? "place";
    const fontSize = kind === "continent" ? 13 : kind === "ocean" ? 10 : 10;
    context.save();
    context.font = kind === "city" ? "600 10px Arial, sans-serif" : `italic 600 ${fontSize}px Georgia, serif`;
    const textWidth = context.measureText(name).width;
    const x = point.x - textWidth / 2;
    const y = point.y + (kind === "city" ? 3 : 0);
    const box = { left: x - 4, right: x + textWidth + 4, top: y - fontSize - 3, bottom: y + 4 };
    const collides = occupied.some(other => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom));
    if (collides) { context.restore(); continue; }
    occupied.push(box);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineWidth = kind === "city" ? 2.8 : 3.4;
    context.strokeStyle = theme.colors.ocean;
    context.fillStyle = kind === "ocean" ? "#a9c6cf" : kind === "city" ? theme.colors.text : theme.colors.text;
    context.globalAlpha = kind === "city" ? 0.92 : 0.78;
    context.strokeText(name, x, y);
    context.fillText(name, x, y);
    context.restore();
    hits.push({ name, kind, x: point.x, y: point.y, bounds: { left: x - 5, right: x + textWidth + 5, top: y - fontSize - 5, bottom: y + 6 }, coordinates: feature.geometry.coordinates });
  }
  return hits;
}



/**
 * Transforme l'image du viewport précédent pour prévisualiser le nouveau
 * cadrage sans recalculer les géométries. Les coordonnées sont en pixels CSS.
 */
export function calculateViewportTransform(previous, next, width, height) {
  const previousZoom = Math.max(0.0001, Number(previous?.zoom ?? 1));
  const nextZoom = Math.max(0.0001, Number(next?.zoom ?? 1));
  const scale = nextZoom / previousZoom;
  return {
    scale,
    translateX: width / 2 - scale * width / 2
      + ((Number(previous?.centerLongitude ?? 0) - Number(next?.centerLongitude ?? 0)) * nextZoom * width / 360),
    translateY: height / 2 - scale * height / 2
      + ((Number(next?.centerLatitude ?? 0) - Number(previous?.centerLatitude ?? 0)) * nextZoom * height / 180)
  };
}


/**
 * À zoom monde, l'équirectangulaire est périodique en longitude :
 * les copies latérales prolongent le bitmap sans recalculer les côtes.
 */
export function getViewportPreviewWrapCopies(previous, next) {
  const atWorldScale = viewport => Math.abs(Number(viewport?.zoom ?? 1) - 1) < 1e-6;
  return atWorldScale(previous) && atWorldScale(next) ? [-1, 0, 1] : [0];
}

/**
 * Détermine les bandes révélées par une translation pure du viewport.
 * Les rectangles sont en pixels CSS et ne se chevauchent pas.
 * Un zoom, un grand déplacement ou un changement de monde impose un rendu complet.
 */
export function calculateExposedRegions(previous, next, width, height) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  const transform = calculateViewportTransform(previous, next, width, height);
  const longitudeDelta = Math.abs(Number(next?.centerLongitude ?? 0) - Number(previous?.centerLongitude ?? 0));
  if (Math.abs(transform.scale - 1) > 1e-6 || longitudeDelta >= 180) return null;
  const dx = Math.round(transform.translateX);
  const dy = Math.round(transform.translateY);
  if (Math.abs(dx) >= width || Math.abs(dy) >= height) return null;
  if (dx === 0 && dy === 0) return [];
  const regions = [];
  if (dx > 0) regions.push({ x: 0, y: 0, width: dx, height });
  if (dx < 0) regions.push({ x: width + dx, y: 0, width: -dx, height });
  const remainingX = dx > 0 ? dx : 0;
  const remainingWidth = width - Math.abs(dx);
  if (dy > 0 && remainingWidth > 0) regions.push({ x: remainingX, y: 0, width: remainingWidth, height: dy });
  if (dy < 0 && remainingWidth > 0) regions.push({ x: remainingX, y: height + dy, width: remainingWidth, height: -dy });
  return regions;
}

export function getTerrainTransitionOpacity(progress) {
  return Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 1));
}

const layerCaches = { physical: new Map(), political: new Map() };
let lastPhysicalFrame = null;
let zoomTransitionFrame = null;
let lastPoliticalFrame = null;
const objectIds = new WeakMap();
let nextObjectId = 1;

function objectId(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return String(value);
  if (!objectIds.has(value)) objectIds.set(value, nextObjectId++);
  return objectIds.get(value);
}

function createLayerSurface(width, height) {
  let surface = null;
  if (typeof OffscreenCanvas !== "undefined") surface = new OffscreenCanvas(width, height);
  else if (typeof document !== "undefined") {
    surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
  }
  if (!surface) return null;
  const context = surface.getContext("2d");
  return context ? { surface, context } : null;
}

function getCachedLayer(kind, key, width, height, draw) {
  const cache = layerCaches[kind];
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return { ...existing, hit: true };
  }
  const layer = createLayerSurface(width, height);
  if (!layer) return null;
  layer.context.clearRect?.(0, 0, width, height);
  const metadata = draw(layer.context);
  const cachedLayer = { ...layer, metadata };
  cache.set(key, cachedLayer);
  while (cache.size > 3) cache.delete(cache.keys().next().value);
  return { ...cachedLayer, hit: false };
}

function viewportKey(viewport) {
  return [viewport.zoom ?? 1, viewport.centerLongitude ?? 0, viewport.centerLatitude ?? 0].join(",");
}

function featuresInScreenRect(collection, rect, width, height, projection) {
  if (!collection?.features) return [];
  if (projection.type !== "equirectangular") return collection.features;
  const v = projection.viewport ?? {}, zoom = Math.max(1, Number(v.zoom ?? 1));
  const westRaw = Number(v.centerLongitude ?? 0) - 180 / zoom + rect.x / width * 360 / zoom;
  const span = rect.width / width * 360 / zoom;
  const west = ((westRaw + 180) % 360 + 360) % 360 - 180;
  const north = Number(v.centerLatitude ?? 0) + 90 / zoom - rect.y / height * 180 / zoom;
  const south = north - rect.height / height * 180 / zoom;
  let index = spatialIndexes.get(collection);
  if (!index) { index = createGeoFeatureIndex(collection); spatialIndexes.set(collection, index); }
  return index.query({ west, east: west + span, south, north });
}

function drawPoliticalLayers(context, width, height, projection, theme, featureCollection, options, dirtyRect = null) {
  if (dirtyRect && context.rect && context.clip) {
    context.save();
    context.beginPath();
    context.rect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);
    context.clip();
  }
  context.save();
  context.strokeStyle = theme.colors.grid;
  context.globalAlpha = 0.28;
  context.lineWidth = 0.55;
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

  const landFill = options.terrainEnabled ? "rgba(255,255,255,0.055)" : theme.colors.land;
  const select = collection => dirtyRect ? featuresInScreenRect(collection, dirtyRect, width, height, projection) : visibleFeatures(collection, projection);
  const landFeatures = select(featureCollection), glacierFeatures = select(options.glaciers);
  const lakeFeatures = select(options.lakes), riverFeatures = select(options.rivers);
  const elevationFeatures = select(options.elevationPoints);
  const landCount = drawPolygonLayer(context, featureCollection, width, height, projection, landFill, theme.colors.coast, 0.85, 1, landFeatures);
  if (["parchment", "paper"].includes(theme.texture)) drawLandHachures(context, featureCollection, width, height, projection, theme.colors.coast, landFeatures);
  const glacierCount = drawPolygonLayer(context, options.glaciers, width, height, projection, "#dce8e5", "#9ebfc3", 0.7, 0.88, glacierFeatures);
  const lakeCount = drawPolygonLayer(context, options.lakes, width, height, projection, theme.colors.ocean, theme.colors.accent, 0.55, 1, lakeFeatures);
  const riverCount = drawLineLayer(context, options.rivers, width, height, projection, theme.colors.accent, 0.7, riverFeatures);
  const elevationPointCount = drawElevationPoints(context, options.elevationPoints, width, height, projection, theme, elevationFeatures);
  if (dirtyRect && context.rect && context.clip) context.restore();
  return { landCount, glacierCount, lakeCount, riverCount, elevationPointCount };
}

function drawPhysicalTerrain(context, width, height, terrain, viewport, webglGrid = null) {
  if (webglGrid && typeof context.drawImage === "function") {
    try {
      const surface = renderTerrainWebGL(webglGrid, width, height, viewport);
      if (surface) {
        context.drawImage(surface, 0, 0, width, height);
        return "webgl";
      }
    } catch {
      // En cas d'échec GPU, conserver le rendu Canvas 2D.
    }
  }
  drawTerrainRaster(context, width, height, terrain, viewport);
  return "canvas2d";
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function renderWorldMap(canvas, featureCollection, options = {}) {
  const frameStartedAt = performanceNow();
  if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("Canvas cartographique requis.");
  if (!featureCollection || featureCollection.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
    throw new TypeError("Une FeatureCollection GeoJSON est requise.");
  }
  const width = Math.max(1, options.width ?? canvas.clientWidth ?? 960);
  const height = Math.max(1, options.height ?? Math.round(width * 0.52));
  const pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contexte Canvas 2D indisponible.");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const year = options.year ?? 1444;
  const theme = getCartographicTheme(year, options.technologyLevel ?? 0);
  const projection = { type: options.projection ?? "equirectangular", viewport: options.viewport ?? {} };


  context.fillStyle = theme.colors.ocean;
  context.fillRect(0, 0, width, height);

  const terrainStartedAt = performanceNow();
  const terrainEnabled = projection.type === "equirectangular" && Boolean(options.terrain?.values || options.terrain?.sampleBilinear);
  const webglTerrainGrid = options.terrainWebGLGrid?.values ? options.terrainWebGLGrid : null;
  let terrainRenderer = "canvas2d";
  let terrainWebGLStats = null;
  const viewKey = viewportKey(projection.viewport);
  const physicalKey = [objectId(options.terrain), options.terrain?.revision ?? 0, width, height, pixelRatio, viewKey].join("|");
  let physicalHit = false;
  if (terrainEnabled && typeof context.drawImage === "function") {
    const physicalSurface = createLayerSurface(canvas.width, canvas.height);
    if (physicalSurface) {
      const previous = lastPhysicalFrame;
      const currentZoom = Number(projection.viewport.zoom ?? 1);
      if (previous && previous.terrain === options.terrain
        && previous.width === canvas.width && previous.height === canvas.height
        && previous.pixelRatio === pixelRatio
        && currentZoom !== Number(previous.viewport.zoom ?? 1)) {
        zoomTransitionFrame = previous;
      }
      let dirtyRegions = null;
      if (!webglTerrainGrid && previous
        && previous.terrain === options.terrain
        && previous.revision === (options.terrain?.revision ?? 0)
        && previous.width === canvas.width && previous.height === canvas.height
        && previous.pixelRatio === pixelRatio
        && Number(projection.viewport.zoom ?? 1) > 1
        && Number(projection.viewport.zoom ?? 1) === Number(previous.viewport.zoom ?? 1)) {
        dirtyRegions = calculateExposedRegions(previous.viewport, projection.viewport, width, height);
        const dirtyArea = dirtyRegions?.reduce((sum, rect) => sum + rect.width * rect.height, 0) ?? Infinity;
        if (dirtyRegions === null || dirtyArea <= 0 || dirtyArea > width * height * 0.45) dirtyRegions = null;
      }
      let incremental = false;
      if (dirtyRegions?.length && previous?.surface) {
        const transform = calculateViewportTransform(previous.viewport, projection.viewport, width, height);
        physicalSurface.context.drawImage(previous.surface, transform.translateX * pixelRatio, transform.translateY * pixelRatio);
        for (const rect of dirtyRegions) {
          drawTerrainRaster(physicalSurface.context, canvas.width, canvas.height, options.terrain,
            projection.viewport, { x: rect.x * pixelRatio, y: rect.y * pixelRatio,
              width: rect.width * pixelRatio, height: rect.height * pixelRatio });
        }
        incremental = true;
      } else {
        terrainRenderer = drawPhysicalTerrain(physicalSurface.context, canvas.width, canvas.height,
          options.terrain, projection.viewport, webglTerrainGrid);
      }
      lastPhysicalFrame = { surface: physicalSurface.surface, terrain: options.terrain,
        revision: options.terrain?.revision ?? 0, width: canvas.width, height: canvas.height,
        pixelRatio, viewport: { ...projection.viewport } };
      const transitionProgress = getTerrainTransitionOpacity(options.terrainTransitionProgress);
      const transitionSource = zoomTransitionFrame
        && zoomTransitionFrame.terrain === options.terrain
        && zoomTransitionFrame.width === canvas.width && zoomTransitionFrame.height === canvas.height
        && zoomTransitionFrame.pixelRatio === pixelRatio
        ? zoomTransitionFrame : null;
      if (transitionSource && transitionProgress < 1) {
        const transform = calculateViewportTransform(transitionSource.viewport, projection.viewport, width, height);
        context.save();
        context.setTransform(transform.scale, 0, 0, transform.scale,
          transform.translateX * pixelRatio, transform.translateY * pixelRatio);
        context.globalAlpha = 1 - transitionProgress;
        context.drawImage(transitionSource.surface, 0, 0);
        context.restore();
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = transitionProgress;
        context.drawImage(physicalSurface.surface, 0, 0);
        context.restore();
      } else {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(physicalSurface.surface, 0, 0);
        context.restore();
        if (transitionProgress >= 1) zoomTransitionFrame = null;
      }
      physicalHit = incremental;
    } else {
      lastPhysicalFrame = null;
      terrainRenderer = drawPhysicalTerrain(context, canvas.width, canvas.height,
        options.terrain, projection.viewport, webglTerrainGrid);
    }
  } else if (terrainEnabled) {
    lastPhysicalFrame = null;
    terrainRenderer = drawPhysicalTerrain(context, canvas.width, canvas.height,
      options.terrain, projection.viewport, webglTerrainGrid);
  } else {
    lastPhysicalFrame = null;
  }

  const terrainMs = performanceNow() - terrainStartedAt;
  const politicalStartedAt = performanceNow();
  let politicalIncremental = false;
  let layerCounts;
  if (typeof context.drawImage === "function") {
    const surface = createLayerSurface(canvas.width, canvas.height);
    if (surface) {
      const dataKey = [objectId(featureCollection), objectId(options.glaciers), objectId(options.lakes),
        objectId(options.rivers), objectId(options.elevationPoints)].join("|");
      const themeKey = [theme.id, theme.texture, JSON.stringify(theme.colors), terrainEnabled, projection.type].join("|");
      const previous = lastPoliticalFrame;
      let dirtyRegions = null;
      if (previous && previous.dataKey === dataKey && previous.themeKey === themeKey
        && previous.width === canvas.width && previous.height === canvas.height
        && previous.pixelRatio === pixelRatio
        && Number(previous.viewport.zoom ?? 1) === Number(projection.viewport.zoom ?? 1)
        && projection.type === "equirectangular" && Number(projection.viewport.zoom ?? 1) > 1) {
        dirtyRegions = calculateExposedRegions(previous.viewport, projection.viewport, width, height);
        const area = dirtyRegions?.reduce((sum, rect) => sum + rect.width * rect.height, 0) ?? Infinity;
        if (dirtyRegions === null || area <= 0 || area > width * height * 0.45) dirtyRegions = null;
      }
      if (dirtyRegions?.length && previous?.surface) {
        const transform = calculateViewportTransform(previous.viewport, projection.viewport, width, height);
        surface.context.drawImage(previous.surface, transform.translateX * pixelRatio, transform.translateY * pixelRatio);
        layerCounts = previous.metadata;
        for (const rect of dirtyRegions) {
          surface.context.save();
          surface.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          drawPoliticalLayers(surface.context, width, height, projection, theme, featureCollection,
            { ...options, terrainEnabled }, rect);
          surface.context.restore();
        }
        politicalIncremental = true;
      } else {
        surface.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        layerCounts = drawPoliticalLayers(surface.context, width, height, projection, theme, featureCollection,
          { ...options, terrainEnabled });
      }
      lastPoliticalFrame = { surface: surface.surface, metadata: layerCounts, dataKey, themeKey,
        width: canvas.width, height: canvas.height, pixelRatio, viewport: { ...projection.viewport } };
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(surface.surface, 0, 0);
      context.restore();
    } else {
      lastPoliticalFrame = null;
      layerCounts = drawPoliticalLayers(context, width, height, projection, theme, featureCollection, { ...options, terrainEnabled });
    }
  } else {
    lastPoliticalFrame = null;
    layerCounts = drawPoliticalLayers(context, width, height, projection, theme, featureCollection, { ...options, terrainEnabled });
  }

  const politicalMs = performanceNow() - politicalStartedAt;
  const labelsStartedAt = performanceNow();
  const labelHits = drawMapLabels(context, options.labels, width, height, projection, theme, projection.viewport.zoom ?? 1);
  const labelsMs = performanceNow() - labelsStartedAt;
  const dynamicStartedAt = performanceNow();
  let dynamicLayerCount = 0;
  for (const drawDynamic of options.dynamicLayers ?? []) {
    if (typeof drawDynamic !== "function") continue;
    drawDynamic(context, { width, height, projection, theme, viewport: projection.viewport });
    dynamicLayerCount++;
  }
  const dynamicMs = performanceNow() - dynamicStartedAt;
  const totalMs = performanceNow() - frameStartedAt;
  const { landCount, lakeCount, riverCount, glacierCount, elevationPointCount } = layerCounts;


  return {
    performance: { totalMs, terrainMs, politicalMs, labelsMs, dynamicMs },
    terrainWebGLStats: terrainRenderer === "webgl" ? getTerrainWebGLStats(webglTerrainGrid) : null,
    theme, projection: projection.type, viewport: { ...projection.viewport }, featureCount: featureCollection.features.length,
    landCount, lakeCount, riverCount, glacierCount, elevationPointCount, labelHits, terrainEnabled, terrainRenderer, physicalCacheHit: false, physicalIncremental: physicalHit, politicalCacheHit: false, politicalIncremental, dynamicLayerCount, width, height
  };
}
