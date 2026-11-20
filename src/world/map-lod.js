const REGIONAL_ZOOM_THRESHOLD = 4;

export function selectLandDetailLevel(zoom, worldFeatures, regionalFeatures = null) {
  const useRegional = Number.isFinite(zoom) && zoom >= REGIONAL_ZOOM_THRESHOLD
    && regionalFeatures?.type === "FeatureCollection"
    && Array.isArray(regionalFeatures.features);
  return {
    level: useRegional ? "regional-10m" : "world-110m",
    features: useRegional ? regionalFeatures : worldFeatures,
    isFallback: !useRegional && Number.isFinite(zoom) && zoom >= REGIONAL_ZOOM_THRESHOLD
  };
}

export async function loadOptionalGeoJson(url, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") return null;
  try {
    const response = await fetcher(url);
    if (!response?.ok) return null;
    const collection = await response.json();
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) return null;
    return collection;
  } catch {
    return null;
  }
}

export const REGIONAL_LAND_DATA_PATH = "./data/ne_10m_land.geojson";
export const REGIONAL_ZOOM_THRESHOLD_VALUE = REGIONAL_ZOOM_THRESHOLD;
