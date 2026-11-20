import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("le fond terrestre local est une FeatureCollection GeoJSON exploitable", async () => {
  const raw = await readFile(new URL("../data/ne_110m_land.geojson", import.meta.url), "utf8");
  const data = JSON.parse(raw);
  assert.equal(data.type, "FeatureCollection");
  assert.ok(data.features.length >= 100);
  for (const feature of data.features) {
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
    assert.ok(Array.isArray(feature.geometry.coordinates));
  }
});

test("les coordonnées du fond terrestre restent dans les plages géographiques", async () => {
  const raw = await readFile(new URL("../data/ne_110m_land.geojson", import.meta.url), "utf8");
  const data = JSON.parse(raw);
  let checked = 0;
  for (const feature of data.features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) for (const point of ring) {
      assert.ok(Number.isFinite(point[0]) && point[0] >= -180 && point[0] <= 180);
      assert.ok(Number.isFinite(point[1]) && point[1] >= -90 && point[1] <= 90);
      checked++;
    }
  }
  assert.ok(checked > 1000);
});
