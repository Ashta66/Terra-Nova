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
  const wrappedLongitudeDelta = longitude => {
    const delta = Number(longitude) - Number(point[0]);
    return ((delta + 540) % 360) - 180;
  };
  const px = 0, py = Number(point[1]);
  const ax = wrappedLongitudeDelta(start[0]) * latitudeScale, ay = Number(start[1]);
  const bx = wrappedLongitudeDelta(end[0]) * latitudeScale, by = Number(end[1]);
  const dx = bx - ax, dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * EARTH_KM_PER_DEGREE;
}

/**
 * Mesure la proximité côtière sans confondre frontières intérieures et côtes.
 * Un segment est côtier si au moins trois de ses cinq échantillons sont dans
 * coastalSearchRadiusKm ; il est aligné si les cinq restent dans toleranceKm.
 */
function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}


function nameForFeature(feature) {
  const properties = feature?.properties ?? {};
  return properties.NAME ?? properties.ADMIN ?? properties.name ?? properties.NAME_EN
    ?? properties.NAME_0 ?? properties.SOVEREIGNT ?? properties.NAME_LONG ?? properties.BRK_NAME
    ?? properties.GEOUNIT ?? properties.GU_A3 ?? properties.SU_A3 ?? null;
}

export function measureCoastlineProximity(landCollection, territoryCollection, toleranceKm = 1, coastalSearchRadiusKm = 50, minimumCoastalSamples = 3, detailOptions = {}) {
  if (landCollection?.type !== "FeatureCollection" || !Array.isArray(landCollection.features)
    || territoryCollection?.type !== "FeatureCollection" || !Array.isArray(territoryCollection.features)) {
    throw new TypeError("Deux FeatureCollections GeoJSON sont requises pour mesurer la proximité côtière.");
  }
  const tolerance = Number.isFinite(Number(toleranceKm)) ? Math.max(0, Number(toleranceKm)) : 1;
  const searchRadius = Number.isFinite(Number(coastalSearchRadiusKm))
    ? Math.max(tolerance, Number(coastalSearchRadiusKm)) : Math.max(tolerance, 50);
  const coastalSampleThreshold = Number.isInteger(minimumCoastalSamples)
    ? Math.max(1, Math.min(COAST_SAMPLE_FRACTIONS.length, minimumCoastalSamples)) : 3;
  const cellSize = Math.max(0.05, searchRadius / EARTH_KM_PER_DEGREE * 2 + 0.02);
  const bins = new Map();
  const overflowSegments = [];
  const addSegment = (a, b) => {
    if (!validPoint(a) || !validPoint(b)) return;
    const minX = Math.floor(Math.min(Number(a[0]), Number(b[0])) / cellSize);
    const maxX = Math.floor(Math.max(Number(a[0]), Number(b[0])) / cellSize);
    const minY = Math.floor(Math.min(Number(a[1]), Number(b[1])) / cellSize);
    const maxY = Math.floor(Math.max(Number(a[1]), Number(b[1])) / cellSize);
    const segment = [a, b];
    if ((maxX - minX + 1) * (maxY - minY + 1) > 2000) {
      overflowSegments.push(segment);
      return;
    }
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
    const latitudeScale = Math.max(0.05, Math.cos(Number(point[1]) * Math.PI / 180));
    const radiusX = Math.max(1, Math.ceil(searchRadius / (EARTH_KM_PER_DEGREE * latitudeScale * cellSize)) + 1);
    const radiusY = Math.max(1, Math.ceil(searchRadius / (EARTH_KM_PER_DEGREE * cellSize)) + 1);
    const longitudeWorldCells = Math.round(360 / cellSize);
    let nearest = Infinity;
    const seen = new Set();
    for (const worldOffset of [-longitudeWorldCells, 0, longitudeWorldCells]) {
      const centerX = bx + worldOffset;
      for (let ix = centerX - radiusX; ix <= centerX + radiusX; ix++) {
        for (let iy = by - radiusY; iy <= by + radiusY; iy++) {
          for (const segment of bins.get(ix + ":" + iy) ?? []) {
            if (seen.has(segment)) continue;
            seen.add(segment);
            nearest = Math.min(nearest, pointSegmentDistanceKm(point, segment[0], segment[1]));
          }
        }
      }
    }
    for (const segment of overflowSegments) {
      if (seen.has(segment)) continue;
      seen.add(segment);
      nearest = Math.min(nearest, pointSegmentDistanceKm(point, segment[0], segment[1]));
    }
    return nearest;
  };
  let total = 0, matched = 0, maxDistanceKm = 0;
  let coastalTotal = 0, coastalMatched = 0;
  const coastalSampleDistances = [];
  const coastalSegmentDetails = [];
  const includeSegmentDetails = detailOptions?.includeSegmentDetails === true;
  const maxSegmentDetails = Number.isInteger(detailOptions?.maxSegmentDetails)
    ? Math.max(1, Math.min(1000, detailOptions.maxSegmentDetails)) : 100;
  const featureStats = territoryCollection.features.map((feature, featureIndex) => {
    let segmentCount = 0, matchedCount = 0, featureMaxDistanceKm = 0;
    let coastalSegmentCount = 0, coastalMatchedSegmentCount = 0;
    const featureCoastalSampleDistances = [];
    for (const ring of exteriorRings(feature?.geometry)) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index++) {
        const a = ring[index], b = ring[index + 1];
        if (!validPoint(a) || !validPoint(b)) continue;
        segmentCount++;
        total++;
        const sampleCoordinates = COAST_SAMPLE_FRACTIONS.map(fraction => [
          Number(a[0]) + (Number(b[0]) - Number(a[0])) * fraction,
          Number(a[1]) + (Number(b[1]) - Number(a[1])) * fraction
        ]);
        const sampleDistancesKm = sampleCoordinates.map(nearestDistance);
        const segmentMaxDistanceKm = Math.max(...sampleDistancesKm);
        const nearCoastSampleCount = sampleDistancesKm.filter(distance => distance <= searchRadius).length;
        const isCoastalSegment = nearCoastSampleCount >= coastalSampleThreshold;
        const segmentMatched = segmentMaxDistanceKm <= tolerance;
        featureMaxDistanceKm = Math.max(featureMaxDistanceKm, segmentMaxDistanceKm);
        maxDistanceKm = Math.max(maxDistanceKm, segmentMaxDistanceKm);
        if (segmentMatched) {
          matchedCount++;
          matched++;
        }

        if (isCoastalSegment) {
          if (includeSegmentDetails) coastalSegmentDetails.push({
            featureIndex,
            name: typeof nameForFeature(feature) === "string" ? nameForFeature(feature) : null,
            segmentIndex: index,
            coordinates: [a, b].map(point => [Number(point[0]), Number(point[1])]),
            sampleCoordinates,
            sampleDistancesKm,
            maxSampleDistanceKm: segmentMaxDistanceKm,
            withinToleranceSampleCount: sampleDistancesKm.filter(distance => distance <= tolerance).length
          });
          coastalSegmentCount++;
          coastalTotal++;
          featureCoastalSampleDistances.push(...sampleDistancesKm);
          coastalSampleDistances.push(...sampleDistancesKm);
          if (segmentMatched) {
            coastalMatchedSegmentCount++;
            coastalMatched++;
          }
        }
      }
    }
    const properties = feature?.properties ?? {};
    const name = properties.NAME ?? properties.ADMIN ?? properties.name ?? properties.NAME_EN
      ?? properties.NAME_0 ?? properties.SOVEREIGNT ?? properties.NAME_LONG ?? properties.BRK_NAME
      ?? properties.GEOUNIT ?? properties.GU_A3 ?? properties.SU_A3 ?? null;
    const propertySummary = Object.fromEntries(Object.entries(properties)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 24));
    const featureCoordinates = exteriorRings(feature?.geometry).flat()
      .filter(validPoint).map(point => [Number(point[0]), Number(point[1])]);
    const bounds = featureCoordinates.length ? [
      Math.min(...featureCoordinates.map(point => point[0])),
      Math.min(...featureCoordinates.map(point => point[1])),
      Math.max(...featureCoordinates.map(point => point[0])),
      Math.max(...featureCoordinates.map(point => point[1]))
    ] : null;
    const boundsCenter = bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null;
    return {
      featureIndex,
      name: typeof name === "string" ? name : null,
      propertyKeys: Object.keys(properties).sort(),
      propertySummary,
      geometryType: feature?.geometry?.type ?? null,
      bounds,
      boundsCenter,
      segmentCount,
      matchedSegmentCount: matchedCount,
      unmatchedSegmentCount: segmentCount - matchedCount,
      proximityRatio: segmentCount ? matchedCount / segmentCount : 1,
      coastalSegmentCount,
      coastalMatchedSegmentCount,
      coastalUnmatchedSegmentCount: coastalSegmentCount - coastalMatchedSegmentCount,
      coastalProximityRatio: coastalSegmentCount ? coastalMatchedSegmentCount / coastalSegmentCount : null,
      coastalSampleCount: featureCoastalSampleDistances.length,
      coastalSamplesWithinToleranceCount: featureCoastalSampleDistances.filter(distance => distance <= tolerance).length,
      coastalSampleProximityRatio: featureCoastalSampleDistances.length
        ? featureCoastalSampleDistances.filter(distance => distance <= tolerance).length / featureCoastalSampleDistances.length : null,
      coastalSampleMedianDistanceKm: percentile(featureCoastalSampleDistances, 0.5),
      coastalSampleP90DistanceKm: percentile(featureCoastalSampleDistances, 0.9),
      coastalSampleMaxDistanceKm: percentile(featureCoastalSampleDistances, 1),
      maxSampleDistanceKm: Number.isFinite(featureMaxDistanceKm) ? featureMaxDistanceKm : null
    };
  });
  return {
    toleranceKm: tolerance,
    coastalSearchRadiusKm: searchRadius,
    coastalSampleThreshold,
    landSegmentCount: [...bins.values()].reduce((sum, segments) => sum + segments.length, 0),
    territorySegmentCount: total,
    matchedSegmentCount: matched,
    unmatchedSegmentCount: total - matched,
    proximityRatio: total ? matched / total : 1,
    coastalSegmentCount: coastalTotal,
    coastalMatchedSegmentCount: coastalMatched,
    coastalUnmatchedSegmentCount: coastalTotal - coastalMatched,
    coastalProximityRatio: coastalTotal ? coastalMatched / coastalTotal : null,
    coastalSampleCount: coastalSampleDistances.length,
    coastalSamplesWithinToleranceCount: coastalSampleDistances.filter(distance => distance <= tolerance).length,
    coastalSampleProximityRatio: coastalSampleDistances.length
      ? coastalSampleDistances.filter(distance => distance <= tolerance).length / coastalSampleDistances.length : null,
    coastalSampleMedianDistanceKm: percentile(coastalSampleDistances, 0.5),
    coastalSampleP90DistanceKm: percentile(coastalSampleDistances, 0.9),
    coastalSampleMaxDistanceKm: percentile(coastalSampleDistances, 1),
    segmentDetails: includeSegmentDetails ? coastalSegmentDetails
      .sort((a, b) => b.maxSampleDistanceKm - a.maxSampleDistanceKm)
      .slice(0, maxSegmentDetails) : undefined,
    segmentDetailsTruncated: includeSegmentDetails && coastalSegmentDetails.length > maxSegmentDetails,
    maxSampleDistanceKm: Number.isFinite(maxDistanceKm) ? maxDistanceKm : null,
    featureStats
  };
}


