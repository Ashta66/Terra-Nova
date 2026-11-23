const REGIONAL_ZOOM_THRESHOLD = 4;
const CACHE_NAME = "terra-nova-regional-map";
const CACHE_VERSION = 1;
const REGIONAL_ASSETS = [
  { key: "ne_10m_land.geojson", source: "ne_10m_land.geojson", label: "Côtes et terres" },
  { key: "ne_10m_rivers.geojson", source: "ne_10m_rivers_lake_centerlines.geojson", label: "Rivières" },
  { key: "ne_10m_map_labels.geojson", source: "ne_10m_populated_places_simple.geojson", label: "Villes et repères" }
];
const REGIONAL_ASSET_BY_KEY = new Map(REGIONAL_ASSETS.map(asset => [asset.key, asset]));
const REGIONAL_ASSET_IN_FLIGHT = new Map();
const NATURAL_EARTH_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const MAP_ASSET_CACHE = "terra-nova-map-assets-v1";
export const MAP_PACK_CORE_ASSETS = [
  { url: "./data/ne_110m_land.geojson", label: "Terres mondiales" },
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

export async function purgeObsoleteLakeCaches(){
 try{if(globalThis.caches){const cache=await caches.open(MAP_ASSET_CACHE);await cache.delete(absoluteCacheKey("./data/ne_110m_lakes.geojson"));}}catch(error){console.info("Nettoyage du cache des anciens lacs différé :",error);}
 try{const db=await openCache();await new Promise((resolve,reject)=>{const request=db.transaction("assets","readwrite").objectStore("assets").delete("ne_10m_lakes.geojson");request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});db.close();}catch(error){console.info("Nettoyage IndexedDB des anciens lacs ignoré :",error);}
}
export async function getMapPackStatus(){
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
  return { coreCount, coreTotal: MAP_PACK_CORE_ASSETS.length, regionalCount: regional.count, regionalTotal: 3, ready: coreCount === MAP_PACK_CORE_ASSETS.length && regional.ready };
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
    request.onblocked = () => reject(new Error("Le stockage cartographique est bloqué par un autre onglet."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
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
  if (!collection || typeof collection !== "object" || collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || !collection.features.length) {
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
    if (!name || !geometry || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)
      || !Number.isFinite(Number(geometry.coordinates[0])) || !Number.isFinite(Number(geometry.coordinates[1]))) continue;
    const rank = Number(property(properties, "scalerank", "SCALERANK") || 99);
    const population = Number(property(properties, "pop_max", "POP_MAX") || 0);
    if (!Number.isFinite(rank) || !Number.isFinite(population) || (rank > 7 && population < 300000)) continue;
    // Les très grandes villes arrivent en premier ; les villes secondaires
    // attendent un zoom plus rapproché pour éviter de surcharger la carte.
    const minZoom = rank <= 2 || population >= 2000000 ? 4 : rank <= 4 || population >= 750000 ? 6 : 9;
    features.push({
      type: "Feature",
      properties: { name: String(name), kind: "city", minZoom, population },
      geometry
    });
  }
  if (!features.length) throw new Error("Aucune ville exploitable n’a été trouvée dans les données Natural Earth.");
  return { type: "FeatureCollection", features };
}

/** Prépare les couches régionales avant leur seuil réel d'affichage. */
export function getRegionalWarmupProfile(zoom) {
  const level = Number(zoom) || 1;
  return { labels: level >= 3.2, land: level >= 5.2, rivers: level >= 7.2 };
}

export function selectMapLayerDetailLevel(zoom, worldFeatures, regionalFeatures = null, threshold = REGIONAL_ZOOM_THRESHOLD) {
  const useRegional = Number.isFinite(zoom) && zoom >= threshold
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
  const key = String(url).split(/[?#]/, 1)[0].split("/").pop();
  const inFlightKey = key + "|" + String(url);
  const pending = REGIONAL_ASSET_IN_FLIGHT.get(inFlightKey);
  if (pending) return pending;
  const request = (async () => {
    try {
      const cached = await readCachedText(key);
      if (cached) return parseFeatureCollection(cached, key);
    } catch (error) {
      if (globalThis.indexedDB) console.warn("Cache cartographique indisponible :", error);
    }
    const asset = REGIONAL_ASSET_BY_KEY.get(key);
    const sourceUrl = asset ? NATURAL_EARTH_BASE + asset.source : url;
    try {
      const response = await fetcher(sourceUrl);
      if (!response || !response.ok) return null;
      let collection = await response.json();
      if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) return null;
      if (asset?.key === "ne_10m_map_labels.geojson") collection = buildRegionalCityLabels(collection);
      try { await writeCachedText(key, JSON.stringify(collection)); } catch { /* cache facultatif */ }
      return collection;
    } catch {
      return null;
    }
  })();
  REGIONAL_ASSET_IN_FLIGHT.set(inFlightKey, request);
  try { return await request; }
  finally { if (REGIONAL_ASSET_IN_FLIGHT.get(inFlightKey) === request) REGIONAL_ASSET_IN_FLIGHT.delete(inFlightKey); }
}

export async function getRegionalCacheStatus() {
  const keys = REGIONAL_ASSETS.map(asset => asset.key);
  const cached = await Promise.all(keys.map(async key => {
    try { return Boolean(await readCachedText(key)); } catch { return false; }
  }));
  const count = cached.filter(Boolean).length;
  return { count, ready: count === keys.length };
}

let regionalWarmupPromise = null;
const regionalWarmupListeners = new Set();

/** Télécharge en arrière-plan les quatre couches régionales et les conserve dans IndexedDB. */
export function warmRegionalMapCache(onProgress = () => {}, fetcher = globalThis.fetch) {
  if (typeof onProgress === "function") regionalWarmupListeners.add(onProgress);
  if (regionalWarmupPromise) return regionalWarmupPromise;
  const notify = progress => {
    for (const listener of regionalWarmupListeners) {
      try { listener(progress); } catch (error) { console.warn("Suivi du préchargement cartographique indisponible :", error); }
    }
  };
  regionalWarmupPromise = downloadRegionalMapData(notify, fetcher)
    .finally(() => { regionalWarmupPromise = null; regionalWarmupListeners.clear(); });
  return regionalWarmupPromise;
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


/**
 * Stabilise les changements de source LOD autour d'un seuil.
 * Le niveau régional est activé légèrement après le seuil nominal et conservé
 * jusqu'au passage sous le seuil inverse, ce qui évite les bascules répétées
 * lorsque le zoom oscille de quelques centièmes autour de la limite.
 */
export function createMapLayerLodSelector(hysteresis = 0.18) {
  const margin = Number.isFinite(hysteresis) ? Math.max(0, hysteresis) / 2 : 0.09;
  const levels = new Map();

  function select(zoom, worldFeatures, regionalFeatures = null, threshold = REGIONAL_ZOOM_THRESHOLD) {
    const hasRegional = regionalFeatures?.type === "FeatureCollection" && Array.isArray(regionalFeatures.features);
    const current = levels.get(threshold);
    let useRegional = current === "regional-10m"
      ? Number.isFinite(zoom) && zoom >= threshold - margin
      : Number.isFinite(zoom) && zoom >= threshold + margin;
    if (!hasRegional) useRegional = false;
    const level = useRegional ? "regional-10m" : "world-110m";
    levels.set(threshold, level);
    return {
      level,
      features: useRegional ? regionalFeatures : worldFeatures,
      isFallback: !useRegional && Number.isFinite(zoom) && zoom >= threshold
    };
  }

  function reset() {
    levels.clear();
  }

  return { select, reset };
}
