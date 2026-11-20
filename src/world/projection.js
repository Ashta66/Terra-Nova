const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function projectEquirectangular(longitude, latitude, width, height, viewport = {}) {
  const zoom = clamp(Number(viewport.zoom ?? 1), 1, 20);
  const centerLongitude = Number(viewport.centerLongitude ?? 0);
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
  const zoom = clamp(Number(viewport.zoom ?? 1), 1, maxZoom);
  const centerLongitude = zoom <= 1.001 ? 0 : Number(viewport.centerLongitude ?? 0);
  const maxLatitude = Math.max(0, 90 - 90 / zoom);
  return {
    ...viewport,
    zoom,
    centerLongitude: Number.isFinite(centerLongitude) ? centerLongitude : 0,
    centerLatitude: clamp(Number(viewport.centerLatitude ?? 0), -maxLatitude, maxLatitude)
  };
}
