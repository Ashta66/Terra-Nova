import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const datasets = [
  ["terres", new URL("../data/ne_110m_land.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 100],
  ["lacs", new URL("../data/ne_110m_lakes.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 10],
  ["rivières", new URL("../data/ne_110m_rivers.geojson", import.meta.url), ["LineString", "MultiLineString"], 5],
  ["glaciers", new URL("../data/ne_110m_glaciated_areas.geojson", import.meta.url), ["Polygon", "MultiPolygon"], 5],
  ["repères d'altitude", new URL("../data/ne_110m_elevation_points.geojson", import.meta.url), ["Point"], 10]
];

for (const [label, url, geometryTypes, minimum] of datasets) {
  test(`la couche Natural Earth locale « ${label} » est un GeoJSON valide`, async () => {
    const collection = JSON.parse(await readFile(url, "utf8"));
    assert.equal(collection.type, "FeatureCollection");
    assert.ok(collection.features.length >= minimum);
    for (const feature of collection.features) assert.ok(geometryTypes.includes(feature.geometry?.type));
  });
}

test("les coordonnées de toutes les couches restent dans les limites géographiques", async () => {
  const inspect = value => {
    if (typeof value[0] === "number") {
      assert.ok(Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180);
      assert.ok(Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90);
      return;
    }
    for (const child of value) inspect(child);
  };
  for (const [, url] of datasets) {
    const collection = JSON.parse(await readFile(url, "utf8"));
    for (const feature of collection.features) inspect(feature.geometry.coordinates);
  }
});

test("les points d'altitude disposent de valeurs numériques plausibles", async () => {
  const collection = JSON.parse(await readFile(datasets[4][1], "utf8"));
  for (const feature of collection.features) {
    assert.ok(Number.isFinite(feature.properties.elevation_m));
    assert.ok(feature.properties.elevation_m >= -500 && feature.properties.elevation_m <= 9000);
  }
});
