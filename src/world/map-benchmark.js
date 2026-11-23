const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile/i;

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function summarize(values) {
  const finite = [];
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    finite.push(value);
    sum += value;
  }
  if (!finite.length) return null;
  finite.sort((a, b) => a - b);
  return { count: finite.length, min: finite[0], median: percentile(finite, 0.5), p95: percentile(finite, 0.95), max: finite[finite.length - 1], average: sum / finite.length };
}
export function createMapBenchmarkCollector({ environment = globalThis } = {}) {
  const clockNow = () => environment.performance?.now?.() ?? Date.now();
  let active = false, startedAt = 0, previousFrameAt = null, metadata = {}, samples = [];
  function start(options = {}) {
    metadata = { scenario: "manual", cache: "unspecified", ...options };
    samples = []; startedAt = clockNow(); previousFrameAt = null; active = true;
    return { active, startedAt };
  }
  function record(result, context = {}) {
    if (!active || !result) return false;
    const timestamp = clockNow(), metrics = {};
    const add = (key, value) => { if (Number.isFinite(value)) metrics[key] = value; };
    add("renderTotalMs", result.totalRenderMs);
    const renderTimings = result.renderTimings ?? {};
    for (const key in renderTimings) {
      if (Object.hasOwn(renderTimings, key)) add("layer:" + key, renderTimings[key]);
    }
    const families = result.renderFamilies ?? {};
    add("family:physicalMs", families.physicalMs);
    add("family:politicalMs", families.politicalMs);
    add("family:dynamicMs", families.dynamicMs);
    const webgl = result.webglStats ?? {};
    for (const key of ["geometryBuildMs", "bufferUploadMs", "cacheBuildMs", "drawSubmitMs",
      "totalMs", "uploadedBytes", "cachedGpuBytes", "cacheBudgetBytes", "cacheEvictedLayers",
      "bufferUploads", "drawCalls", "triangles", "vertexBufferCapacityBytes",
      "vertexBufferUploadBytes", "vertexBufferAllocations"]) {
      add("webgl:" + key, webgl[key]);
    }
    add("webgl:cacheHit", typeof webgl.cacheHit === "boolean" ? (webgl.cacheHit ? 1 : 0) : null);
    const terrainTiles = result.terrainTileStats ?? {};
    for (const key of ["tileCount", "pendingCount", "hits", "misses", "uploads", "uploadedBytes",
      "evictions", "visibleTiles", "preloadedTiles", "lod", "transitionProgress", "transitionFromLevel",
      "atlasCapacity", "atlasMemoryBytes", "readyChildTiles", "pendingChildTiles"]) {
      add("terrainTiles:" + key, terrainTiles[key]);
    }
    add("terrainTiles:waitingForTiles", typeof terrainTiles.waitingForTiles === "boolean" ? (terrainTiles.waitingForTiles ? 1 : 0) : null);
    add("terrainTiles:capacityLimited", typeof terrainTiles.capacityLimited === "boolean" ? (terrainTiles.capacityLimited ? 1 : 0) : null);
    const pathCache = result.projectedPathCacheStats ?? {};
    add("geometryCache:cachedPaths", pathCache.cachedPaths);
    add("geometryCache:maxCachedPaths", pathCache.maxCachedPaths);
    add("geometryCache:maxCachedVertices", pathCache.maxCachedVertices);
    add("geometryCache:maxCombinedMaskEntries", pathCache.maxCombinedLandMaskCacheEntries);
    add("geometryCache:cachedVertices", pathCache.cachedVertices);
    add("geometryCache:estimatedBytes", pathCache.estimatedBytes);
    add("geometryCache:maxEstimatedBytes", pathCache.maxEstimatedBytes);
    add("geometryCache:projectedPathHits", pathCache.projectedPathCacheHits);
    add("geometryCache:projectedPathMisses", pathCache.projectedPathCacheMisses);
    add("geometryCache:combinedMaskHits", pathCache.combinedLandMaskCacheHits);
    add("geometryCache:combinedMaskMisses", pathCache.combinedLandMaskCacheMisses);
    add("geometryCache:combinedMaskEntries", pathCache.combinedLandMaskCacheEntries);
    const lod = result.lodStats ?? {};
    add("lod:generatedLevels", lod.generatedLevels);
    add("lod:cachedLevels", lod.cachedLevels);
    add("lod:generationTimeMs", lod.generationTimeMs);
    add("lod:lastGenerationMs", lod.lastGenerationMs);
    add("lod:removedVertices", lod.removedVertices);
    add("lod:workerCollectionTransfers", lod.workerCollectionTransfers);
    add("lod:workerJobsCompleted", lod.workerJobsCompleted);
    add("lod:workerCreationAttempts", lod.workerCreationAttempts);
    add("lod:workerCreationFailures", lod.workerCreationFailures);
    add("lod:workerRuntimeFailures", lod.workerRuntimeFailures);
    add("lod:workerSyncFallbackJobs", lod.workerSyncFallbackJobs);
    add("lod:workerActive", typeof lod.workerActive === "boolean" ? (lod.workerActive ? 1 : 0) : null);
    const warmup = result.lodWarmupDiagnostics ?? {};
    for (const key of ["scheduled", "started", "completed", "generated", "cancelled", "failed", "completedJobs"]) {
      add("lod:warmup:" + key, warmup[key]);
    }
    add("lod:transitionMs", result.lodTransitionMs);
    add("lod:crossfadeBytes", result.lodCrossfadeBytes);
    add("lod:warmupScheduled", result.lodWarmupScheduled ? 1 : 0);
    for (const key of ["landCount", "territoryCount", "glacierCount", "lakeCount", "riverCount", "elevationPointCount", "physicalChangeCount", "politicalBoundaryCount", "administrativeBoundaryCount", "labelHits"]) add(key, typeof result[key] === "number" ? result[key] : null);
    if (previousFrameAt !== null) { const interval = timestamp - previousFrameAt; if (interval > 0) add("renderCadenceFps", 1000 / interval); }
    previousFrameAt = timestamp;
    const memory = environment.performance?.memory;
    if (memory && Number.isFinite(memory.usedJSHeapSize)) add("jsHeapUsedBytes", memory.usedJSHeapSize);
    const userAgent = environment.navigator?.userAgent ?? "unknown";
    const screen = environment.screen ?? {};
    const visualViewport = environment.visualViewport ?? {};
    const mobileUserAgent = MOBILE_USER_AGENT.test(userAgent);
    samples.push({ metrics, metadata: {
      ...context,
      terrainRenderer: result.terrainRenderer ?? "unknown",
      viewportWidth: environment.innerWidth ?? null,
      viewportHeight: environment.innerHeight ?? null,
      devicePixelRatio: environment.devicePixelRatio ?? 1,
      screenWidth: screen.width ?? null,
      screenHeight: screen.height ?? null,
      screenAvailWidth: screen.availWidth ?? null,
      screenAvailHeight: screen.availHeight ?? null,
      visualViewportScale: visualViewport.scale ?? null,
      maxTouchPoints: environment.navigator?.maxTouchPoints ?? null,
      mobileUserAgent
    } });
    return true;
  }
  function exportResults({ stop = true } = {}) {
    if (stop) active = false;
    const metricValues = new Map();
    for (const sample of samples) {
      const sampleMetrics = sample.metrics;
      for (const key in sampleMetrics) {
        if (!Object.hasOwn(sampleMetrics, key)) continue;
        const value = sampleMetrics[key];
        if (!Number.isFinite(value)) continue;
        let values = metricValues.get(key);
        if (!values) metricValues.set(key, values = []);
        values.push(value);
      }
    }
    const metrics = Object.fromEntries(
      [...metricValues].map(([key, values]) => [key, summarize(values)])
    );
    return { schemaVersion: 1, metadata: { ...metadata, ...(samples.at(-1)?.metadata ?? {}), sampleCount: samples.length, durationMs: Math.max(0, clockNow() - startedAt), userAgent: environment.navigator?.userAgent ?? "unknown", collectedAt: new Date().toISOString() }, metrics };
  }
  function clear() { active = false; samples = []; previousFrameAt = null; startedAt = 0; }
  return { start, record, exportResults, clear, get active() { return active; }, get sampleCount() { return samples.length; } };
}
