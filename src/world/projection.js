const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function projectEquirectangular(longitude, latitude, width, height, viewport = {}) {
  const zoom = clamp(Number(viewport.zoom ?? 1), 1, 20);
  const centerLongitude = Number(source.centerLongitude ?? 0);
  const centerLatitude = clamp(Number(viewport.centerLatitude ?? 0), -85, 85);
  const wrappedLongitude = viewport.wrapLongitude === false ? longitude : (Math.abs(centerLongitude - longitude) <= 180 ? longitude : longitude + 360 * Math.round((centerLongitude - longitude) / 360));
  return {
    x: width / 2 + ((wrappedLongitude - centerLongitude) / 360) * width * zoom,
    y: height / 2 - ((latitude - centerLatitude) / 180) * height * zoom
  };
}

export function projectMercator(longitude, latitude, width, height, viewport = {}) {
  const safeLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const centerLatitude = clamp(Number(viewport.centerLatitude ?? 0), -85.05112878, 85.05112878);
  const centerLongitude = Number(viewport.centerLongitude ?? 0);
  const wrappedLongitude = viewport.wrapLongitude === false ? longitude : longitude + 360 * Math.round((centerLongitude - longitude) / 360);
  const phi = safeLatitude * DEG;
  const centerPhi = centerLatitude * DEG;
  const mercatorY = Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const centerY = Math.log(Math.tan(Math.PI / 4 + centerPhi / 2));
  const worldY = clamp((1 - mercatorY / Math.PI) / 2, 0, 1);
  const centerWorldY = clamp((1 - centerY / Math.PI) / 2, 0, 1);
  const zoom = clamp(Number(viewport.zoom ?? 1), 1, 35);
  return {
    x: width / 2 + ((wrappedLongitude - centerLongitude) / 360) * width * zoom,
    y: height / 2 + (worldY - centerWorldY) * height * zoom
  };
}

export function projectOrthographic(longitude, latitude, width, height, center = { longitude: 0, latitude: 0 }) {
  const lambda = (longitude - center.longitude) * DEG;
  const phi = latitude * DEG;
  const phi0 = center.latitude * DEG;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  if (cosc < 0) return null;
  const radius = Math.min(width, height) * 0.46;
  return {
    x: width / 2 + radius * Math.cos(phi) * Math.sin(lambda),
    y: height / 2 - radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda))
  };
}

export function projectCoordinate(coordinate, width, height, projection = "equirectangular", center) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) throw new TypeError("Coordonnée longitude/latitude invalide.");
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new TypeError("Coordonnée non numérique.");
  const type = typeof projection === "object" && projection !== null ? projection.type : projection;
  const viewport = typeof projection === "object" && projection !== null ? projection.viewport ?? {} : {};
  if (type === "mercator") return projectMercator(longitude, latitude, width, height, viewport);
  if (type === "orthographic") return projectOrthographic(longitude, latitude, width, height, center);
  if (type !== "equirectangular") throw new RangeError("Projection inconnue : " + type);
  return projectEquirectangular(longitude, latitude, width, height, viewport);
}


// La longitude est cyclique : elle peut dépasser ±180° pendant le déplacement.
// Au zoom mondial, recentrer conserve une seule vue de la planète.
export function constrainEquirectangularViewport(viewport = {}, maxZoom = 20) {
  const source = viewport && typeof viewport === "object" ? viewport : {};
  const requestedMaxZoom = Number(maxZoom);
  const safeMaxZoom = Number.isFinite(requestedMaxZoom) && requestedMaxZoom >= 1 ? requestedMaxZoom : 20;
  const requestedZoom = Number(source.zoom ?? 1);
  const zoom = clamp(Number.isFinite(requestedZoom) ? requestedZoom : 1, 1, safeMaxZoom);
  const requestedLongitude = Number(viewport.centerLongitude ?? 0);
  const requestedLatitude = Number(source.centerLatitude ?? 0);
  const centerLongitude = zoom <= 1.001 ? 0 : Number.isFinite(requestedLongitude) ? requestedLongitude : 0;
  const maxLatitude = Math.max(0, 90 - 90 / zoom);
  return {
    ...source,
    zoom,
    centerLongitude,
    centerLatitude: clamp(Number.isFinite(requestedLatitude) ? requestedLatitude : 0, -maxLatitude, maxLatitude)
  };
}

/** Zoom centré sur un point écran : la coordonnée sous le pointeur reste stable. */
export function zoomEquirectangularViewportAtPoint(viewport = {}, factor, anchorX, anchorY, width, height, maxZoom = 20) {
  const values = [factor, anchorX, anchorY, width, height].map(Number);
  if (!values.every(Number.isFinite) || values[0] <= 0 || values[3] <= 0 || values[4] <= 0) return viewport;
  const [scale, x, y, frameWidth, frameHeight] = values;
  const current = constrainEquirectangularViewport(viewport, maxZoom);
  const nextZoom = clamp(current.zoom * scale, 1, Number.isFinite(Number(maxZoom)) && Number(maxZoom) >= 1 ? Number(maxZoom) : 20);
  if (nextZoom === current.zoom) return current;
  const ratioX = x / frameWidth - 0.5;
  const ratioY = y / frameHeight - 0.5;
  const longitudeAtAnchor = current.centerLongitude + ratioX * 360 / current.zoom;
  const latitudeAtAnchor = current.centerLatitude - ratioY * 180 / current.zoom;
  return constrainEquirectangularViewport({
    ...current,
    zoom: nextZoom,
    centerLongitude: longitudeAtAnchor - ratioX * 360 / nextZoom,
    centerLatitude: latitudeAtAnchor + ratioY * 180 / nextZoom
  }, maxZoom);
}

/** Déplacement écran converti en déplacement géographique, avec garde-fous. */
export function panEquirectangularViewport(viewport = {}, deltaX, deltaY, width, height, maxZoom = 20) {
  const values = [deltaX, deltaY, width, height].map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return viewport;
  const [dx, dy, frameWidth, frameHeight] = values;
  const current = constrainEquirectangularViewport(viewport, maxZoom);
  return constrainEquirectangularViewport({
    ...current,
    centerLongitude: current.centerLongitude - dx / frameWidth * 360 / current.zoom,
    centerLatitude: current.centerLatitude + dy / frameHeight * 180 / current.zoom
  }, maxZoom);
}
