import test from "node:test";
import assert from "node:assert/strict";
import { isMapTileRelevantToPlan, shouldRefreshRegionalLayer, isMapYearRequestCurrent } from "../src/world/map-async-result.js";

test("a tile completion is relevant when it belongs to the active plan", () => {
  const plan = { tiles: [{ key: "5/8/9", ancestors: [{ key: "4/4/4" }, { key: "3/2/2" }] }] };
  assert.equal(isMapTileRelevantToPlan("5/8/9", plan), true);
  assert.equal(isMapTileRelevantToPlan("4/4/4", plan), true);
  assert.equal(isMapTileRelevantToPlan("3/2/2", plan), true);
  assert.equal(isMapTileRelevantToPlan("5/9/9", plan), false);
});
test("tile completion guards reject malformed or missing plans", () => {
  assert.equal(isMapTileRelevantToPlan("", { tiles: [] }), false);
  assert.equal(isMapTileRelevantToPlan("2/1/1", null), false);
  assert.equal(isMapTileRelevantToPlan("2/1/1", { tiles: [{}] }), false);
});
test("regional data is retained but only refreshes a layer still useful at current zoom", () => {
  const profile = { land: false, rivers: true, labels: false };
  assert.equal(shouldRefreshRegionalLayer("land", profile), false);
  assert.equal(shouldRefreshRegionalLayer("rivers", profile), true);
  assert.equal(shouldRefreshRegionalLayer("labels", profile), false);
});
test("unknown and malformed regional layer profiles never request a refresh", () => {
  assert.equal(shouldRefreshRegionalLayer("unknown", { land: true }), false);
  assert.equal(shouldRefreshRegionalLayer("land", null), false);
  assert.equal(shouldRefreshRegionalLayer("land", { land: 1 }), false);
});
test("year results are accepted only for the current simulation year", () => {
  assert.equal(isMapYearRequestCurrent("1648", 1648), true);
  assert.equal(isMapYearRequestCurrent("1648", "1789"), false);
  assert.equal(isMapYearRequestCurrent("", "1789"), false);
  assert.equal(isMapYearRequestCurrent(null, "1789"), false);
});
