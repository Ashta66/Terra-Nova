import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";

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

function drawPolygonLayer(context, collection, width, height, projection, fill, stroke, lineWidth) {
  if (!collection?.features) return 0;
  let drawn = 0;
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
  const projection = options.projection ?? "equirectangular";

  context.fillStyle = theme.colors.ocean;
  context.fillRect(0, 0, width, height);

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

  const landCount = drawPolygonLayer(context, featureCollection, width, height, projection, theme.colors.land, theme.colors.coast, 0.85);
  if (["parchment", "paper"].includes(theme.texture)) drawLandHachures(context, featureCollection, width, height, projection, theme.colors.coast);

  const lakeCount = drawPolygonLayer(context, options.lakes, width, height, projection, theme.colors.ocean, theme.colors.accent, 0.55);
  const riverCount = drawLineLayer(context, options.rivers, width, height, projection, theme.colors.accent, 0.7);

  return {
    theme, projection, featureCount: featureCollection.features.length,
    landCount, lakeCount, riverCount, width, height
  };
}
