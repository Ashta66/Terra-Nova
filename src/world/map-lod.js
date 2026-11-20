const REGIONAL_ZOOM_THRESHOLD = 4;
const CACHE_NAME = "terra-nova-regional-map";
const CACHE_VERSION = 1;
const REGIONAL_ASSETS = [
  { key: "ne_10m_land.geojson", source: "ne_10m_land.geojson", label: "Côtes et terres" },
  { key: "ne_10m_lakes.geojson", source: "ne_10m_lakes.geojson", label: "Lacs" },
  { key: "ne_10m_rivers.geojson", source: "ne_10m_rivers_lake_centerlines.geojson", label: "Rivières" },
  { key: "ne_10m_map_labels.geojson", source: "ne_10m_populated_places_simple.geojson", label: "Villes et repères" }
];
const NATURAL_EARTH_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";

function openCache() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Ce navigateur ne permet pas le stockage local des données. Utilisez une version récente de Chrome, Edge ou Firefox."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_NAME, CACHE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets")) request.result.createObjectStore("assets", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le stockage local."));
  });
}

async function readCachedText(key) {
  let db;
  try {
    db = await openCache();
    return await new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readonly").objectStore("assets").get(key);
      request.onsuccess = () => resolve(request.result ? request.result.text : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    if (db) db.close();
  }
}

async function writeCachedText(key, text) {
  const db = await openCache();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").put({ key, text, savedAt: Date.now() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Écriture interrompue."));
    });
  } finally {
    db.close();
  }
}

function parseFeatureCollection(text, label) {
  let collection;
  try {
    collection = JSON.parse(text);
  } catch {
    throw new Error("Le fichier " + label + " n’est pas un GeoJSON lisible.");
  }
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) {
    throw new Error("Le fichier " + label + " ne contient pas de données géographiques valides.");
  }
  return collection;
}

function property(properties, ...names) {
  for (const name of names) {
    const value = properties ? properties[name] : null;
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

export function buildRegionalCityLabels(places) {
  if (places.type !== "FeatureCollection" || !Array.isArray(places.features)) {
    throw new Error("La source des villes n’est pas une FeatureCollection valide.");
  }
  const features = [];
  for (const feature of places.features) {
    const properties = feature.properties || {};
    const geometry = feature.geometry;
    const name = property(properties, "name", "NAME", "nameascii");
    if (!name || !geometry || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) continue;
    const rank = Number(property(properties, "scalerank", "SCALERANK") || 99);
    const population = Number(property(properties, "pop_max", "POP_MAX") || 0);
    if (!Number.isFinite(rank) || !Number.isFinite(population) || (rank > 8 && population < 100000)) continue;
    const minZoom = rank <= 4 || population >= 1000000 ? 4 : rank <= 6 || population >= 250000 ? 6 : 8;
    features.push({
      type: "Feature",
      properties: { name: String(name), kind: "city", minZoom, population },
      geometry
    });
  }
  if (!features.length) throw new Error("Aucune ville exploitable n’a été trouvée dans les données Natural Earth.");
  return { type: "FeatureCollection", features };
}

export function selectMapLayerDetailLevel(zoom, worldFeatures, regionalFeatures = null) {
  const useRegional = Number.isFinite(zoom) && zoom >= REGIONAL_ZOOM_THRESHOLD
    && regionalFeatures && regionalFeatures.type === "FeatureCollection"
    && Array.isArray(regionalFeatures.features);
  return {
    level: useRegional ? "regional-10m" : "world-110m",
    features: useRegional ? regionalFeatures : worldFeatures,
    isFallback: !useRegional && Number.isFinite(zoom) && zoom >= REGIONAL_ZOOM_THRESHOLD
  };
}

export function selectLandDetailLevel(zoom, worldFeatures, regionalFeatures = null) {
  return selectMapLayerDetailLevel(zoom, worldFeatures, regionalFeatures);
}

export async function loadOptionalGeoJson(url, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") return null;
  const key = url.split("/").pop();
  try {
    const cached = await readCachedText(key);
    if (cached) return parseFeatureCollection(cached, key);
  } catch (error) {
    if (globalThis.indexedDB) console.warn("Cache cartographique indisponible :", error);
  }
  try {
    const response = await fetcher(url);
    if (!response || !response.ok) return null;
    const collection = await response.json();
    if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return null;
    return collection;
  } catch {
    return null;
  }
}

export async function getRegionalCacheStatus() {
  const keys = REGIONAL_ASSETS.map(asset => asset.key);
  const cached = await Promise.all(keys.map(async key => {
    try { return Boolean(await readCachedText(key)); } catch { return false; }
  }));
  const count = cached.filter(Boolean).length;
  return { count, ready: count === keys.length };
}

export async function downloadRegionalMapData(onProgress = () => {}, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") throw new Error("Le navigateur ne permet pas les téléchargements.");
  if (!globalThis.indexedDB) throw new Error("Le stockage local du navigateur est indisponible. Activez les données du site dans les paramètres du navigateur.");
  const collections = new Map();
  const total = REGIONAL_ASSETS.length;
  for (let index = 0; index < REGIONAL_ASSETS.length; index += 1) {
    const asset = REGIONAL_ASSETS[index];
    let text = await readCachedText(asset.key);
    if (!text) {
      onProgress({ current: index + 1, total, label: asset.label });
      const response = await fetcher(NATURAL_EARTH_BASE + asset.source);
      if (!response || !response.ok) {
        throw new Error("Téléchargement impossible pour " + asset.label + " (HTTP " + (response ? response.status : "réseau") + ").");
      }
      text = await response.text();
      const sourceCollection = parseFeatureCollection(text, asset.label);
      if (asset.key === "ne_10m_map_labels.geojson") {
        text = JSON.stringify(buildRegionalCityLabels(sourceCollection));
      }
      parseFeatureCollection(text, asset.label);
      await writeCachedText(asset.key, text);
    }
    collections.set(asset.key, parseFeatureCollection(text, asset.label));
    onProgress({ current: index + 1, total, label: asset.label });
  }
  return [
    collections.get("ne_10m_land.geojson"),
    collections.get("ne_10m_lakes.geojson"),
    collections.get("ne_10m_rivers.geojson"),
    collections.get("ne_10m_map_labels.geojson")
  ];
}

export const REGIONAL_LAND_DATA_PATH = "./data/ne_10m_land.geojson";
export const REGIONAL_LAKES_DATA_PATH = "./data/ne_10m_lakes.geojson";
export const REGIONAL_RIVERS_DATA_PATH = "./data/ne_10m_rivers.geojson";
export const REGIONAL_LABELS_DATA_PATH = "./data/ne_10m_map_labels.geojson";
export const REGIONAL_ZOOM_THRESHOLD_VALUE = REGIONAL_ZOOM_THRESHOLD;
