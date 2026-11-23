import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionalCityLabels, loadOptionalGeoJson, selectLandDetailLevel, selectMapLayerDetailLevel, getRegionalWarmupProfile, MAP_PACK_CORE_ASSETS, REGIONAL_ZOOM_THRESHOLD_VALUE, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH } from "../src/world/map-lod.js";
import { projectEquirectangular, constrainEquirectangularViewport } from "../src/world/projection.js";
import { buildGeoSpatialIndex, queryGeoSpatialIndex } from "../src/world/geo-spatial-index.js";

const world = { type: "FeatureCollection", features: [{ id: "world" }] };
const regional = { type: "FeatureCollection", features: [{ id: "regional" }] };

test("la carte mondiale reste utilisée avant le seuil de détail régional", () => {
  assert.equal(REGIONAL_ZOOM_THRESHOLD_VALUE, 4);
  assert.equal(selectLandDetailLevel(1, world, regional).level, "world-110m");
  assert.equal(selectLandDetailLevel(3.99, world, regional).features, world);
});

test("les données régionales remplacent le fond mondial à partir de 4×", () => {
  const selected = selectLandDetailLevel(4, world, regional);
  assert.equal(selected.level, "regional-10m");
  assert.equal(selected.features, regional);
  assert.equal(selected.isFallback, false);
});

test("le fond mondial sert de repli si le jeu régional est absent", () => {
  const selected = selectLandDetailLevel(12, world, null);
  assert.equal(selected.level, "world-110m");
  assert.equal(selected.features, world);
  assert.equal(selected.isFallback, true);
});

test("le chargement facultatif accepte une FeatureCollection valide", async () => {
  const loaded = await loadOptionalGeoJson("./regional.geojson", async () => ({
    ok: true,
    json: async () => regional
  }));
  assert.equal(loaded, regional);
});

test("la couche régionale de rivières peut être chargée directement à la demande", async () => {
  let requested = "";
  const loaded = await loadOptionalGeoJson(REGIONAL_RIVERS_DATA_PATH, async url => {
    requested = url;
    return { ok: true, json: async () => regional };
  });
  assert.match(requested, /ne_10m_rivers_lake_centerlines\.geojson$/);
  assert.equal(loaded, regional);
});

test("le chargement facultatif ignore erreurs HTTP, JSON et réseau", async () => {
  assert.equal(await loadOptionalGeoJson("./missing.geojson", async () => ({ ok: false })), null);
  assert.equal(await loadOptionalGeoJson("./invalid.geojson", async () => ({
    ok: true, json: async () => ({ type: "Feature", geometry: null })
  })), null);
  assert.equal(await loadOptionalGeoJson("./offline.geojson", async () => { throw new Error("offline"); }), null);
});

test("le même sélecteur LOD commute les lacs, rivières et labels régionaux", () => {
  for (const path of [REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH]) {
    assert.match(path, /^\.\/data\/ne_10m_/);
  }
  const regional = selectMapLayerDetailLevel(4, world, { ...world, features: [{ id: "regional-hydro" }] });
  assert.equal(regional.level, "regional-10m");
  assert.equal(regional.features.features[0].id, "regional-hydro");
  const fallback = selectMapLayerDetailLevel(24, world, null);
  assert.equal(fallback.features, world);
  assert.equal(fallback.isFallback, true);
});

test("les couches régionales restent inutilisées avant le seuil", () => {
  const selected = selectMapLayerDetailLevel(3.99, world, regional);
  assert.equal(selected.features, world);
  assert.equal(selected.isFallback, false);
});

test("chaque famille de couche peut avoir son propre seuil de détail régional", () => {
  assert.equal(selectMapLayerDetailLevel(5.9, world, regional, 6).features, world);
  assert.equal(selectMapLayerDetailLevel(6, world, regional, 6).features, regional);
  assert.equal(selectMapLayerDetailLevel(7, world, regional, 8).features, world);
});


