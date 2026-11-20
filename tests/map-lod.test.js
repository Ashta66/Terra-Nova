import test from "node:test";
import assert from "node:assert/strict";
import { loadOptionalGeoJson, selectLandDetailLevel, selectMapLayerDetailLevel, REGIONAL_ZOOM_THRESHOLD_VALUE, REGIONAL_LAKES_DATA_PATH, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH } from "../src/world/map-lod.js";

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
