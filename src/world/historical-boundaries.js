import { fetchMapAsset } from "./map-lod.js";

const HISTORICAL_INDEX_URL = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/index.json";
const HISTORICAL_GEOJSON_BASE = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/";
const MODERN_POLITICAL_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson";
const MODERN_TERRITORIES_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const MODERN_ADMIN_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_1_states_provinces_lines.geojson";
const REGIONAL_ADMIN_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson";
let historicalIndexPromise = null;
const historicalLayerCache = new Map();
const historicalTerritoryCache = new Map();
let modernPoliticalPromise = null;
let modernTerritoriesPromise = null;
let modernAdminPromise = null;
let regionalAdminPromise = null;

async function readCollection(url, label, fetcher) {
  const response = await fetchMapAsset(url, fetcher);
  if (!response?.ok) throw new Error(label + " indisponible (HTTP " + (response?.status ?? "réseau") + ").");
  const collection = await response.json();
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(label + " : GeoJSON invalide.");
  }
  return collection;
}

export function selectHistoricalSnapshot(year, years) {
  if (!Array.isArray(years) || !years.length) return null;
  return years.reduce((best, candidate) =>
    Math.abs(candidate.year - year) < Math.abs(best.year - year) ? candidate : best
  );
}

export function historicalPolygonsToBoundaries(collection) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new TypeError("Une FeatureCollection historique est requise.");
  }
  const polygonFeatures = collection.features.map(feature => {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    return { feature, polygons };
  });
  const edgeOwners = new Map();
  const edgeKey = (a, b) => {
    const pointKey = point => Number(point[0]).toFixed(5) + "," + Number(point[1]).toFixed(5);
    return [pointKey(a), pointKey(b)].sort().join("|");
  };
  polygonFeatures.forEach(({ polygons }, featureIndex) => {
    for (const polygon of polygons) for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      for (let i = 0; i < ring.length - 1; i++) {
        const key = edgeKey(ring[i], ring[i + 1]);
        if (!edgeOwners.has(key)) edgeOwners.set(key, new Set());
        edgeOwners.get(key).add(featureIndex);
      }
    }
  });
  const features = [];
  polygonFeatures.forEach(({ feature, polygons }, featureIndex) => {
    const sharedLines = [];
    for (const polygon of polygons) for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      let line = [];
      const flush = () => {
        if (line.length > 1) sharedLines.push(line);
        line = [];
      };
      for (let i = 0; i < ring.length - 1; i++) {
        const start = ring[i], finish = ring[i + 1];
        const owners = edgeOwners.get(edgeKey(start, finish));
        const isSharedPoliticalEdge = owners?.size > 1;
        const isCanonicalOwner = isSharedPoliticalEdge && featureIndex === Math.min(...owners);
        if (isCanonicalOwner) {
          if (!line.length) line.push(start);
          line.push(finish);
        } else flush();
      }
      flush();
    }
    if (!sharedLines.length) return;
    features.push({
      type: "Feature",
      properties: { ...(feature.properties ?? {}), boundaryLayer: "political-historical" },
      geometry: { type: "MultiLineString", coordinates: sharedLines }
    });
  });
  return { type: "FeatureCollection", features };
}

async function getHistoricalIndex(fetcher) {
  if (!historicalIndexPromise) {
    historicalIndexPromise = fetchMapAsset(HISTORICAL_INDEX_URL, fetcher).then(async response => {
      if (!response?.ok) throw new Error("Index historique indisponible.");
      const data = await response.json();
      if (!Array.isArray(data?.years)) throw new Error("Index historique invalide.");
      return data;
    }).catch(error => { historicalIndexPromise = null; throw error; });
  }
  return historicalIndexPromise;
}

export async function loadPoliticalBoundaries(year, fetcher = globalThis.fetch) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) throw new TypeError("Année de frontière invalide.");
  if (numericYear >= 2026) {
    if (!modernPoliticalPromise) modernPoliticalPromise = readCollection(MODERN_POLITICAL_URL, "Frontières politiques actuelles", fetcher);
    if (!modernTerritoriesPromise) modernTerritoriesPromise = readCollection(MODERN_TERRITORIES_URL, "Pays modernes", fetcher);
    return { collection: await modernPoliticalPromise, territories: await modernTerritoriesPromise, sourceYear: 2026, exact: numericYear === 2026, source: "Natural Earth 1:110m" };
  }
  const index = await getHistoricalIndex(fetcher);
  const snapshot = selectHistoricalSnapshot(numericYear, index.years);
  if (!snapshot) return { collection: null, sourceYear: null, exact: false, source: "Aucune donnée historique" };
  if (!historicalLayerCache.has(snapshot.year)) {
    const sourcePromise = readCollection(HISTORICAL_GEOJSON_BASE + snapshot.filename, "Territoires historiques " + snapshot.year, fetcher);
    historicalTerritoryCache.set(snapshot.year, sourcePromise);
    const promise = sourcePromise.then(historicalPolygonsToBoundaries)
      .catch(error => { historicalLayerCache.delete(snapshot.year); historicalTerritoryCache.delete(snapshot.year); throw error; });
    historicalLayerCache.set(snapshot.year, promise);
  }
  return {
    collection: await historicalLayerCache.get(snapshot.year),
    sourceYear: snapshot.year,
    exact: snapshot.year === numericYear,
    source: "Historical Basemaps · GPL-3.0"
  };
}

export async function loadAdministrativeBoundaries(year, zoom = 1, fetcher = globalThis.fetch) {
  if (Number(year) < 2026) return null;
  if (Number(zoom) >= 4) {
    if (!regionalAdminPromise) regionalAdminPromise = readCollection(REGIONAL_ADMIN_URL, "Frontières administratives régionales 1:10m", fetcher);
    return regionalAdminPromise;
  }
  if (!modernAdminPromise) modernAdminPromise = readCollection(MODERN_ADMIN_URL, "Frontières administratives mondiales 1:110m", fetcher);
  return modernAdminPromise;
}
