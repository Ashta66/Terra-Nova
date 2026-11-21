function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
function summarize(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  return { count: finite.length, min: finite[0], median: percentile(finite, 0.5), p95: percentile(finite, 0.95), max: finite.at(-1), average: finite.reduce((sum, value) => sum + value, 0) / finite.length };
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
    for (const [key, value] of Object.entries(result.renderTimings ?? {})) add("layer:" + key, value);
    const webgl = result.webglStats ?? {};
    for (const key of ["geometryBuildMs", "bufferUploadMs", "cacheBuildMs", "drawSubmitMs",
      "totalMs", "uploadedBytes", "cachedGpuBytes", "bufferUploads", "drawCalls", "triangles"]) {
      add("webgl:" + key, webgl[key]);
    }
    add("webgl:cacheHit", typeof webgl.cacheHit === "boolean" ? (webgl.cacheHit ? 1 : 0) : null);
    const pathCache = result.projectedPathCacheStats ?? {};
    add("geometryCache:cachedPaths", pathCache.cachedPaths);
    add("geometryCache:cachedVertices", pathCache.cachedVertices);
    add("geometryCache:estimatedBytes", pathCache.estimatedBytes);
    add("geometryCache:maxEstimatedBytes", pathCache.maxEstimatedBytes);
    const lod = result.lodStats ?? {};
    add("lod:generatedLevels", lod.generatedLevels);
    add("lod:cachedLevels", lod.cachedLevels);
    add("lod:generationTimeMs", lod.generationTimeMs);
    add("lod:lastGenerationMs", lod.lastGenerationMs);
    add("lod:removedVertices", lod.removedVertices);
    add("lod:transitionMs", result.lodTransitionMs);
    add("lod:crossfadeBytes", result.lodCrossfadeBytes);
    add("lod:warmupScheduled", result.lodWarmupScheduled ? 1 : 0);
    for (const key of ["landCount", "territoryCount", "glacierCount", "lakeCount", "riverCount", "elevationPointCount", "physicalChangeCount", "politicalBoundaryCount", "administrativeBoundaryCount", "labelHits"]) add(key, typeof result[key] === "number" ? result[key] : null);
    if (previousFrameAt !== null) { const interval = timestamp - previousFrameAt; if (interval > 0) add("renderCadenceFps", 1000 / interval); }
    previousFrameAt = timestamp;
    const memory = environment.performance?.memory;
    if (memory && Number.isFinite(memory.usedJSHeapSize)) add("jsHeapUsedBytes", memory.usedJSHeapSize);
    samples.push({ metrics, metadata: { ...context, terrainRenderer: result.terrainRenderer ?? "unknown", viewportWidth: environment.innerWidth ?? null, viewportHeight: environment.innerHeight ?? null, devicePixelRatio: environment.devicePixelRatio ?? 1 } });
    return true;
  }
  function exportResults({ stop = true } = {}) {
    if (stop) active = false;
    const metricKeys = [...new Set(samples.flatMap(sample => Object.keys(sample.metrics)))];
    const metrics = Object.fromEntries(metricKeys.map(key => [key, summarize(samples.map(sample => sample.metrics[key]).filter(Number.isFinite))]));
    return { schemaVersion: 1, metadata: { ...metadata, ...(samples.at(-1)?.metadata ?? {}), sampleCount: samples.length, durationMs: Math.max(0, clockNow() - startedAt), userAgent: environment.navigator?.userAgent ?? "unknown", collectedAt: new Date().toISOString() }, metrics };
  }
  function clear() { active = false; samples = []; previousFrameAt = null; startedAt = 0; }
  return { start, record, exportResults, clear, get active() { return active; }, get sampleCount() { return samples.length; } };
}
