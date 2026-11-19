import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const url = new URL("../data/ne_110m_land.geojson", import.meta.url);

test("les données Natural Earth locales forment une carte mondiale GeoJSON valide", async () => {
  const world = JSON.parse(await readFile(url, "utf8"));
  assert.equal(world.type, "FeatureCollection");
  assert.ok(world.features.length >= 100, "la couche doit couvrir les grandes terres du monde");
  for (const feature of world.features) {
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
  }
});

test("les coordonnées de la couche mondiale restent dans les limites géographiques", async () => {
  const world = JSON.parse(await readFile(url, "utf8"));
  const inspect = value => {
    if (typeof value[0] === "number") {
      assert.ok(Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180);
      assert.ok(Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90);
      return;
    }
    for (const child of value) inspect(child);
  };
  for (const feature of world.features) inspect(feature.geometry.coordinates);
});
