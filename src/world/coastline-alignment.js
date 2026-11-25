/**
 * Audit exacts des segments de côtes partagés entre le masque terrestre et
 * les polygones nationaux. Seuls les anneaux extérieurs sont comparés :
 * les trous et frontières administratives intérieures ne sont pas des côtes.
 *
 * Cette mesure ne modifie aucune géométrie et sert à décider si une
 * reconstruction topologique peut être faite sans déplacer les frontières.
 */
function exteriorRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates ?? [])
    .map(polygon => polygon?.[0]).filter(Array.isArray);
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
    const rings = exteriorRings(feature?.geometry);
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const key = edgeKey(ring[index], ring[index + 1], digits);
        if (key) landEdges.add(key);
      }
    }
  }
  let total = 0, matched = 0;
  const featureStats = territoryCollection.features.map((feature, featureIndex) => {
    let featureTotal = 0, featureMatched = 0;
    for (const ring of exteriorRings(feature?.geometry)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const key = edgeKey(ring[index], ring[index + 1], digits);
        if (!key) continue;
        featureTotal++;
        total++;
        if (landEdges.has(key)) {
          featureMatched++;
          matched++;
        }
      }
    }
    const properties = feature?.properties ?? {};
    const name = properties.NAME ?? properties.ADMIN ?? properties.name ?? properties.NAME_EN ?? null;
    return {
      featureIndex,
      name: typeof name === "string" ? name : null,
      segmentCount: featureTotal,
      matchedSegmentCount: featureMatched,
      unmatchedSegmentCount: featureTotal - featureMatched,
      exactMatchRatio: featureTotal ? featureMatched / featureTotal : 1
    };
  });
  return {
    precision: digits,
    landSegmentCount: landEdges.size,
    territorySegmentCount: total,
    matchedSegmentCount: matched,
    unmatchedSegmentCount: total - matched,
    exactMatchRatio: total ? matched / total : 1,
    featureStats
  };
}


const EARTH_KM_PER_DEGREE = 111.195;
const COAST_SAMPLE_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1])) && Math.abs(Number(point[1])) <= 90;
}

function pointSegmentDistanceKm(point, start, end) {
  const latitudeScale = Math.cos(Number(point[1]) * Math.PI / 180);
  const px = Number(point[0]) * latitudeScale, py = Number(point[1]);
  const ax = Number(start[0]) * latitudeScale, ay = Number(start[1]);
  const bx = Number(end[0]) * latitudeScale, by = Number(end[1]);
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * EARTH_KM_PER_DEGREE;
}

/**
 * Mesure la proximité côtière en tenant compte des sommets intermédiaires
 * présents dans une seule des deux sources. Les cinq points échantillonnés
 * doivent rester dans la tolérance : ce n'est pas une opération de fusion.
 */