/**
 * Compare plusieurs rayons et seuils d'échantillonnage sans modifier les
 * géométries. Les distances sont recalculées pour chaque rayon afin de garder
 * une grille spatiale cohérente avec la fenêtre de recherche.
 */
export function analyzeCoastalClassificationSensitivity(
  landCollection,
  territoryCollection,
  toleranceKm = 1,
  radiiKm = [5, 10, 20, 50],
  sampleThresholds = [3, 4, 5]
) {
  if (!Array.isArray(radiiKm) || !Array.isArray(sampleThresholds)
    || !radiiKm.length || !sampleThresholds.length) {
    throw new TypeError("Des listes non vides de rayons et de seuils sont requises.");
  }
  const rows = [];
  for (const radius of radiiKm) {
    for (const threshold of sampleThresholds) {
      const report = measureCoastlineProximity(
        landCollection, territoryCollection, toleranceKm, radius, threshold
      );
      rows.push({
        searchRadiusKm: report.coastalSearchRadiusKm,
        minimumSamples: report.coastalSampleThreshold,
        coastalSegmentCount: report.coastalSegmentCount,
        matchedSegmentCount: report.coastalMatchedSegmentCount,
        sampleCount: report.coastalSampleCount,
        sampleProximityRatio: report.coastalSampleProximityRatio,
        medianDistanceKm: report.coastalSampleMedianDistanceKm,
        p90DistanceKm: report.coastalSampleP90DistanceKm
      });
    }
  }
  return { toleranceKm, radiiKm: [...radiiKm], sampleThresholds: [...sampleThresholds], rows };
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
            ringSegmentCount: ring.length - 1,
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


function pointsCoincideWithinKm(a, b, toleranceKm = 0.001) {
  if (!validPoint(a) || !validPoint(b)) return false;
  return pointSegmentDistanceKm(a, b, b) <= toleranceKm;
}

/**
 * Regroupe les candidats contigus d'un même anneau sans modifier leurs
 * coordonnées. Les chaînes ouvertes/fermées sont explicites ; aucun pont
 * artificiel n'est ajouté entre deux segments disjoints.
 */
export function chainCoastlineAlignmentCandidates(candidates) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("Un tableau de segments candidats est requis.");
  }
  const groups = new Map();
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate?.featureIndex) || candidate.featureIndex < 0
      || !Number.isInteger(candidate?.ringIndex) || candidate.ringIndex < 0
      || !Number.isInteger(candidate?.segmentIndex) || candidate.segmentIndex < 0
      || !Array.isArray(candidate.coordinates) || candidate.coordinates.length !== 2
      || !validPoint(candidate.coordinates[0]) || !validPoint(candidate.coordinates[1])) continue;
    const key = candidate.featureIndex + ":" + candidate.ringIndex;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const chains = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.segmentIndex - b.segmentIndex);
    const runs = [];
    for (const candidate of group) {
      const current = runs[runs.length - 1];
      const previous = current?.[current.length - 1];
      if (previous && candidate.segmentIndex === previous.segmentIndex + 1
        && pointsCoincideWithinKm(previous.coordinates[1], candidate.coordinates[0])) {
        current.push(candidate);
      } else {
        runs.push([candidate]);
      }
    }
    const ringSegmentCount = Math.max(0, ...group.map(candidate => Number(candidate.ringSegmentCount) || 0));
    if (runs.length > 1 && ringSegmentCount > 0
      && runs[0][0].segmentIndex === 0
      && runs[runs.length - 1].at(-1).segmentIndex === ringSegmentCount - 1
      && pointsCoincideWithinKm(runs.at(-1).at(-1).coordinates[1], runs[0][0].coordinates[0])) {
      const wrapped = [...runs.pop(), ...runs.shift()];
      runs.push(wrapped);
    }
    for (const run of runs) {
      const coordinates = [[...run[0].coordinates[0]]];
      for (const candidate of run) coordinates.push([...candidate.coordinates[1]]);
      const isClosed = pointsCoincideWithinKm(coordinates[0], coordinates.at(-1));
      chains.push({
        featureIndex: run[0].featureIndex,
        name: run[0].name ?? null,
        ringIndex: run[0].ringIndex,
        segmentIndices: run.map(candidate => candidate.segmentIndex),
        segmentCount: run.length,
        coordinates,
        isClosed,
        maxSampleDistanceKm: Math.max(...run.map(candidate => Number(candidate.maxSampleDistanceKm) || 0))
      });
    }
  }
  return {
    chainCount: chains.length,
    closedChainCount: chains.filter(chain => chain.isClosed).length,
    openChainCount: chains.filter(chain => !chain.isClosed).length,
    chains
  };
}


