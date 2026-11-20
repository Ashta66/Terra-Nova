import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionalCityLabels, loadOptionalGeoJson, selectLandDetailLevel, selectMapLayerDetailLevel, MAP_PACK_CORE_ASSETS, REGIONAL_ZOOM_THRESHOLD_VALUE, REGIONAL_LAKES_DATA_PATH, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH } from "../src/world/map-lod.js";
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

test("le chargement facultatif ignore erreurs HTTP, JSON et réseau", async () => {
  assert.equal(await loadOptionalGeoJson("./missing.geojson", async () => ({ ok: false })), null);
  assert.equal(await loadOptionalGeoJson("./invalid.geojson", async () => ({
    ok: true, json: async () => ({ type: "Feature", geometry: null })
  })), null);
  assert.equal(await loadOptionalGeoJson("./offline.geojson", async () => { throw new Error("offline"); }), null);
});

test("le même sélecteur LOD commute les lacs, rivières et labels régionaux", () => {
  for (const path of [REGIONAL_LAKES_DATA_PATH, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH]) {
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


test("les labels régionaux filtrent les villes et calculent leur seuil de zoom", () => {
  const places = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { name: "Paris", scalerank: 2, pop_max: 2000000 }, geometry: { type: "Point", coordinates: [2.3, 48.8] } },
    { type: "Feature", properties: { name: "Ville moyenne", scalerank: 6, pop_max: 300000 }, geometry: { type: "Point", coordinates: [1, 2] } },
    { type: "Feature", properties: { name: "Hameau", scalerank: 10, pop_max: 100 }, geometry: { type: "Point", coordinates: [3, 4] } }
  ] };
  const labels = buildRegionalCityLabels(places);
  assert.equal(labels.features.length, 2);
  assert.equal(labels.features[0].properties.minZoom, 4);
  assert.equal(labels.features[1].properties.minZoom, 6);
});


test("le pack cartographique comprend les six couches mondiales et le relief ETOPO", () => {
  assert.equal(MAP_PACK_CORE_ASSETS.length, 7);
  assert.ok(MAP_PACK_CORE_ASSETS.some(asset => asset.url.endsWith("etopo_global_10m_i16.bin")));
  assert.ok(MAP_PACK_CORE_ASSETS.some(asset => asset.url.endsWith("ne_110m_glaciated_areas.geojson")));
});


test("la navigation mondiale se recentre et la caméra régionale conserve sa longitude cyclique", async () => {
  const { constrainEquirectangularViewport } = await import("../src/world/projection.js");
  const world = constrainEquirectangularViewport({ zoom: 1, centerLongitude: 999, centerLatitude: -999 }, 24);
  assert.equal(Math.abs(world.centerLongitude), 0);
  assert.equal(world.centerLatitude, 0);
  const regional = constrainEquirectangularViewport({ zoom: 24, centerLongitude: 999, centerLatitude: -999 }, 24);
  assert.equal(regional.centerLongitude, 999);
  assert.ok(regional.centerLatitude >= -86.25);
  assert.equal(regional.zoom, 24);
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
