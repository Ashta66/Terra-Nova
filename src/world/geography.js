// Physical geography is deliberately independent from political ownership.
// Geometry uses GeoJSON-like Polygon/MultiPolygon coordinates in lon/lat.
export function cloneData(value) { return structuredClone(value); }
export function createGeography(baseRegions = []) {
  const base = cloneData(baseRegions);
  return { baseRegions: base, currentRegions: cloneData(base), revision: 0, history: [] };
}
function assertRegion(region) {
  if (!region || typeof region.id !== "string" || !region.id.trim()) throw new TypeError("Identifiant de région requis.");
  if (!region.geometry || !["Polygon", "MultiPolygon"].includes(region.geometry.type) || !Array.isArray(region.geometry.coordinates)) throw new TypeError("Géométrie Polygon ou MultiPolygon requise.");
}
export function validateGeography(geography) {
  if (!geography || !Array.isArray(geography.baseRegions) || !Array.isArray(geography.currentRegions)) throw new TypeError("Structure géographique invalide.");
  const ids = new Set();
  for (const region of geography.currentRegions) { assertRegion(region); if (ids.has(region.id)) throw new Error("Identifiant géographique dupliqué : " + region.id); ids.add(region.id); }
  return true;
}
export function applyGeographyChange(geography, change, metadata = {}) {
  validateGeography(geography);
  const next = cloneData(geography);
  const regions = next.currentRegions;
  switch (change.type) {
    case "create-region": {
      assertRegion(change.region);
      if (regions.some(r => r.id === change.region.id)) throw new Error("Cette région existe déjà.");
      regions.push(cloneData(change.region)); break;
    }
    case "reshape-region": {
      const i = regions.findIndex(r => r.id === change.regionId);
      if (i < 0) throw new Error("Région introuvable.");
      const updated = { ...regions[i], geometry: cloneData(change.geometry) }; assertRegion(updated); regions[i] = updated; break;
    }
    case "remove-region": {
      const i = regions.findIndex(r => r.id === change.regionId);
      if (i < 0) throw new Error("Région introuvable.");
      regions.splice(i, 1); break;
    }
    case "split-region": {
      const i = regions.findIndex(r => r.id === change.regionId);
      if (i < 0) throw new Error("Région à diviser introuvable.");
      if (!Array.isArray(change.regions) || change.regions.length < 2) throw new TypeError("Une division doit fournir au moins deux nouvelles régions.");
      change.regions.forEach(assertRegion);
      const newIds = new Set(change.regions.map(r => r.id));
      if (newIds.size !== change.regions.length || change.regions.some(r => regions.some(old => old.id === r.id))) throw new Error("Identifiants de division non uniques.");
      regions.splice(i, 1, ...cloneData(change.regions)); break;
    }
    case "merge-regions": {
      const ids = new Set(change.regionIds ?? []);
      if (ids.size < 2 || [...ids].some(id => !regions.some(r => r.id === id))) throw new Error("Fusion de régions invalide.");
      assertRegion(change.region);
      if (regions.some(r => r.id === change.region.id && !ids.has(r.id))) throw new Error("Identifiant de fusion déjà utilisé.");
      next.currentRegions = regions.filter(r => !ids.has(r.id));
      next.currentRegions.push(cloneData(change.region)); break;
    }
    default: throw new Error("Type de transformation géographique inconnu.");
  }
  next.revision += 1;
  next.history.push({ revision: next.revision, type: change.type, date: metadata.date ?? null, cause: metadata.cause ?? "Transformation du monde" });
  validateGeography(next);
  return next;
}