/**
 * Audit non destructif du graphe d'extrémités des candidats. La tolérance
 * sert uniquement à regrouper les nœuds proches ; aucune géométrie n'est
 * déplacée ou fusionnée.
 */
export function analyzeCoastlineCandidateTopology(candidates, nodeToleranceKm = 0.001) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("Un tableau de segments candidats est requis.");
  }
  const tolerance = Number.isFinite(Number(nodeToleranceKm))
    ? Math.max(0.000001, Number(nodeToleranceKm)) : 0.001;
  const valid = candidates.filter(candidate =>
    Number.isInteger(candidate?.featureIndex) && candidate.featureIndex >= 0
    && Number.isInteger(candidate?.ringIndex) && candidate.ringIndex >= 0
    && Number.isInteger(candidate?.segmentIndex) && candidate.segmentIndex >= 0
    && Array.isArray(candidate.coordinates) && candidate.coordinates.length === 2
    && validPoint(candidate.coordinates[0]) && validPoint(candidate.coordinates[1]));
  const groups = new Map();
  for (const candidate of valid) {
    const key = candidate.featureIndex + ":" + candidate.ringIndex;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const ringStats = [];
  let duplicateSegmentCount = 0, continuityBreakCount = 0, branchNodeCount = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => a.segmentIndex - b.segmentIndex);
    const seenIndices = new Set();
    const duplicates = [];
    for (const candidate of group) {
      if (seenIndices.has(candidate.segmentIndex)) duplicates.push(candidate.segmentIndex);
      seenIndices.add(candidate.segmentIndex);
    }
    const breaks = [];
    const nodes = [];
    const nodeFor = point => {
      let node = nodes.find(item => pointsCoincideWithinKm(item.coordinate, point, tolerance));
      if (!node) {
        node = { coordinate: [...point], degree: 0 };
        nodes.push(node);
      }
      node.degree++;
      return node;
    };
    for (const candidate of group) {
      nodeFor(candidate.coordinates[0]);
      nodeFor(candidate.coordinates[1]);
    }
    for (let index = 1; index < group.length; index++) {
      const previous = group[index - 1], current = group[index];
      if (current.segmentIndex === previous.segmentIndex + 1
        && !pointsCoincideWithinKm(previous.coordinates[1], current.coordinates[0], tolerance)) {
        breaks.push({ afterSegmentIndex: previous.segmentIndex, beforeSegmentIndex: current.segmentIndex });
      }
    }
    const branches = nodes.filter(node => node.degree > 2);
    duplicateSegmentCount += duplicates.length;
    continuityBreakCount += breaks.length;
    branchNodeCount += branches.length;
    ringStats.push({
      featureIndex: group[0].featureIndex,
      ringIndex: group[0].ringIndex,
      candidateCount: group.length,
      duplicateSegmentIndices: [...new Set(duplicates)],
      continuityBreaks: breaks,
      endpointNodeCount: nodes.length,
      branchNodeCount: branches.length,
      endpointDegrees: nodes.map(node => node.degree).sort((a, b) => a - b)
    });
  }
  return {
    candidateCount: valid.length,
    ringCount: ringStats.length,
    duplicateSegmentCount,
    continuityBreakCount,
    branchNodeCount,
    isUnambiguous: duplicateSegmentCount === 0 && continuityBreakCount === 0 && branchNodeCount === 0,
    ringStats
  };
}


