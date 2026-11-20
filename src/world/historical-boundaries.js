import { fetchMapAsset } from "./map-lod.js";

const HISTORICAL_INDEX_URL = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/index.json";
const HISTORICAL_GEOJSON_BASE = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/";
const MODERN_POLITICAL_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson";
const MODERN_ADMIN_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_1_states_provinces_lines.geojson";
let historicalIndexPromise = null;
const historicalLayerCache = new Map();
let modernPoliticalPromise = null;
let modernAdminPromise = null;

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
  const features = [];
  for (const feature of collection.features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    const lines = [];
    for (const polygon of polygons) {
      for (const ring of polygon) if (Array.isArray(ring) && ring.length > 1) lines.push(ring);
    }
    if (!lines.length) continue;
    features.push({
      type: "Feature",
      properties: { ...(feature.properties ?? {}), boundaryLayer: "political-historical" },
      geometry: { type: "MultiLineString", coordinates: lines }
    });
  }
  return { type: "FeatureCollection", features };
}

async function getHistoricalIndex(fetcher) {
  if (!historicalIndexPromise) {
    historicalIndexPromise = readCollection(HISTORICAL_INDEX_URL, "Index des frontières historiques", fetcher)
      .catch(async () => {
        const response = await fetchMapAsset(HISTORICAL_INDEX_URL, fetcher);
        if (!response?.ok) throw new Error("Index historique indisponible.");
        const data = await response.json();
        if (!Array.isArray(data?.years)) throw new Error("Index historique invalide.");
        return data;
      });
  }
  return historicalIndexPromise;
}

export async function loadPoliticalBoundaries(year, fetcher = globalThis.fetch) {
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) throw new TypeError("Année de frontière invalide.");
  if (numericYear >= 2011) {
    if (!modernPoliticalPromise) modernPoliticalPromise = readCollection(MODERN_POLITICAL_URL, "Frontières politiques actuelles", fetcher);
    return { collection: await modernPoliticalPromise, sourceYear: 2026, exact: true, source: "Natural Earth 1:110m" };
  }
  const index = await getHistoricalIndex(fetcher);
  const snapshot = selectHistoricalSnapshot(numericYear, index.years);
  if (!snapshot) return { collection: null, sourceYear: null, exact: false, source: "Aucune donnée historique" };
  if (!historicalLayerCache.has(snapshot.year)) {
    const promise = readCollection(HISTORICAL_GEOJSON_BASE + snapshot.filename, "Frontières historiques " + snapshot.year, fetcher)
      .then(historicalPolygonsToBoundaries)
      .catch(error => { historicalLayerCache.delete(snapshot.year); throw error; });
    historicalLayerCache.set(snapshot.year, promise);
  }
  return {
    collection: await historicalLayerCache.get(snapshot.year),
    sourceYear: snapshot.year,
    exact: snapshot.year === numericYear,
    source: "Historical Basemaps · GPL-3.0"
  };
}

export async function loadAdministrativeBoundaries(year, fetcher = globalThis.fetch) {
  if (Number(year) < 2011) return null;
  if (!modernAdminPromise) modernAdminPromise = readCollection(MODERN_ADMIN_URL, "Frontières administratives", fetcher);
  return modernAdminPromise;
}
