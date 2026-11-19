import { projectCoordinate } from "./projection.js";
import { getCartographicTheme } from "./cartographic-style.js";

function drawRing(context, ring, width, height, projection) {
  let started = false;
  for (const coordinate of ring) {
    const point = projectCoordinate(coordinate, width, height, projection);
    if (!point) { started = false; continue; }
    if (!started) { context.moveTo(point.x, point.y); started = true; }
    else context.lineTo(point.x, point.y);
  }
  if (started) context.closePath();
}

function drawGeometry(context, geometry, width, height, projection) {
  if (!geometry) return;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  for (const polygon of polygons) {
    context.beginPath();
    for (const ring of polygon) drawRing(context, ring, width, height, projection);
    context.fill("evenodd");
    context.stroke();
  }
}

export function renderWorldMap(canvas, featureCollection, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") throw new TypeError("Canvas cartographique requis.");
  if (!featureCollection || featureCollection.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
    throw new TypeError("Une FeatureCollection GeoJSON est requise.");
  }
  const width = options.width ?? canvas.clientWidth ?? 960;
  const height = options.height ?? Math.round(width * 0.52);
  const pixelRatio = Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
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

  for (const feature of featureCollection.features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    context.fillStyle = theme.colors.land;
    context.strokeStyle = theme.colors.coast;
    context.lineWidth = 0.8;
    drawGeometry(context, geometry, width, height, projection);
  }
  return { theme, projection, featureCount: featureCollection.features.length, width, height };
}
