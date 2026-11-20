import test from "node:test";
import assert from "node:assert/strict";
import { loadOptionalGeoJson, selectLandDetailLevel, REGIONAL_ZOOM_THRESHOLD_VALUE } from "../src/world/map-lod.js";

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