/**
 * Mesure la part de chaque anneau source couverte par les candidats côtiers,
 * puis associe couverture, chaînes et audit topologique. Aucun seuil
 * automatique de reconstruction n'est imposé par cette mesure.
 */
export function measureCoastlineCandidateCoverage(candidates, nodeToleranceKm = 0.001) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("Un tableau de segments candidats est requis.");
  }
  const valid = candidates.filter(candidate =>
    Number.isInteger(candidate?.featureIndex) && candidate.featureIndex >= 0
    && Number.isInteger(candidate?.ringIndex) && candidate.ringIndex >= 0
    && Number.isInteger(candidate?.segmentIndex) && candidate.segmentIndex >= 0
    && Number.isInteger(candidate?.ringSegmentCount) && candidate.ringSegmentCount > 0
    && candidate.segmentIndex < candidate.ringSegmentCount
    && Array.isArray(candidate.coordinates) && candidate.coordinates.length === 2
    && validPoint(candidate.coordinates[0]) && validPoint(candidate.coordinates[1]));
  const groups = new Map();
  for (const candidate of valid) {
    const key = candidate.featureIndex + ":" + candidate.ringIndex;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const chained = chainCoastlineAlignmentCandidates(valid);
  const topology = analyzeCoastlineCandidateTopology(valid, nodeToleranceKm);
  const chainByRing = new Map();
  for (const chain of chained.chains) {
    const key = chain.featureIndex + ":" + chain.ringIndex;
    if (!chainByRing.has(key)) chainByRing.set(key, []);
    chainByRing.get(key).push(chain);
  }
  const ringStats = [];
  let totalSourceSegments = 0, totalCoveredSegments = 0;
  for (const [key, group] of groups) {
    const ringSegmentCount = Math.max(...group.map(candidate => candidate.ringSegmentCount));
    const indices = [...new Set(group.map(candidate => candidate.segmentIndex))];
    const covered = indices.length;
    const chains = chainByRing.get(key) ?? [];
    totalSourceSegments += ringSegmentCount;
    totalCoveredSegments += covered;
    ringStats.push({
      featureIndex: group[0].featureIndex,
      name: group[0].name ?? null,
      ringIndex: group[0].ringIndex,
      sourceSegmentCount: ringSegmentCount,
      candidateSegmentCount: group.length,
      coveredSegmentCount: covered,
      uncoveredSegmentCount: Math.max(0, ringSegmentCount - covered),
      coverageRatio: covered / ringSegmentCount,
      chainCount: chains.length,
      longestChainSegmentCount: Math.max(0, ...chains.map(chain => chain.segmentCount)),
      closedChainCount: chains.filter(chain => chain.isClosed).length
    });
  }
  return {
    nodeToleranceKm: Number.isFinite(Number(nodeToleranceKm)) ? Math.max(0.000001, Number(nodeToleranceKm)) : 0.001,
    ringCount: ringStats.length,
    sourceSegmentCount: totalSourceSegments,
    coveredSegmentCount: totalCoveredSegments,
    uncoveredSegmentCount: totalSourceSegments - totalCoveredSegments,
    coverageRatio: totalSourceSegments ? totalCoveredSegments / totalSourceSegments : 0,
    chainCount: chained.chainCount,
    closedChainCount: chained.closedChainCount,
    openChainCount: chained.openChainCount,
    topology,
    ringStats
  };
}


