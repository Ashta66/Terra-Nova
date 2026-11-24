import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { compareMapBenchmarks } from "../scripts/compare-map-benchmarks.mjs";
import { createMapBenchmarkCollector } from "../src/world/map-benchmark.js";

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


test("exporte les métadonnées permettant de distinguer un navigateur PC d'une émulation mobile", () => {
  let now = 0;
  const environment = {
    performance: { now: () => now },
    navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/158.0.0.0 Safari/537.36", maxTouchPoints: 0 },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
    visualViewport: { scale: 1 },
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1
  };
  const collector = createMapBenchmarkCollector({ environment });
  collector.start({ scenario: "desktop-validation", cache: "warm" });
  now = 16;
  collector.record({ totalRenderMs: 16, terrainRenderer: "webgl" });
  const result = collector.exportResults();
  assert.equal(result.metadata.viewportWidth, 1440);
  assert.equal(result.metadata.screenWidth, 1920);
  assert.equal(result.metadata.screenHeight, 1080);
  assert.equal(result.metadata.visualViewportScale, 1);
  assert.equal(result.metadata.maxTouchPoints, 0);
  assert.equal(result.metadata.mobileUserAgent, false);
});


test("enregistre le cycle de vie du préchauffage LOD sans confondre planification et exécution", () => {
  let now = 0;
  const environment = { performance: { now: () => now }, navigator: { userAgent: "test" }, screen: {}, visualViewport: {} };
  const collector = createMapBenchmarkCollector({ environment });
  collector.start();
  now = 10;
  collector.record({ totalRenderMs: 10, lodWarmupDiagnostics: {
    scheduled: 2, started: 1, completed: 1, generated: 1, cancelled: 1, failed: 0, completedJobs: 1
  }});
  const metrics = collector.exportResults().metrics;
  assert.equal(metrics["lod:warmup:scheduled"].median, 2);
  assert.equal(metrics["lod:warmup:started"].median, 1);
  assert.equal(metrics["lod:warmup:generated"].median, 1);
  assert.equal(metrics["lod:warmup:cancelled"].median, 1);
  assert.equal(metrics["lod:warmup:failed"].median, 0);
});


test("exporte des métriques distinctes pour les familles physique, politique et dynamique", () => {
  let now = 0;
  const environment = { performance: { now: () => now }, navigator: { userAgent: "test" }, screen: {}, visualViewport: {} };
  const collector = createMapBenchmarkCollector({ environment });
  collector.start();
  now = 12;
  collector.record({ totalRenderMs: 12, renderFamilies: {
    physicalMs: 4.5, politicalMs: 2.25, dynamicMs: 1.5
  }});
  const metrics = collector.exportResults().metrics;
  assert.equal(metrics["family:physicalMs"].median, 4.5);
  assert.equal(metrics["family:politicalMs"].median, 2.25);
  assert.equal(metrics["family:dynamicMs"].median, 1.5);
});

test("exporte les métriques de couverture et d'attente des tuiles de relief", () => {
  let now = 0;
  const environment = { performance: { now: () => now }, navigator: { userAgent: "test" }, screen: {}, visualViewport: {} };
  const collector = createMapBenchmarkCollector({ environment });
  collector.start();
  now = 10;
  collector.record({ totalRenderMs: 10, terrainTileStats: {
    tileCount: 8, pendingCount: 2, visibleTiles: 6, preloadedTiles: 3, lod: 1,
    transitionProgress: 0.5, atlasCapacity: 32, atlasMemoryBytes: 1048576,
    readyChildTiles: 4, pendingChildTiles: 2, waitingForTiles: true, capacityLimited: false
  }});
  const metrics = collector.exportResults().metrics;
  assert.equal(metrics["terrainTiles:tileCount"].median, 8);
  assert.equal(metrics["terrainTiles:pendingCount"].median, 2);
  assert.equal(metrics["terrainTiles:visibleTiles"].median, 6);
  assert.equal(metrics["terrainTiles:transitionProgress"].median, 0.5);
  assert.equal(metrics["terrainTiles:waitingForTiles"].median, 1);
  assert.equal(metrics["terrainTiles:capacityLimited"].median, 0);
});


test("expose les commandes documentées du benchmark dans la console du navigateur", async () => {
  const source = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(source, /window\.collectMapBenchmark\s*=\s*options\s*=>\s*mapBenchmarkCollector\.start\(options\)/);
  assert.match(source, /window\.exportMapBenchmark\s*=\s*options\s*=>\s*mapBenchmarkCollector\.exportResults\(options\)/);
  assert.match(source, /window\.clearMapBenchmark\s*=\s*\(\)\s*=>\s*mapBenchmarkCollector\.clear\(\)/);
});