test("les labels régionaux filtrent les villes et calculent leur seuil de zoom", () => {
  const places = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Paris", scalerank: 2, pop_max: 2000000 }, geometry: { type: "Point", coordinates: [2.3, 48.8] } },
    { type: "Feature", properties: { name: "Grande ville", scalerank: 3, pop_max: 800000 }, geometry: { type: "Point", coordinates: [1, 2] } },
    { type: "Feature", properties: { name: "Ville secondaire", scalerank: 6, pop_max: 300000 }, geometry: { type: "Point", coordinates: [3, 4] } },
    { type: "Feature", properties: { name: "Petite ville", scalerank: 8, pop_max: 200000 }, geometry: { type: "Point", coordinates: [4, 5] } },
    { type: "Feature", properties: { name: "Hameau", scalerank: 10, pop_max: 100 }, geometry: { type: "Point", coordinates: [5, 6] } }
  ] };
  const labels = buildRegionalCityLabels(places);
  assert.equal(labels.features.length, 3);
  assert.deepEqual(labels.features.map(feature => feature.properties.minZoom), [4, 6, 9]);
});


test("le pack cartographique exclut les fichiers lacustres bruts du cache navigateur", () => {
  assert.equal(MAP_PACK_CORE_ASSETS.length, 6);
  assert.ok(!MAP_PACK_CORE_ASSETS.some(asset => asset.url.endsWith("ne_110m_lakes.geojson")));
  assert.ok(MAP_PACK_CORE_ASSETS.some(asset => asset.url.endsWith("etopo_global_10m_i16.bin")));
  assert.ok(MAP_PACK_CORE_ASSETS.some(asset => asset.url.endsWith("ne_110m_glaciated_areas.geojson")));
});


test("la navigation mondiale se recentre et la caméra régionale conserve sa longitude cyclique", async () => {
  const { constrainEquirectangularViewport } = await import("../src/world/projection.js");
  const world = constrainEquirectangularViewport({ zoom: 1, centerLongitude: 999, centerLatitude: -999 }, 20);
  assert.equal(Math.abs(world.centerLongitude), 0);
  assert.equal(Math.abs(world.centerLatitude), 0);
  const regional = constrainEquirectangularViewport({ zoom: 20, centerLongitude: 999, centerLatitude: -999 }, 20);
  assert.equal(regional.centerLongitude, 999);
  assert.ok(regional.centerLatitude >= -85.5);
  assert.equal(regional.zoom, 20);
});


test("la projection rapproche Alaska et Russie au voisinage de l'antiméridien", () => {
  const viewport = { zoom: 4, centerLongitude: 180, centerLatitude: 60 };
  const alaska = projectEquirectangular(-170, 60, 800, 400, viewport);
  const russia = projectEquirectangular(170, 60, 800, 400, viewport);
  assert.ok(Math.abs(alaska.x - 400) < 100);
  assert.ok(Math.abs(russia.x - 400) < 100);
  assert.ok(alaska.x > russia.x);
});

test("la caméra traverse ±180° sans borner la longitude et revient au centre au zoom mondial", () => {
  const regional = constrainEquirectangularViewport({ zoom: 5, centerLongitude: 545, centerLatitude: 0 });
  assert.equal(regional.centerLongitude, 545);
  const world = constrainEquirectangularViewport({ zoom: 1, centerLongitude: 545, centerLatitude: 0 });
  assert.equal(Math.abs(world.centerLongitude), 0);
});

test("l'index spatial sélectionne les deux côtés de l'antiméridien sans dupliquer les entités", () => {
  const collection = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Alaska" }, geometry: { type: "Point", coordinates: [-170, 60] } },
    { type: "Feature", properties: { name: "Russie orientale" }, geometry: { type: "Point", coordinates: [170, 60] } },
    { type: "Feature", properties: { name: "Europe" }, geometry: { type: "Point", coordinates: [10, 50] } }
  ] };
  const selected = queryGeoSpatialIndex(buildGeoSpatialIndex(collection), { zoom: 4, centerLongitude: 180, centerLatitude: 60 });
  assert.deepEqual(selected.features.map(feature => feature.properties.name).sort(), ["Alaska", "Russie orientale"]);
  assert.equal(new Set(selected.features).size, selected.features.length);
});