export function measureCoastlineProximity(landCollection, territoryCollection, toleranceKm = 1) {
  if (landCollection?.type !== "FeatureCollection" || !Array.isArray(landCollection.features)
    || territoryCollection?.type !== "FeatureCollection" || !Array.isArray(territoryCollection.features)) {
    throw new TypeError("Deux FeatureCollections GeoJSON sont requises pour mesurer la proximité côtière.");
  }
  const tolerance = Number.isFinite(Number(toleranceKm)) ? Math.max(0, Number(toleranceKm)) : 1;
  const cellSize = Math.max(0.05, tolerance / EARTH_KM_PER_DEGREE * 2 + 0.02);
  const bins = new Map();
  const binKey = (x, y) => Math.floor(x / cellSize) + ":" + Math.floor(y / cellSize);
  const addSegment = (a, b) => {
    if (!validPoint(a) || !validPoint(b)) return;
    const minX = Math.floor(Math.min(Number(a[0]), Number(b[0])) / cellSize);
    const maxX = Math.floor(Math.max(Number(a[0]), Number(b[0])) / cellSize);
    const minY = Math.floor(Math.min(Number(a[1]), Number(b[1])) / cellSize);
    const maxY = Math.floor(Math.max(Number(a[1]), Number(b[1])) / cellSize);
    // Ignore malformed/world-spanning segments rather than filling an enormous grid.
    if ((maxX - minX + 1) * (maxY - minY + 1) > 2000) return;
    const segment = [a, b];
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = binKey(x * cellSize, y * cellSize);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(segment);
    }
  };
  for (const feature of landCollection.features) {
    for (const ring of exteriorRings(feature?.geometry)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) addSegment(ring[index], ring[index + 1]);
    }
  }
  const nearestDistance = point => {
    const x = Number(point[0]), y = Number(point[1]);
    const bx = Math.floor(x / cellSize), by = Math.floor(y / cellSize);
    const radius = Math.max(1, Math.ceil(tolerance / EARTH_KM_PER_DEGREE / cellSize) + 1);
    let nearest = Infinity;
    const seen = new Set();
    for (let ix = bx - radius; ix <= bx + radius; ix++) for (let iy = by - radius; iy <= by + radius; iy++) {
      for (const segment of bins.get(ix + ":" + iy) ?? []) {
        if (seen.has(segment)) continue;
        seen.add(segment);
        nearest = Math.min(nearest, pointSegmentDistanceKm(point, segment[0], segment[1]));
      }
    }
    return nearest;
  };
  let total = 0, matched = 0, maxDistanceKm = 0;
  const featureStats = territoryCollection.features.map((feature, featureIndex) => {
    let segmentCount = 0, matchedCount = 0, featureMaxDistanceKm = 0;
    for (const ring of exteriorRings(feature?.geometry)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const a = ring[index], b = ring[index + 1];
        if (!validPoint(a) || !validPoint(b)) continue;
        segmentCount++;
        total++;
        let segmentMatched = true;
        for (const fraction of COAST_SAMPLE_FRACTIONS) {
          const sample = [
            Number(a[0]) + (Number(b[0]) - Number(a[0])) * fraction,
            Number(a[1]) + (Number(b[1]) - Number(a[1])) * fraction
          ];
          const distance = nearestDistance(sample);
          featureMaxDistanceKm = Math.max(featureMaxDistanceKm, distance);
          maxDistanceKm = Math.max(maxDistanceKm, distance);
          if (distance > tolerance) segmentMatched = false;
        }
        if (segmentMatched) {
          matchedCount++;
          matched++;
        }
      }
    }
    const properties = feature?.properties ?? {};
    const name = properties.NAME ?? properties.ADMIN ?? properties.name ?? properties.NAME_EN ?? null;
    return {
      featureIndex,
      name: typeof name === "string" ? name : null,
      segmentCount,
      matchedSegmentCount: matchedCount,
      unmatchedSegmentCount: segmentCount - matchedCount,
      proximityRatio: segmentCount ? matchedCount / segmentCount : 1,
      maxSampleDistanceKm: Number.isFinite(featureMaxDistanceKm) ? featureMaxDistanceKm : null
    };
  });
  return {
    toleranceKm: tolerance,
    landSegmentCount: [...bins.values()].reduce((sum, segments) => sum + segments.length, 0),
    territorySegmentCount: total,
    matchedSegmentCount: matched,
    unmatchedSegmentCount: total - matched,
    proximityRatio: total ? matched / total : 1,
    maxSampleDistanceKm: Number.isFinite(maxDistanceKm) ? maxDistanceKm : null,
    featureStats
  };
}


/**
 * Extrait les segments de contours nationaux dont les échantillons suivent
 * une côte du masque terrestre. Le résultat est un inventaire de candidats
 * non destructif : aucune coordonnée GeoJSON source n'est remplacée.
 *
 * Les candidats sont volontairement segmentés à l'échelle des segments source.
 * Une étape topologique ultérieure devra les chaîner et vérifier leurs nœuds
 * avant toute reconstruction des anneaux nationaux.
 */
