import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";
import { drawTerrainRaster } from "./terrain.js";

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

function drawPolygonLayer(context, collection, width, height, projection, fill, stroke, lineWidth, alpha = 1) {
  if (!collection?.features) return 0;
  let drawn = 0;
  context.save();
  context.globalAlpha = alpha;
  for (const feature of collection.features) {
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

function drawLineLayer(context, collection, width, height, projection, color, lineWidth) {
  if (!collection?.features) return 0;
  let drawn = 0;
  for (const feature of collection.features) {
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

function drawLandHachures(context, collection, width, height, projection, color) {
  if (!collection?.features || typeof context.clip !== "function") return;
  context.save();
  context.globalAlpha = 0.12;
  context.strokeStyle = color;
  context.lineWidth = 0.45;
  for (const feature of collection.features) {
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


function drawMapLabels(context, collection, width, height, projection, theme, zoom) {
  if (!collection?.features) return [];
  const hits = [];
  const occupied = [];
  const candidates = collection.features
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

export function renderWorldMap(canvas, featureCollection, options = {}) {
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
  // Le raster actuel est géoréférencé en équirectangulaire ; ne pas l’afficher sous une autre projection.
  const terrainEnabled = projection.type === "equirectangular"
    && drawTerrainRaster(context, width, height, options.terrain, projection.viewport, options.terrainQuality ?? 1);

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

  const landFill = terrainEnabled ? "rgba(255,255,255,0.055)" : theme.colors.land;
  const landCount = drawPolygonLayer(context, featureCollection, width, height, projection, landFill, theme.colors.coast, 0.85);
  if (!options.interactive && ["parchment", "paper"].includes(theme.texture)) drawLandHachures(context, featureCollection, width, height, projection, theme.colors.coast);
  const glacierCount = drawPolygonLayer(context, options.glaciers, width, height, projection, "#dce8e5", "#9ebfc3", 0.7, 0.88);
  const lakeCount = drawPolygonLayer(context, options.lakes, width, height, projection, theme.colors.ocean, theme.colors.accent, 0.55);
  const riverCount = drawLineLayer(context, options.rivers, width, height, projection, theme.colors.accent, 0.7);
  const elevationPointCount = options.interactive ? 0 : drawElevationPoints(context, options.elevationPoints, width, height, projection, theme);
  const labelHits = options.interactive ? [] : drawMapLabels(context, options.labels, width, height, projection, theme, projection.viewport.zoom ?? 1);

  return {
    theme, projection: projection.type, viewport: { ...projection.viewport }, featureCount: featureCollection.features.length,
    landCount, lakeCount, riverCount, glacierCount, elevationPointCount, labelHits, terrainEnabled, width, height
  };
}
