import test from "node:test";
import assert from "node:assert/strict";
import { compareMapBenchmarks } from "../scripts/compare-map-benchmarks.mjs";

function benchmark(mode, metrics, overrides = {}) {
  return {
    metadata: {
      scenario: "zoom-4-static",
      cache: "warm",
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      terrainRenderer: "webgl",
      geographicRendererMode: mode,
      ...overrides
    },
    metrics
  };
}

test("compare les médianes et p95 entre deux modes de rendu", () => {
  const result = compareMapBenchmarks(
    benchmark("canvas", { renderTotalMs: { median: 12, p95: 18 }, triangles: { median: 100, p95: 110 } }),
    benchmark("webgl", { renderTotalMs: { median: 8, p95: 11 }, triangles: { median: 100, p95: 110 } })
  );
  assert.equal(result.statistic, "median");
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.metrics[0], {
    name: "renderTotalMs", baseline: 12, candidate: 8, delta: -4,
    deltaPercent: -33.33333333333333, status: "compared"
  });
});

test("permet de sélectionner p95 et signale les métadonnées différentes", () => {
  const result = compareMapBenchmarks(
    benchmark("canvas", { renderTotalMs: { median: 10, p95: 20 } }),
    benchmark("webgl", { renderTotalMs: { median: 8, p95: 15 } }, { cache: "cold" }),
    { statistic: "p95" }
  );
  assert.equal(result.metrics[0].baseline, 20);
  assert.equal(result.metrics[0].candidate, 15);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /cache/);
});

test("marque les métriques absentes sans inventer de comparaison", () => {
  const result = compareMapBenchmarks(
    benchmark("canvas", { onlyCanvas: { median: 4 } }),
    benchmark("webgl", { onlyWebgl: { median: 2 } })
  );
  assert.equal(result.metrics.length, 2);
  assert.ok(result.metrics.every(metric => metric.status === "missing"));
  assert.ok(result.metrics.every(metric => metric.delta === null));
});

test("gère une référence nulle et avertit si les modes sont identiques", () => {
  const result = compareMapBenchmarks(
    benchmark("webgl", { uploads: { median: 0 } }),
    benchmark("webgl", { uploads: { median: 3 } })
  );
  assert.equal(result.metrics[0].delta, 3);
  assert.equal(result.metrics[0].deltaPercent, null);
  assert.match(result.warnings[0], /même renderer/);
});

test("refuse une statistique ou un export invalide", () => {
  assert.throws(() => compareMapBenchmarks({}, {}), /metadata/);
  assert.throws(() => compareMapBenchmarks(
    benchmark("canvas", { x: { median: 1 } }),
    benchmark("webgl", { x: { median: 2 } }),
    { statistic: "average" }
  ), /Statistique attendue/);
});
