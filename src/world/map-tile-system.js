const MIN_TILE_ZOOM = 2;
const MAX_TILE_ZOOM = 7;
const DEFAULT_TILE_BUDGET = 64;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = value => ((value % 1) + 1) % 1;

export function getMapTileLevel(zoom = 1) {
  const level = Math.floor(Math.log2(Math.max(1, Number(zoom) || 1))) + MIN_TILE_ZOOM;
  return clamp(level, MIN_TILE_ZOOM, MAX_TILE_ZOOM);
}

export function getMapTileKey(z, x, y) {
  const level = clamp(Math.floor(Number(z) || 0), 0, MAX_TILE_ZOOM);
  const count = 2 ** level;
  const column = ((Math.floor(Number(x) || 0) % count) + count) % count;
  const row = clamp(Math.floor(Number(y) || 0), 0, count - 1);
  return level + "/" + column + "/" + row;
}

export function getMapTileAncestors(tile) {
  if (!tile || !Number.isInteger(tile.z) || tile.z < 1) return [];
  const ancestors = [];
  for (let z = tile.z - 1; z >= 0; z--) {
    const divisor = 2 ** (tile.z - z);
    const x = Math.floor(tile.x / divisor);
    const y = Math.floor(tile.y / divisor);
    ancestors.push({ z, x, y, key: getMapTileKey(z, x, y) });
  }
  return ancestors;
}

function viewportTileBounds(viewport, overscan, centerLon, centerLat) {
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  const halfLon = Math.min(180, 180 / zoom * overscan);
  const halfLat = Math.min(90, 90 / zoom * overscan);
  return {
    west: (centerLon - halfLon + 180) / 360,
    east: (centerLon + halfLon + 180) / 360,
    north: (90 - Math.min(90, centerLat + halfLat)) / 180,
    south: (90 - Math.max(-90, centerLat - halfLat)) / 180
  };
}

/**
 * Planificateur de tuiles équirectangulaires. Le niveau suit le zoom par
 * puissances de deux ; les coordonnées restent stables entre les vues.
 * Les tuiles parentes sont listées pour afficher un aperçu tant que les
 * enfants détaillés ne sont pas disponibles.
 */
export function getMapTilePyramidPlan(viewport = {}, options = {}) {
  const zoom = Math.max(1, Number(viewport.zoom) || 1);
  const z = getMapTileLevel(zoom);
  const count = 2 ** z;
  const overscan = clamp(Number(options.overscan) || 1.5, 1, 2.5);
  const maxTiles = clamp(Math.floor(Number(options.maxTiles) || DEFAULT_TILE_BUDGET), 1, 256);
  const centerLongitude = Number(viewport.centerLongitude) || 0;
  const centerLatitude = clamp(Number(viewport.centerLatitude) || 0, -90, 90);
  const bounds = viewportTileBounds(viewport, overscan, centerLongitude, centerLatitude);
  const xStart = Math.floor(bounds.west * count);
  const xEnd = Math.floor(bounds.east * count);
  const yStart = clamp(Math.floor(bounds.north * count), 0, count - 1);
  const yEnd = clamp(Math.floor(bounds.south * count), 0, count - 1);
  const centerX = wrap((centerLongitude + 180) / 360) * count;
  const centerY = ((90 - centerLatitude) / 180) * count;
  const previous = options.previousViewport;
  let dx = previous ? centerLongitude - Number(previous.centerLongitude) : 0;
  if (dx > 180) dx -= 360;
  if (dx < -180) dx += 360;
  const dy = previous ? Number(previous.centerLatitude) - centerLatitude : 0;
  const magnitude = Math.hypot(dx, dy) || 1;
  const nx = dx / magnitude, ny = dy / magnitude;
  const candidates = [];
  const seen = new Uint8Array(count * count);
  for (let rawX = xStart; rawX <= xEnd; rawX++) {
    const x = ((rawX % count) + count) % count;
    for (let y = yStart; y <= yEnd; y++) {
      const tileIndex = y * count + x;
      if (seen[tileIndex]) continue;
      seen[tileIndex] = 1;
      const key = getMapTileKey(z, x, y);
      const ox = rawX + 0.5 - centerX;
      const oy = y + 0.5 - centerY;
      const distance = Math.hypot(ox, oy);
      const forward = ox * nx + oy * ny;
      candidates.push({ z, x, y, key, priority: distance - forward * 0.65 });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const candidateCount = candidates.length;
  const tileCount = Math.min(candidateCount, maxTiles);
  const tiles = new Array(tileCount);
  for (let index = 0; index < tileCount; index++) {
    const candidate = candidates[index];
    tiles[index] = {
      z: candidate.z,
      x: candidate.x,
      y: candidate.y,
      key: candidate.key,
      ancestors: getMapTileAncestors(candidate)
    };
  }
  const zoomLog2 = Math.log2(zoom);
  return {
    zoom,
    z,
    nextZ: Math.min(MAX_TILE_ZOOM, z + 1),
    previousZ: Math.max(0, z - 1),
    fractionalZoom: zoomLog2 - Math.floor(zoomLog2),
    tiles,
    requestedTileCount: candidateCount,
    truncated: candidateCount > tileCount,
    overscan
  };
}

export function findAvailableTile(tile, hasTile) {
  if (!tile || typeof hasTile !== "function") return null;
  if (hasTile(tile.key)) return { ...tile, fallback: false };
  for (const parent of tile.ancestors ?? getMapTileAncestors(tile)) {
    if (hasTile(parent.key)) return { ...parent, fallback: true, childKey: tile.key };
  }
  return null;
}