test("les couches régionales sont préchauffées avant leur seuil d'affichage", () => {
  assert.deepEqual(getRegionalWarmupProfile(3.19), { labels: false, land: false, rivers: false });
  assert.deepEqual(getRegionalWarmupProfile(3.2), { labels: true, land: false, rivers: false });
  assert.deepEqual(getRegionalWarmupProfile(5.2), { labels: true, land: true, rivers: false });
  assert.deepEqual(getRegionalWarmupProfile(7.2), { labels: true, land: true, rivers: true });
});

test("le préchauffage ne change pas les seuils de rendu des couches régionales", () => {
  assert.equal(selectMapLayerDetailLevel(5.9, world, regional, 6).features, world);
  assert.equal(selectMapLayerDetailLevel(6, world, regional, 6).features, regional);
  assert.equal(selectMapLayerDetailLevel(7.9, world, regional, 8).features, world);
  assert.equal(selectMapLayerDetailLevel(8, world, regional, 8).features, regional);
});


test("le sélecteur LOD applique une hystérésis autour du seuil régional", async () => {
  const { createMapLayerLodSelector } = await import("../src/world/map-lod.js");
  const selector = createMapLayerLodSelector(0.2);
  assert.equal(selector.select(6.05, world, regional, 6).level, "world-110m");
  assert.equal(selector.select(6.11, world, regional, 6).level, "regional-10m");
  assert.equal(selector.select(6.02, world, regional, 6).level, "regional-10m");
  assert.equal(selector.select(5.89, world, regional, 6).level, "world-110m");
});

test("le sélecteur LOD conserve le repli mondial si les données régionales manquent", async () => {
  const { createMapLayerLodSelector } = await import("../src/world/map-lod.js");
  const selector = createMapLayerLodSelector(0.2);
  assert.equal(selector.select(8, world, null, 6).features, world);
  assert.equal(selector.select(8, world, regional, 6).level, "regional-10m");
  selector.reset();
  assert.equal(selector.select(6.05, world, regional, 6).level, "world-110m");
});


test("les requêtes GeoJSON concurrentes pour une même ressource sont mutualisées", async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fetcher = async () => {
    calls++;
    await gate;
    return { ok: true, json: async () => regional };
  };
  const first = loadOptionalGeoJson("./shared-regional.geojson", fetcher);
  const second = loadOptionalGeoJson("./shared-regional.geojson", fetcher);
  await Promise.resolve();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(a.features[0].id, "regional");
});

test("une URL régionale avec paramètres conserve la bonne clé de ressource", async () => {
  let requested = "";
  const loaded = await loadOptionalGeoJson("./data/ne_10m_rivers.geojson?v=2", async url => {
    requested = url;
    return { ok: true, json: async () => regional };
  });
  assert.match(requested, /ne_10m_rivers_lake_centerlines\\.geojson$/);
  assert.equal(loaded, regional);
});

test("les labels régionaux ignorent les coordonnées non finies", () => {
  const places = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Paris", scalerank: 2, pop_max: 2000000 }, geometry: { type: "Point", coordinates: [2.3, 48.8] } },
    { type: "Feature", properties: { name: "Coordonnée invalide", scalerank: 1, pop_max: 5000000 }, geometry: { type: "Point", coordinates: [NaN, 48] } },
    { type: "Feature", properties: { name: "Latitude absente", scalerank: 1, pop_max: 5000000 }, geometry: { type: "Point", coordinates: [2] } }
  ] };
  const labels = buildRegionalCityLabels(places);
  assert.deepEqual(labels.features.map(feature => feature.properties.name), ["Paris"]);
});

test("les réponses GeoJSON mal formées sont ignorées sans fuite de requête en attente", async () => {
  const url = "./malformed-regional.geojson";
  assert.equal(await loadOptionalGeoJson(url, async () => ({ ok: true, json: async () => null })), null);
  const recovered = await loadOptionalGeoJson(url, async () => ({ ok: true, json: async () => regional }));
  assert.equal(recovered, regional);
});
