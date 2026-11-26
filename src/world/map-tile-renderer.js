export const MAP_PHYSICAL_TILE_WIDTH = 512;
export const MAP_PHYSICAL_TILE_HEIGHT = 256;

export function getMapTileGeographicBounds(tile) {
  if (!tile || !Number.isInteger(tile.z) || tile.z < 0) throw new TypeError("Tuile cartographique invalide.");
  const count = 2 ** tile.z;
  const longitudeSpan = 360 / count;
  const latitudeSpan = 180 / count;
  const west = -180 + tile.x * longitudeSpan;
  const north = 90 - tile.y * latitudeSpan;
  return {
    west,
    east: west + longitudeSpan,
    north,
    south: north - latitudeSpan,
    centerLongitude: west + longitudeSpan / 2,
    centerLatitude: north - latitudeSpan / 2,
    longitudeSpan,
    latitudeSpan
  };
}

/**
 * Construit les paramètres d'une tuile physique indépendante. Une tuile 2:1
 * couvre une cellule régulière de la grille équirectangulaire mondiale.
 * Les couches politiques et les événements dynamiques sont volontairement
 * absents : ils seront composés au-dessus et ne doivent pas invalider le fond.
 */
export function createPhysicalTileRenderOptions(tile, layers = {}) {
  const bounds = getMapTileGeographicBounds(tile);
  const count = 2 ** tile.z;
  const lodZoom = Math.max(1, count / 4);
  return {
    width: MAP_PHYSICAL_TILE_WIDTH,
    height: MAP_PHYSICAL_TILE_HEIGHT,
    pixelRatio: 1,
    projection: "equirectangular",
    viewport: {
      zoom: count,
      centerLongitude: bounds.centerLongitude,
      centerLatitude: bounds.centerLatitude,
      wrapLongitude: false
    },
    lodZoom,
    renderScale: 1,
    lakes: layers.lakes ?? null,
    rivers: layers.rivers ?? null,
    glaciers: layers.glaciers ?? null,
    elevationPoints: layers.elevationPoints ?? null,
    terrain: layers.terrain ?? null,
    terrainEnabled: Boolean(layers.terrain),
    terrainQuality: lodZoom < 2.5 ? 0.68 : 0.82,
    interactive: true
  };
}

export function getMapTileScreenRect(tile, viewport, width, height) {
  const bounds = getMapTileGeographicBounds(tile);
  const zoom = Math.max(1, Number(viewport?.zoom) || 1);
  const centerLongitude = Number(viewport?.centerLongitude) || 0;
  const centerLatitude = Number(viewport?.centerLatitude) || 0;
  const tileWidth = width * zoom / (2 ** tile.z);
  const tileHeight = height * zoom / (2 ** tile.z);
  const baseX = width / 2 + ((bounds.west - centerLongitude) / 360) * width * zoom;
  const y = height / 2 - ((bounds.north - centerLatitude) / 180) * height * zoom;
  return { x: baseX, y, width: tileWidth, height: tileHeight };
}

/**
 * Retourne la pile des tuiles déjà disponibles, ancêtres compris.
 * Les parents sont dessinés avant les enfants afin que le détail remplace
 * progressivement le niveau de zoom précédent sans trou de couverture.
 */
export function collectMapTileRenderStack(plan, hasTile) {
  if (!Array.isArray(plan?.tiles) || typeof hasTile !== "function") return [];
  const stack = new Map();
  for (const requested of plan.tiles) {
    const ancestors = requested.ancestors ?? [];
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const parent = ancestors[i];
      if (hasTile(parent.key)) stack.set(parent.key, { ...parent, fallback: true, ancestors });
    }
    if (hasTile(requested.key)) stack.set(requested.key, { ...requested, fallback: false });
  }
  return [...stack.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}
