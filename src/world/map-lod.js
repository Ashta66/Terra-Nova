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
const MAP_ASSET_CACHE = "terra-nova-map-assets-v1";
export const MAP_PACK_CORE_ASSETS = [
  { url: "./data/ne_110m_land.geojson", label: "Terres mondiales" },
  { url: "./data/ne_110m_lakes.geojson", label: "Lacs mondiaux" },
  { url: "./data/ne_110m_rivers.geojson", label: "Rivières mondiales" },
  { url: "./data/ne_110m_glaciated_areas.geojson", label: "Zones glaciaires" },
  { url: "./data/ne_110m_elevation_points.geojson", label: "Repères de relief" },
  { url: "./data/ne_110m_map_labels.geojson", label: "Noms géographiques" },
  { url: "./data/terrain/etopo_global_10m_i16.bin", label: "Relief ETOPO" }
];


function absoluteCacheKey(url) {
  return globalThis.location ? new URL(url, globalThis.location.href).href : url;
}

export async function fetchMapAsset(url, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") throw new Error("Le navigateur ne permet pas les téléchargements.");
  let cache = null;
  const key = absoluteCacheKey(url);
  try {
    if (globalThis.caches) {
      cache = await caches.open(MAP_ASSET_CACHE);
      const cached = await cache.match(key);
      if (cached) return cached;
    }
  } catch (error) {
    console.warn("Cache cartographique indisponible :", error);
  }
  const response = await fetcher(url);
  if (response && response.ok && cache) {
    try { await cache.put(key, response.clone()); }
    catch (error) { console.warn("Impossible de conserver la ressource cartographique :", error); }
  }
  return response;
}

export async function getMapPackStatus() {
  let coreCount = 0;
  if (globalThis.caches) {
    try {
      const cache = await caches.open(MAP_ASSET_CACHE);
      const checks = await Promise.all(MAP_PACK_CORE_ASSETS.map(asset => cache.match(absoluteCacheKey(asset.url))));
      coreCount = checks.filter(Boolean).length;
    } catch (error) {
      console.warn("État du cache cartographique indisponible :", error);
    }
  }
  const regional = await getRegionalCacheStatus();
  return { coreCount, coreTotal: MAP_PACK_CORE_ASSETS.length, regionalCount: regional.count, regionalTotal: 4, ready: coreCount === MAP_PACK_CORE_ASSETS.length && regional.ready };
}

export async function downloadFullMapPack(onProgress = () => {}, fetcher = globalThis.fetch) {
  if (!globalThis.caches) throw new Error("Le stockage durable du navigateur n’est pas disponible. Ouvre le jeu avec HTTPS ou un serveur local récent.");
  const cache = await caches.open(MAP_ASSET_CACHE);
  const coreTotal = MAP_PACK_CORE_ASSETS.length;
  const regionalTotal = REGIONAL_ASSETS.length;
  for (let index = 0; index < MAP_PACK_CORE_ASSETS.length; index += 1) {
    const asset = MAP_PACK_CORE_ASSETS[index];
    const key = absoluteCacheKey(asset.url);
    let response = await cache.match(key);
    const alreadyCached = Boolean(response);
    if (!response) {
      response = await fetcher(asset.url);
      if (!response || !response.ok) throw new Error("Téléchargement impossible pour " + asset.label + " (HTTP " + (response ? response.status : "réseau") + ").");
      try { await cache.put(key, response.clone()); }
      catch { throw new Error("Espace de stockage insuffisant pour conserver " + asset.label + ". Libère de l’espace puis réessaie."); }
    }
    onProgress({ current: index + 1, total: coreTotal + regionalTotal, label: asset.label, cached: alreadyCached });
  }
  await downloadRegionalMapData(progress => onProgress({
    current: coreTotal + progress.current,
    total: coreTotal + regionalTotal,
    label: progress.label,
    cached: progress.cached
  }), fetcher);
  return { coreCount: coreTotal, regionalCount: regionalTotal };
}

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
  const total = REGIONAL_ASSETS.length;
  for (let index = 0; index < REGIONAL_ASSETS.length; index += 1) {
    const asset = REGIONAL_ASSETS[index];
    let text = await readCachedText(asset.key);
    const alreadyCached = Boolean(text);
    if (!text) {
      const response = await fetcher(NATURAL_EARTH_BASE + asset.source);
      if (!response || !response.ok) {
        throw new Error("Téléchargement impossible pour " + asset.label + " (HTTP " + (response ? response.status : "réseau") + ").");
      }
      text = await response.text();
      const sourceCollection = parseFeatureCollection(text, asset.label);
      if (asset.key === "ne_10m_map_labels.geojson") {
        text = JSON.stringify(buildRegionalCityLabels(sourceCollection));
        parseFeatureCollection(text, asset.label);
      }
      await writeCachedText(asset.key, text);
    } else {
      parseFeatureCollection(text, asset.label);
    }
    onProgress({ current: index + 1, total, label: asset.label, cached: alreadyCached });
  }
  return { count: total };
}

export const REGIONAL_LAND_DATA_PATH = "./data/ne_10m_land.geojson";
export const REGIONAL_LAKES_DATA_PATH = "./data/ne_10m_lakes.geojson";
export const REGIONAL_RIVERS_DATA_PATH = "./data/ne_10m_rivers.geojson";
export const REGIONAL_LABELS_DATA_PATH = "./data/ne_10m_map_labels.geojson";
export const REGIONAL_ZOOM_THRESHOLD_VALUE = REGIONAL_ZOOM_THRESHOLD;