export function collectCoastlineAlignmentCandidates(landCollection, territoryCollection, toleranceKm = 1) {
  if (landCollection?.type !== "FeatureCollection" || !Array.isArray(landCollection.features)
    || territoryCollection?.type !== "FeatureCollection" || !Array.isArray(territoryCollection.features)) {
    throw new TypeError("Deux FeatureCollections GeoJSON sont requises pour extraire les candidats côtiers.");
  }
  const tolerance = Number.isFinite(Number(toleranceKm)) ? Math.max(0, Number(toleranceKm)) : 1;
  const cellSize = Math.max(0.05, tolerance / EARTH_KM_PER_DEGREE * 2 + 0.02);
  const bins = new Map();
  const addSegment = (a, b) => {
    if (!validPoint(a) || !validPoint(b)) return;
    const minX = Math.floor(Math.min(Number(a[0]), Number(b[0])) / cellSize);
    const maxX = Math.floor(Math.max(Number(a[0]), Number(b[0])) / cellSize);
    const minY = Math.floor(Math.min(Number(a[1]), Number(b[1])) / cellSize);
    const maxY = Math.floor(Math.max(Number(a[1]), Number(b[1])) / cellSize);
    if ((maxX - minX + 1) * (maxY - minY + 1) > 2000) return;
    const segment = [a, b];
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const key = x + ":" + y;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(segment);
    }
  };
  for (const feature of landCollection.features) {
    for (const ring of exteriorRings(feature?.geometry)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) addSegment(ring[index], ring[index + 1]);
    }
  }
  const nearestDistance = point => {
    const bx = Math.floor(Number(point[0]) / cellSize);
    const by = Math.floor(Number(point[1]) / cellSize);
    const radius = Math.max(1, Math.ceil(tolerance / EARTH_KM_PER_DEGREE / cellSize) + 1);
    let nearest = Infinity;
    const seen = new Set();
    for (let x = bx - radius; x <= bx + radius; x++) {
      for (let y = by - radius; y <= by + radius; y++) {
        for (const segment of bins.get(x + ":" + y) ?? []) {
          if (seen.has(segment)) continue;
          seen.add(segment);
          nearest = Math.min(nearest, pointSegmentDistanceKm(point, segment[0], segment[1]));
        }
      }
    }
    return nearest;
  };
  const candidates = [];
  territoryCollection.features.forEach((feature, featureIndex) => {
    const properties = feature?.properties ?? {};
    const rawName = properties.NAME ?? properties.ADMIN ?? properties.name ?? properties.NAME_EN ?? null;
    const name = typeof rawName === "string" ? rawName : null;
    exteriorRings(feature?.geometry).forEach((ring, ringIndex) => {
      if (!Array.isArray(ring)) return;
      for (let segmentIndex = 0; segmentIndex < ring.length - 1; segmentIndex++) {
        const a = ring[segmentIndex], b = ring[segmentIndex + 1];
        if (!validPoint(a) || !validPoint(b)) continue;
        const sampleDistancesKm = COAST_SAMPLE_FRACTIONS.map(fraction => nearestDistance([
          Number(a[0]) + (Number(b[0]) - Number(a[0])) * fraction,
          Number(a[1]) + (Number(b[1]) - Number(a[1])) * fraction
        ]));
        const maxSampleDistanceKm = Math.max(...sampleDistancesKm);
        if (maxSampleDistanceKm <= tolerance) {
          candidates.push({
            featureIndex,
            name,
            ringIndex,
            segmentIndex,
            coordinates: [[...a], [...b]],
            maxSampleDistanceKm,
            sampleDistancesKm
          });
        }
      }
    });
  });
  return {
    toleranceKm: tolerance,
    candidateCount: candidates.length,
    candidates
  };
}
