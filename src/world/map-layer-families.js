/**
 * Les trois familles ont des cycles de vie distincts :
 * - physical : socle géographique et relief ;
 * - political : frontières, territoires et annotations historiques ;
 * - dynamic : géographie altérée par la simulation et ses effets.
 *
 * Les collections restent partagées par référence : aucun GeoJSON n'est copié.
 */
export function createMapLayerFamilies(layers = {}) {
  return {
    physical: {
      land: layers.land ?? null,
      lakes: layers.lakes ?? null,
      rivers: layers.rivers ?? null,
      glaciers: layers.glaciers ?? null,
      elevationPoints: layers.elevationPoints ?? null,
      terrain: layers.terrain ?? null
    },
    political: {
      labels: layers.labels ?? null,
      territories: layers.territories ?? null,
      politicalBoundaries: layers.politicalBoundaries ?? null,
      administrativeBoundaries: layers.administrativeBoundaries ?? null
    },
    dynamic: {
      physicalWorld: layers.physicalWorld ?? null
    }
  };
}

const MAP_LAYER_FAMILY_KEYS = Object.freeze({
  physical: Object.freeze(["land", "lakes", "rivers", "glaciers", "elevationPoints", "terrain"]),
  political: Object.freeze(["labels", "territories", "politicalBoundaries", "administrativeBoundaries"]),
  dynamic: Object.freeze(["physicalWorld"])
});
const MAP_LAYER_FAMILY_ORDER = Object.freeze(["physical", "political", "dynamic"]);

export function getChangedMapLayerFamilies(previous = {}, next = {}) {
  const changed = [];
  for (const family of MAP_LAYER_FAMILY_ORDER) {
    const before = previous[family] ?? {};
    const after = next[family] ?? {};
    for (const key of MAP_LAYER_FAMILY_KEYS[family]) {
      if (before[key] !== after[key]) {
        changed.push(family);
        break;
      }
    }
  }
  return changed;
}
