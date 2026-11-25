/** Garde-fous pour les résultats asynchrones des couches cartographiques. */
export function isMapTileRelevantToPlan(tileKey, plan) {
  if (typeof tileKey !== "string" || !tileKey || !Array.isArray(plan?.tiles)) return false;
  for (const tile of plan.tiles) {
    if (tile?.key === tileKey || tile?.ancestors?.some(parent => parent?.key === tileKey)) return true;
  }
  return false;
}

export function shouldRefreshRegionalLayer(layer, profile) {
  if (!profile || typeof profile !== "object") return false;
  if (layer === "land") return profile.land === true;
  if (layer === "rivers") return profile.rivers === true;
  if (layer === "labels") return profile.labels === true;
  return false;
}

export function isMapYearRequestCurrent(requestedYear, currentYear) {
  const requested = String(requestedYear ?? "").trim();
  const current = String(currentYear ?? "").trim();
  return Boolean(requested && current && requested === current);
}
