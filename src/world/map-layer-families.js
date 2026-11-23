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

export function getChangedMapLayerFamilies(previous = {}, next = {}) {
  const changed = [];
  for (const family of Object.keys(next)) {
    const before = previous[family] ?? {};
    const after = next[family] ?? {};
    for (const key of Object.keys(before)) {
      if (before[key] !== after[key]) {
        changed.push(family);
        break;
      }
    }
    if (changed[changed.length - 1] === family) continue;
    for (const key of Object.keys(after)) {
      if (!Object.hasOwn(before, key)) {
        changed.push(family);
        break;
      }
    }
  }
  return changed;
}