/**
 * Classe les anneaux candidats selon des critères explicites. "eligible"
 * signifie uniquement qu'un anneau fermé mérite une étude complémentaire ;
 * cela n'autorise jamais son remplacement automatique dans les données.
 */
export function classifyCoastlineReconstructionCandidates(coverageReport, options = {}) {
  if (!coverageReport || !Array.isArray(coverageReport.ringStats)
    || !coverageReport.topology || !Array.isArray(coverageReport.topology.ringStats)) {
    throw new TypeError("Un rapport de couverture côtière complet est requis.");
  }
  const minCoverageRatio = Number.isFinite(Number(options.minCoverageRatio))
    ? Math.max(0, Math.min(1, Number(options.minCoverageRatio))) : 0.98;
  const minChainSegments = Number.isInteger(options.minChainSegments)
    ? Math.max(3, options.minChainSegments) : 3;
  const topologyByRing = new Map(coverageReport.topology.ringStats.map(stat =>
    [stat.featureIndex + ":" + stat.ringIndex, stat]));
  const candidates = coverageReport.ringStats.map(ring => {
    const key = ring.featureIndex + ":" + ring.ringIndex;
    const topology = topologyByRing.get(key);
    const reasons = [];
    if (ring.coverageRatio < minCoverageRatio) reasons.push("coverage-below-threshold");
    if (ring.closedChainCount !== 1) reasons.push("not-exactly-one-closed-chain");
    if (ring.longestChainSegmentCount < minChainSegments) reasons.push("chain-too-short");
    if (!topology) reasons.push("topology-report-missing");
    else {
      if (topology.duplicateSegmentIndices.length) reasons.push("duplicate-segments");
      if (topology.continuityBreaks.length) reasons.push("continuity-breaks");
      if (topology.branchNodeCount) reasons.push("branched-nodes");
    }
    return {
      featureIndex: ring.featureIndex,
      name: ring.name ?? null,
      ringIndex: ring.ringIndex,
      coverageRatio: ring.coverageRatio,
      closedChainCount: ring.closedChainCount,
      longestChainSegmentCount: ring.longestChainSegmentCount,
      eligibleForReview: reasons.length === 0,
      reasons
    };
  });
  return {
    thresholds: { minCoverageRatio, minChainSegments },
    candidateRingCount: candidates.length,
    eligibleRingCount: candidates.filter(candidate => candidate.eligibleForReview).length,
    rejectedRingCount: candidates.filter(candidate => !candidate.eligibleForReview).length,
    candidates
  };
}


