const TILE_DEGREES = 10;
const TILE_COLUMNS = 360 / TILE_DEGREES;
const TILE_ROWS = 180 / TILE_DEGREES;
export function geoTileKey(longitude, latitude) {
  const lon = Math.max(-180, Math.min(180 - Number.EPSILON, Number(longitude)));
  const lat = Math.max(-90, Math.min(90 - Number.EPSILON, Number(latitude)));
  return Math.floor((lon + 180) / TILE_DEGREES) + ":" + Math.floor((lat + 90) / TILE_DEGREES);
}
export function invalidateGeoTiles(previousRevisions = {}, cells = [], halo = 1) {
  const revisions = { ...previousRevisions }, changed = new Set();
  const margin = Math.max(0, Math.min(2, Math.floor(Number(halo) || 0)));
  for (const cell of cells) {
    if (!Number.isFinite(Number(cell?.longitude)) || !Number.isFinite(Number(cell?.latitude))) continue;
    const x = Math.floor((Math.max(-180, Math.min(180 - Number.EPSILON, Number(cell.longitude))) + 180) / TILE_DEGREES);
    const y = Math.floor((Math.max(-90, Math.min(90 - Number.EPSILON, Number(cell.latitude))) + 90) / TILE_DEGREES);
    for (let dy = -margin; dy <= margin; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= TILE_ROWS) continue;
      for (let dx = -margin; dx <= margin; dx++) changed.add(((x + dx + TILE_COLUMNS) % TILE_COLUMNS) + ":" + ty);
    }
  }
  const invalidatedTileKeys = [...changed].sort((a,b) => { const [ax,ay]=a.split(":").map(Number),[bx,by]=b.split(":").map(Number); return ay-by || ax-bx; });
  for (const key of invalidatedTileKeys) revisions[key] = (revisions[key] ?? 0) + 1;
  return { revisions, invalidatedTileKeys };
}
export function getGeoTileRevision(revisions, key) { return Number(revisions?.[key] ?? 0); }
