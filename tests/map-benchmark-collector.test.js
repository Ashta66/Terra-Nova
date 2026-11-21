import test from "node:test";
import assert from "node:assert/strict";
import { createMapBenchmarkCollector } from "../src/world/map-benchmark.js";
function createEnvironment() {
  let time = 100;
  return { advance(ms) { time += ms; }, environment: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, navigator: { userAgent: "test-browser" }, performance: { now: () => time, memory: { usedJSHeapSize: 4096 } } } };
}
test("collecte les temps de rendu, les couches, le cadence et les métadonnées", () => {
  const clock = createEnvironment(), collector = createMapBenchmarkCollector({ environment: clock.environment });
  collector.start({ scenario: "zoom-pan", cache: "warm" });
  collector.record({ totalRenderMs: 10, renderTimings: { terrain: 4 }, terrainRenderer: "webgl-tiles", landCount: 12 });
  clock.advance(50);
  collector.record({ totalRenderMs: 20, renderTimings: { terrain: 6 }, terrainRenderer: "webgl-tiles", landCount: 12 });
  const result = collector.exportResults();
  assert.equal(result.metadata.scenario, "zoom-pan"); assert.equal(result.metadata.sampleCount, 2);
  assert.equal(result.metadata.viewportWidth, 1280); assert.equal(result.metadata.terrainRenderer, "webgl-tiles");
  assert.equal(result.metrics.renderTotalMs.median, 15); assert.equal(result.metrics.renderTotalMs.p95, 19.5);
  assert.equal(result.metrics["layer:terrain"].median, 5); assert.equal(result.metrics.renderCadenceFps.median, 20);
  assert.equal(result.metrics.jsHeapUsedBytes.max, 4096); assert.equal(collector.active, false);
});
test("n'enregistre rien avant démarrage et gère un export vide", () => {
  const collector = createMapBenchmarkCollector({ environment: {} });
  assert.equal(collector.record({ totalRenderMs: 1 }), false); collector.start();
  const result = collector.exportResults(); assert.equal(result.metadata.sampleCount, 0); assert.deepEqual(result.metrics, {});
});
test("clear réinitialise la session et permet une nouvelle collecte", () => {
  const clock = createEnvironment(), collector = createMapBenchmarkCollector({ environment: clock.environment });
  collector.start(); collector.record({ totalRenderMs: 5 }); collector.clear();
  assert.equal(collector.sampleCount, 0); assert.equal(collector.active, false);
  collector.start({ scenario: "new" }); collector.record({ totalRenderMs: 7 });
  assert.equal(collector.exportResults().metrics.renderTotalMs.median, 7);
});


test("collecte les métriques de préparation et de transition LOD",()=>{
 const clock=createEnvironment(),collector=createMapBenchmarkCollector({environment:clock.environment});
 collector.start({scenario:"lod-transition"});
 collector.record({
  totalRenderMs:12,
  lodStats:{generatedLevels:2,cachedLevels:2,generationTimeMs:18,lastGenerationMs:11,removedVertices:420},
  lodTransitionMs:220,
  lodCrossfadeBytes:1024,
  lodWarmupScheduled:true
 });
 const metrics=collector.exportResults().metrics;
 assert.equal(metrics["lod:generatedLevels"].max,2);
 assert.equal(metrics["lod:generationTimeMs"].max,18);
 assert.equal(metrics["lod:removedVertices"].max,420);
 assert.equal(metrics["lod:transitionMs"].max,220);
 assert.equal(metrics["lod:crossfadeBytes"].max,1024);
 assert.equal(metrics["lod:warmupScheduled"].max,1);
});

test("collecte les coûts détaillés WebGL et la taille des caches géométriques", () => {
  const clock = createEnvironment(), collector = createMapBenchmarkCollector({ environment: clock.environment });
  collector.start({ scenario: "webgl-pipeline" });
  collector.record({
    totalRenderMs: 80,
    webglStats: { geometryBuildMs: 12, bufferUploadMs: 3, cacheBuildMs: 15,
      drawSubmitMs: 2, totalMs: 18, uploadedBytes: 4096, cachedGpuBytes: 8192,
      bufferUploads: 4, drawCalls: 2, triangles: 300, cacheHit: false },
    projectedPathCacheStats: { cachedPaths: 42, cachedVertices: 12000, estimatedBytes: 384000,
      maxEstimatedBytes: 8000000, projectedPathCacheHits: 12, projectedPathCacheMisses: 4,
      combinedLandMaskCacheHits: 8, combinedLandMaskCacheMisses: 2, combinedLandMaskCacheEntries: 6 }
  });
  const metrics = collector.exportResults().metrics;
  assert.equal(metrics["webgl:geometryBuildMs"].median, 12);
  assert.equal(metrics["webgl:bufferUploadMs"].median, 3);
  assert.equal(metrics["webgl:uploadedBytes"].median, 4096);
  assert.equal(metrics["webgl:cachedGpuBytes"].median, 8192);
  assert.equal(metrics["webgl:cacheHit"].median, 0);
  assert.equal(metrics["geometryCache:cachedPaths"].median, 42);
  assert.equal(metrics["geometryCache:cachedVertices"].median, 12000);
  assert.equal(metrics["geometryCache:estimatedBytes"].median, 384000);
  assert.equal(metrics["geometryCache:projectedPathHits"].median, 12);
  assert.equal(metrics["geometryCache:projectedPathMisses"].median, 4);
  assert.equal(metrics["geometryCache:combinedMaskHits"].median, 8);
  assert.equal(metrics["geometryCache:combinedMaskMisses"].median, 2);
  assert.equal(metrics["geometryCache:combinedMaskEntries"].median, 6);
});