/**
 * Agrège les mesures par pays/Feature pour prioriser l'inspection des côtes.
 * Les ratios sont pondérés par le nombre de segments source.
 */
export function summarizeCoastlineAlignment(coverageReport, classificationReport) {
  if (!coverageReport || !Array.isArray(coverageReport.ringStats)
    || !classificationReport || !Array.isArray(classificationReport.candidates)) {
    throw new TypeError("Les rapports de couverture et de classification sont requis.");
  }
  const classified = new Map(classificationReport.candidates.map(item =>
    [item.featureIndex + ":" + item.ringIndex, item]));
  const features = new Map();
  for (const ring of coverageReport.ringStats) {
    const key = String(ring.featureIndex);
    if (!features.has(key)) features.set(key, {
      featureIndex: ring.featureIndex,
      name: ring.name ?? null,
      ringCount: 0,
      sourceSegmentCount: 0,
      coveredSegmentCount: 0,
      eligibleRingCount: 0,
      rejectedRingCount: 0,
      reasons: {}
    });
    const feature = features.get(key);
    feature.ringCount++;
    feature.sourceSegmentCount += ring.sourceSegmentCount;
    feature.coveredSegmentCount += ring.coveredSegmentCount;
    const classification = classified.get(ring.featureIndex + ":" + ring.ringIndex);
    if (classification?.eligibleForReview) feature.eligibleRingCount++;
    else feature.rejectedRingCount++;
    for (const reason of classification?.reasons ?? ["classification-missing"]) {
      feature.reasons[reason] = (feature.reasons[reason] ?? 0) + 1;
    }
  }
  const countries = [...features.values()].map(feature => ({
    ...feature,
    coverageRatio: feature.sourceSegmentCount
      ? feature.coveredSegmentCount / feature.sourceSegmentCount : 0
  })).sort((a, b) => a.coverageRatio - b.coverageRatio
    || b.rejectedRingCount - a.rejectedRingCount
    || a.featureIndex - b.featureIndex);
  return {
    featureCount: countries.length,
    ringCount: countries.reduce((sum, item) => sum + item.ringCount, 0),
    eligibleRingCount: countries.reduce((sum, item) => sum + item.eligibleRingCount, 0),
    rejectedRingCount: countries.reduce((sum, item) => sum + item.rejectedRingCount, 0),
    countries
  };
}


