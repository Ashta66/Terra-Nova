const TILE_DEGREES = 10;
const TILE_COLUMNS = 360 / TILE_DEGREES;
const TILE_ROWS = 180 / TILE_DEGREES;
export function geoTileKey(longitude, latitude) {
  const lon = Math.max(-180, Math.min(180 - Number.EPSILON, Number(longitude)));
  const lat = Math.max(-90, Math.min(90 - Number.EPSILON, Number(latitude)));
  return Math.floor((lon + 180) / TILE_DEGREES) + ":" + Math.floor((lat + 90) / TILE_DEGREES);
}
export function invalidateGeoTiles(previousRevisions = {}, cells = [], halo = 1) {
  const revisions = { ...previousRevisions };
  const changed = new Uint8Array(TILE_COLUMNS * TILE_ROWS);
  const margin = Math.max(0, Math.min(2, Math.floor(Number(halo) || 0)));
  for (const cell of cells) {
    const longitude = Number(cell?.longitude);
    const latitude = Number(cell?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const x = Math.floor((Math.max(-180, Math.min(180 - Number.EPSILON, longitude)) + 180) / TILE_DEGREES);
    const y = Math.floor((Math.max(-90, Math.min(90 - Number.EPSILON, latitude)) + 90) / TILE_DEGREES);
    for (let dy = -margin; dy <= margin; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= TILE_ROWS) continue;
      for (let dx = -margin; dx <= margin; dx++) {
        const tx = (x + dx + TILE_COLUMNS) % TILE_COLUMNS;
        changed[ty * TILE_COLUMNS + tx] = 1;
      }
    }
  }
  let changedCount = 0;
  for (let index = 0; index < changed.length; index++) changedCount += changed[index];
  const invalidatedTileKeys = new Array(changedCount);
  let write = 0;
  // Le parcours linéaire produit directement l'ordre ligne/colonne attendu,
  // sans Set, copie d'indices ni tri de la zone invalidée.
  for (let tileIndex = 0; tileIndex < changed.length; tileIndex++) {
    if (!changed[tileIndex]) continue;
    const key = (tileIndex % TILE_COLUMNS) + ":" + Math.floor(tileIndex / TILE_COLUMNS);
    invalidatedTileKeys[write++] = key;
    revisions[key] = (revisions[key] ?? 0) + 1;
  }
  return { revisions, invalidatedTileKeys };
}
export function getGeoTileRevision(revisions, key) { return Number(revisions?.[key] ?? 0); }
