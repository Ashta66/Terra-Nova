const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function projectEquirectangular(longitude, latitude, width, height) {
  return {
    x: ((longitude + 180) / 360) * width,
    y: ((90 - latitude) / 180) * height
  };
}

export function projectMercator(longitude, latitude, width, height) {
  const safeLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const phi = safeLatitude * DEG;
  const mercatorY = Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const worldY = clamp((1 - mercatorY / Math.PI) / 2, 0, 1);
  return {
    x: ((longitude + 180) / 360) * width,
    y: worldY * height
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
  if (projection === "mercator") return projectMercator(longitude, latitude, width, height);
  if (projection === "orthographic") return projectOrthographic(longitude, latitude, width, height, center);
  if (projection !== "equirectangular") throw new RangeError("Projection inconnue : " + projection);
  return projectEquirectangular(longitude, latitude, width, height);
}