/**
 * Audit complet des collections effectivement chargées par la carte.
 * Strictement diagnostique : aucune géométrie source n'est modifiée.
 */
export function auditLoadedCoastlineAlignment(landCollection, territoryCollection, options = {}) {
  if (landCollection?.type !== "FeatureCollection" || !Array.isArray(landCollection.features)
    || territoryCollection?.type !== "FeatureCollection" || !Array.isArray(territoryCollection.features)) {
    throw new TypeError("Les couches terrestres et territoriales doivent être chargées avant l'audit.");
  }
  const toleranceKm = Number.isFinite(Number(options.toleranceKm)) ? Math.max(0, Number(options.toleranceKm)) : 1;
  const coastalSearchRadiusKm = Number.isFinite(Number(options.coastalSearchRadiusKm))
    ? Math.max(toleranceKm, Number(options.coastalSearchRadiusKm)) : Math.max(toleranceKm, 50);
  const proximity = measureCoastlineProximity(landCollection, territoryCollection, toleranceKm, coastalSearchRadiusKm,
    Number.isInteger(options.minimumCoastalSamples) ? options.minimumCoastalSamples : 3,
    { includeSegmentDetails: options.segmentDetails === true, maxSegmentDetails: options.maxSegmentDetails });
  const sensitivity = options.sensitivity === true
    ? analyzeCoastalClassificationSensitivity(landCollection, territoryCollection, toleranceKm,
      options.sensitivityRadiiKm ?? [5, 10, 20, 50], options.sensitivitySampleThresholds ?? [3, 4, 5])
    : null;
  const candidates = collectCoastlineAlignmentCandidates(landCollection, territoryCollection, toleranceKm);
  const coverage = measureCoastlineCandidateCoverage(candidates.candidates, options.nodeToleranceKm);
  const classification = classifyCoastlineReconstructionCandidates(coverage, options);
  const summary = summarizeCoastlineAlignment(coverage, classification);
  return {
    toleranceKm,
    coastalSearchRadiusKm,
    sensitivity,
    dataset: options.dataset ?? null,
    landFeatureCount: landCollection.features.length,
    territoryFeatureCount: territoryCollection.features.length,
    candidateSegmentCount: candidates.candidateCount,
    coastalAlignment: {
      coastalSegmentCount: proximity.coastalSegmentCount,
      matchedSegmentCount: proximity.coastalMatchedSegmentCount,
      unmatchedSegmentCount: proximity.coastalUnmatchedSegmentCount,
      proximityRatio: proximity.coastalProximityRatio,
      sampleCount: proximity.coastalSampleCount,
      samplesWithinToleranceCount: proximity.coastalSamplesWithinToleranceCount,
      sampleProximityRatio: proximity.coastalSampleProximityRatio,
      sampleMedianDistanceKm: proximity.coastalSampleMedianDistanceKm,
      sampleP90DistanceKm: proximity.coastalSampleP90DistanceKm,
      sampleMaxDistanceKm: proximity.coastalSampleMaxDistanceKm,
      segmentDetails: proximity.segmentDetails,
      segmentDetailsTruncated: proximity.segmentDetailsTruncated,
      featureStats: proximity.featureStats.map(feature => ({
        featureIndex: feature.featureIndex,
        name: feature.name,
        propertyKeys: feature.propertyKeys,
        propertySummary: feature.propertySummary,
        geometryType: feature.geometryType,
        bounds: feature.bounds,
        boundsCenter: feature.boundsCenter,
        coastalSegmentCount: feature.coastalSegmentCount,
        matchedSegmentCount: feature.coastalMatchedSegmentCount,
        unmatchedSegmentCount: feature.coastalUnmatchedSegmentCount,
        proximityRatio: feature.coastalProximityRatio,
        sampleCount: feature.coastalSampleCount,
        samplesWithinToleranceCount: feature.coastalSamplesWithinToleranceCount,
        sampleProximityRatio: feature.coastalSampleProximityRatio,
        sampleMedianDistanceKm: feature.coastalSampleMedianDistanceKm,
        sampleP90DistanceKm: feature.coastalSampleP90DistanceKm,
        sampleMaxDistanceKm: feature.coastalSampleMaxDistanceKm
      }))
    },
    proximity,
    coverage,
    classification,
    summary
  };
}