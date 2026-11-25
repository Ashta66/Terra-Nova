/**
 * Audit exacts des segments de côtes partagés entre le masque terrestre et
 * les polygones nationaux. Seuls les anneaux extérieurs sont comparés :
 * les trous et frontières administratives intérieures ne sont pas des côtes.
 *
 * Cette mesure ne modifie aucune géométrie et sert à décider si une
 * reconstruction topologique peut être faite sans déplacer les frontières.
 */
function polygonRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates ?? [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates ?? []).flat();
  return [];
}

function pointKey(point, precision) {
  if (!Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) return null;
  return Number(point[0]).toFixed(precision) + "," + Number(point[1]).toFixed(precision);
}

function edgeKey(a, b, precision) {
  const first = pointKey(a, precision), second = pointKey(b, precision);
  if (first === null || second === null || first === second) return null;
  return first < second ? first + "|" + second : second + "|" + first;
}

/**
 * Compare les segments extérieurs exacts, indépendamment de leur orientation.
 * Une différence de découpage en sommets apparaît comme un segment non apparié ;
 * elle ne doit donc pas être interprétée comme une distance géographique.
 */
export function measureSharedCoastlineEdges(landCollection, territoryCollection, precision = 5) {
  if (landCollection?.type !== "FeatureCollection" || !Array.isArray(landCollection.features)
    || territoryCollection?.type !== "FeatureCollection" || !Array.isArray(territoryCollection.features)) {
    throw new TypeError("Deux FeatureCollections GeoJSON sont requises pour auditer les côtes.");
  }
  const digits = Number.isInteger(precision) ? Math.max(0, Math.min(8, precision)) : 5;
  const landEdges = new Set();
  for (const feature of landCollection.features) {
    const rings = polygonRings(feature?.geometry);
    for (const ring of rings.slice(0, 1)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const key = edgeKey(ring[index], ring[index + 1], digits);
        if (key) landEdges.add(key);
      }
    }
  }
  let total = 0, matched = 0;
  for (const feature of territoryCollection.features) {
    for (const ring of polygonRings(feature?.geometry).filter((_, index) => index === 0)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const key = edgeKey(ring[index], ring[index + 1], digits);
        if (!key) continue;
        total++;
        if (landEdges.has(key)) matched++;
      }
    }
  }
  return {
    precision: digits,
    landSegmentCount: landEdges.size,
    territorySegmentCount: total,
    matchedSegmentCount: matched,
    unmatchedSegmentCount: total - matched,
    exactMatchRatio: total ? matched / total : 1
  };
}
