import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { calculateViewportTransform, getViewportPreviewWrapCopies, renderWorldMap } from "./world/map-renderer.js";
import { createTerrainGrid } from "./world/terrain.js";
import { createTerrainTileStore } from "./world/terrain-tiles.js";
import { calculateZoomTilePlan } from "./world/terrain-preload-worker.js";
import { createTerrainTilePersistence } from "./world/terrain-tile-storage.js";
import { cancelTerrainWebGLPending } from "./world/terrain-webgl.js";
import { createGeographicWebGLRenderer } from "./world/geographic-webgl-renderer.js";

let state = createGameState();
let interval = null;
let worldFeatures = null;
let lakeFeatures = null;
let riverFeatures = null;
let glacierFeatures = null;
let elevationPoints = null;
let mapLabels = null;
let terrainGrid = null;
let terrainTileStore = null;
let geographicWebGLRenderer = null;
let terrainTilePersistence = null;
let terrainPreloadWorker = null;
let terrainPreloadRequestId = 0;
let terrainVisibleTileIds = [];
let lastTerrainPreloadViewportKey = null;
let lastTerrainRenderZoom = null;
let terrainTransitionStartAt = null;
let terrainTransitionZoom = null;
let mapLabelHits = [];
// Les événements (catastrophes, impacts et changements du terrain) s'ajoutent
// à cette famille sans invalider les couches physiques et politiques statiques.
const dynamicMapLayers = [];
let lastDragMoved = false;
const mapViewport = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
let mapDrag = null;
let pendingMapFrame = null;
let lastMapRenderAt = null;
let pendingPreviewFrame = null;
let previewCanvas = null;
let previewBaseViewport = null;
let previewIdleTimer = null;
let lastPreviewPreloadAt = -Infinity;
let lastPreviewPreloadViewport = null;
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 8;
const $ = (id) => document.getElementById(id);

function updateMapControls() {
  $("map-zoom-level").textContent = Math.round(mapViewport.zoom * 100) + " %";
  $("map-zoom-out").disabled = mapViewport.zoom <= MIN_MAP_ZOOM;
  $("map-zoom-in").disabled = mapViewport.zoom >= MAX_MAP_ZOOM;
}

function zoomMap(factor, anchorX, anchorY) {
  const canvas = $("world-map");
  const rect = canvas.getBoundingClientRect();
  const x = anchorX ?? rect.width / 2;
  const y = anchorY ?? rect.height / 2;
  const ratioX = rect.width ? x / rect.width - 0.5 : 0;
  const ratioY = rect.height ? y / rect.height - 0.5 : 0;
  const oldZoom = mapViewport.zoom;
  const newZoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, oldZoom * factor));
  if (newZoom === oldZoom) return;
  beginMapPreview();
  const longitudeAtAnchor = mapViewport.centerLongitude + ratioX * 360 / oldZoom;
  const latitudeAtAnchor = mapViewport.centerLatitude - ratioY * 180 / oldZoom;
  mapViewport.zoom = newZoom;
  mapViewport.centerLongitude = longitudeAtAnchor - ratioX * 360 / newZoom;
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, latitudeAtAnchor + ratioY * 180 / newZoom));
  scheduleMapPreview();
  scheduleMapPreviewCommit();
  updateMapControls();
}

function resetMapView() {
  beginMapPreview();
  mapViewport.zoom = 1;
  mapViewport.centerLongitude = 0;
  mapViewport.centerLatitude = 0;
  scheduleMapPreview();
  scheduleMapPreviewCommit();
  updateMapControls();
}

function renderMap() {
  if (!worldFeatures) return;
  const viewportKey = [mapViewport.zoom, mapViewport.centerLongitude, mapViewport.centerLatitude].join(",");
  if (terrainTileStore && viewportKey !== lastTerrainPreloadViewportKey) {
    terrainVisibleTileIds = terrainTileStore.preloadViewport(mapViewport, { padding: 0.45 });
    scheduleTerrainZoomPreload();
    lastTerrainPreloadViewportKey = viewportKey;
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const frameIntervalMs = lastMapRenderAt === null ? null : now - lastMapRenderAt;
  lastMapRenderAt = now;
  if (lastTerrainRenderZoom !== null && mapViewport.zoom !== lastTerrainRenderZoom) {
    terrainTransitionStartAt = now;
    terrainTransitionZoom = mapViewport.zoom;
  }
  const transitioning = terrainTransitionStartAt !== null && terrainTransitionZoom === mapViewport.zoom;
  const terrainTransitionProgress = transitioning
    ? Math.min(1, Math.max(0, (now - terrainTransitionStartAt) / 220))
    : 1;
  const canvas = $("world-map");
  const width = Math.max(320, Math.floor(canvas.clientWidth || 960));
  const year = Number(String(state.clock.date).slice(0, 4));
  const result = renderWorldMap(canvas, worldFeatures, {
    width, height: Math.round(width * 0.5), year,
    projection: "equirectangular",
    viewport: mapViewport,
    lakes: lakeFeatures,
    rivers: riverFeatures,
    glaciers: glacierFeatures,
    elevationPoints,
    labels: mapLabels,
    terrain: terrainTileStore ?? terrainGrid,
    terrainTileStore,
    geographicWebGLRenderer,
    terrainWebGLGrid: terrainTileStore?.revision === 0 ? terrainGrid : null,
    terrainTransitionProgress,
    onTerrainTileReady: () => scheduleMapRender(),
    dynamicLayers: dynamicMapLayers
  });
  mapLabelHits = result.labelHits ?? [];
  if (canvas.dataset && result.performance) {
    canvas.dataset.renderTotalMs = result.performance.totalMs.toFixed(2);
    if (frameIntervalMs !== null && frameIntervalMs > 0) {
      canvas.dataset.mapFrameIntervalMs = frameIntervalMs.toFixed(2);
      canvas.dataset.mapFrameFps = (1000 / frameIntervalMs).toFixed(1);
    }
    canvas.dataset.renderTerrainMs = result.performance.terrainMs.toFixed(2);
    canvas.dataset.renderPoliticalMs = result.performance.politicalMs.toFixed(2);
    if (result.geographicWebGLStats) {
      canvas.dataset.geographicWebglFeatures = String(result.geographicWebGLStats.drawnFeatures);
      canvas.dataset.geographicWebglSkipped = String(result.geographicWebGLStats.skippedFeatures);
      canvas.dataset.geographicWebglDrawCalls = String(result.geographicWebGLStats.drawCalls);
      canvas.dataset.geographicWebglTriangles = String(result.geographicWebGLStats.triangles);
      canvas.dataset.geographicWebglCacheHit = String(result.geographicWebGLStats.cacheHit);
      canvas.dataset.geographicWebglBufferUploads = String(result.geographicWebGLStats.bufferUploads);
      canvas.dataset.geographicWebglUploadedBytes = String(result.geographicWebGLStats.uploadedBytes);
      for (const layerKey of ["land", "glaciers", "lakes"]) {
        const layerStats = result.geographicWebGLStats.layers?.[layerKey];
        const datasetPrefix = `geographicWebgl${layerKey[0].toUpperCase()}${layerKey.slice(1)}`;
        if (layerStats) {
          canvas.dataset[`${datasetPrefix}Features`] = String(layerStats.drawnFeatures);
          canvas.dataset[`${datasetPrefix}CacheHit`] = String(layerStats.cacheHit);
          canvas.dataset[`${datasetPrefix}BufferUploads`] = String(layerStats.bufferUploads);
          canvas.dataset[`${datasetPrefix}UploadedBytes`] = String(layerStats.uploadedBytes);
        } else {
          delete canvas.dataset[`${datasetPrefix}Features`];
          delete canvas.dataset[`${datasetPrefix}CacheHit`];
          delete canvas.dataset[`${datasetPrefix}BufferUploads`];
          delete canvas.dataset[`${datasetPrefix}UploadedBytes`];
        }
      }
    } else {
      delete canvas.dataset.geographicWebglFeatures;
      delete canvas.dataset.geographicWebglSkipped;
      delete canvas.dataset.geographicWebglDrawCalls;
      delete canvas.dataset.geographicWebglTriangles;
      delete canvas.dataset.geographicWebglCacheHit;
      delete canvas.dataset.geographicWebglBufferUploads;
      delete canvas.dataset.geographicWebglUploadedBytes;
      for (const layerKey of ["land", "glaciers", "lakes"]) {
        const datasetPrefix = `geographicWebgl${layerKey[0].toUpperCase()}${layerKey.slice(1)}`;
        delete canvas.dataset[`${datasetPrefix}Features`];
        delete canvas.dataset[`${datasetPrefix}CacheHit`];
        delete canvas.dataset[`${datasetPrefix}BufferUploads`];
        delete canvas.dataset[`${datasetPrefix}UploadedBytes`];
      }
    }
    canvas.dataset.renderLabelsMs = result.performance.labelsMs.toFixed(2);
    canvas.dataset.renderDynamicMs = result.performance.dynamicMs.toFixed(2);
    canvas.dataset.terrainRenderer = result.terrainRenderer ?? "canvas2d";
    if (result.terrainWebGLTileStats) {
      canvas.dataset.terrainWebglTileCount = String(result.terrainWebGLTileStats.tileCount);
      canvas.dataset.terrainWebglTileBytes = String(result.terrainWebGLTileStats.byteLength);
      canvas.dataset.terrainWebglAtlasWidth = String(result.terrainWebGLTileStats.atlasWidth);
      canvas.dataset.terrainWebglAtlasHeight = String(result.terrainWebGLTileStats.atlasHeight);
      canvas.dataset.terrainWebglAtlasCapacity = String(result.terrainWebGLTileStats.capacity);
      canvas.dataset.terrainWebglTileSubmitMs = result.terrainWebGLTileStats.drawSubmitMs.toFixed(3);
      canvas.dataset.terrainWebglTileDrawCalls = String(result.terrainWebGLTileStats.drawCalls);
      canvas.dataset.terrainWebglTileVisible = String(result.terrainWebGLTileStats.visibleTiles);
      canvas.dataset.terrainWebglTilePreloaded = String(result.terrainWebGLTileStats.preloadedTiles);
      canvas.dataset.terrainWebglTilePending = String(result.terrainWebGLTileStats.pendingCount);
      canvas.dataset.terrainWebglTileLod = String(result.terrainWebGLTileStats.lod);
      canvas.dataset.terrainWebglTileTransition = result.terrainWebGLTileStats.transitionProgress.toFixed(3);
      canvas.dataset.terrainWebglTileWaiting = String(result.terrainWebGLTileStats.waitingForTiles);
      canvas.dataset.terrainWebglTileReadyChildren = String(result.terrainWebGLTileStats.readyChildTiles);
      canvas.dataset.terrainWebglTilePendingChildren = String(result.terrainWebGLTileStats.pendingChildTiles);
      canvas.dataset.terrainWebglTileFallback = result.terrainWebGLTileStats.fallbackReason ?? "";
      canvas.dataset.terrainWebglTileCapacity = String(result.terrainWebGLTileStats.atlasCapacity);
      canvas.dataset.terrainWebglTileAtlasBytes = String(result.terrainWebGLTileStats.atlasMemoryBytes);
      canvas.dataset.terrainWebglTileCapacityLimited = String(result.terrainWebGLTileStats.capacityLimited);
      canvas.dataset.terrainWebglTileHits = String(result.terrainWebGLTileStats.hits);
      canvas.dataset.terrainWebglTileMisses = String(result.terrainWebGLTileStats.misses);
      canvas.dataset.terrainWebglTileUploads = String(result.terrainWebGLTileStats.uploads);
      canvas.dataset.terrainWebglTileUploadedBytes = String(result.terrainWebGLTileStats.uploadedBytes);
      canvas.dataset.terrainWebglTileBuildMs = result.terrainWebGLTileStats.buildMs.toFixed(3);
      canvas.dataset.terrainWebglTileUploadMs = result.terrainWebGLTileStats.uploadMs.toFixed(3);
      canvas.dataset.terrainWebglTileEvictions = String(result.terrainWebGLTileStats.evictions);
    } else {
      delete canvas.dataset.terrainWebglTileCount;
      delete canvas.dataset.terrainWebglTileBytes;
      delete canvas.dataset.terrainWebglAtlasWidth;
      delete canvas.dataset.terrainWebglAtlasHeight;
      delete canvas.dataset.terrainWebglAtlasCapacity;
      delete canvas.dataset.terrainWebglTileSubmitMs;
      delete canvas.dataset.terrainWebglTileDrawCalls;
      delete canvas.dataset.terrainWebglTileVisible;
      delete canvas.dataset.terrainWebglTilePreloaded;
      delete canvas.dataset.terrainWebglTilePending;
      delete canvas.dataset.terrainWebglTileLod;
      delete canvas.dataset.terrainWebglTileTransition;
      delete canvas.dataset.terrainWebglTileCapacity;
      delete canvas.dataset.terrainWebglTileAtlasBytes;
      delete canvas.dataset.terrainWebglTileCapacityLimited;
      delete canvas.dataset.terrainWebglTileHits;
      delete canvas.dataset.terrainWebglTileMisses;
      delete canvas.dataset.terrainWebglTileUploads;
      delete canvas.dataset.terrainWebglTileUploadedBytes;
      delete canvas.dataset.terrainWebglTileBuildMs;
      delete canvas.dataset.terrainWebglTileUploadMs;
      delete canvas.dataset.terrainWebglTileEvictions;
    }
    if (result.terrainWebGLStats) {
      canvas.dataset.terrainWebglUploadMs = result.terrainWebGLStats.textureUploadMs.toFixed(2);
      canvas.dataset.terrainWebglTextureBytes = String(result.terrainWebGLStats.textureBytes);
      canvas.dataset.terrainWebglTextureSize = `${result.terrainWebGLStats.textureWidth}x${result.terrainWebGLStats.textureHeight}`;
      canvas.dataset.terrainWebglSourceSize = `${result.terrainWebGLStats.sourceWidth}x${result.terrainWebGLStats.sourceHeight}`;
      canvas.dataset.terrainWebglSubmitMs = result.terrainWebGLStats.drawSubmitMs.toFixed(3);
      canvas.dataset.terrainWebglGpuMs = result.terrainWebGLStats.gpuMs === null
        ? "pending" : result.terrainWebGLStats.gpuMs.toFixed(3);
      canvas.dataset.terrainWebglTimerQueries = String(result.terrainWebGLStats.timerQueriesSupported);
    } else {
      delete canvas.dataset.terrainWebglUploadMs;
      delete canvas.dataset.terrainWebglTextureBytes;
      delete canvas.dataset.terrainWebglTextureSize;
      delete canvas.dataset.terrainWebglSourceSize;
      delete canvas.dataset.terrainWebglSubmitMs;
      delete canvas.dataset.terrainWebglGpuMs;
      delete canvas.dataset.terrainWebglTimerQueries;
    }
    if (terrainTileStore) {
      const cacheStats = terrainTileStore.cacheStats;
      canvas.dataset.terrainCacheBytes = String(cacheStats.byteLength);
      canvas.dataset.terrainCacheTiles = String(cacheStats.tileCount);
      canvas.dataset.terrainCacheLevels = JSON.stringify(cacheStats.levels);
      canvas.dataset.terrainCacheOverBudget = String(cacheStats.overBudget);
    }
  }
  $("map-era").textContent = result.theme.label;
  const terrainStatus = result.terrainEnabled ? " · relief ETOPO actif" : " · relief ETOPO non installé";
  $("map-status").textContent = `${result.landCount} terres · ${result.lakeCount} lacs · ${result.riverCount} cours d’eau · ${result.glacierCount} zones glaciaires · ${result.elevationPointCount} repères de relief${terrainStatus}`;
  updateMapControls();
  lastTerrainRenderZoom = mapViewport.zoom;
  const tileLodTransitioning = (result.terrainWebGLTileStats?.transitionProgress ?? 1) < 1;
  const waitingForTerrainTiles = Boolean(result.terrainWebGLTileStats?.waitingForTiles);
  if ((transitioning && terrainTransitionProgress < 1) || (tileLodTransitioning && !waitingForTerrainTiles)) {
    scheduleMapRender();
  } else if (transitioning) {
    terrainTransitionStartAt = null;
    terrainTransitionZoom = null;
  }
}


function scheduleTerrainZoomPreload() {
  if (!terrainTileStore) return;
  const requestId = ++terrainPreloadRequestId;
  const input = {
    width: terrainTileStore.width,
    height: terrainTileStore.height,
    tileSize: terrainTileStore.tileSize,
    viewport: { ...mapViewport },
    padding: 0.45,
    zoomLevels: [
      Math.max(MIN_MAP_ZOOM, mapViewport.zoom * 0.5),
      Math.min(MAX_MAP_ZOOM, mapViewport.zoom * 2)
    ]
  };
  const fallback = () => {
    if (requestId !== terrainPreloadRequestId || !terrainTileStore) return;
    const ids = calculateZoomTilePlan(input);
    void terrainTileStore.preloadTileIds(ids, {
      batchSize: 8,
      protectedIds: terrainVisibleTileIds,
      shouldCancel: () => requestId !== terrainPreloadRequestId
    });
  };

  if (typeof Worker === "undefined") {
    fallback();
    return;
  }
  try {
    if (!terrainPreloadWorker) {
      terrainPreloadWorker = new Worker(
        new URL("./world/terrain-preload-worker.js", import.meta.url),
        { type: "module" }
      );
      terrainPreloadWorker.addEventListener("message", event => {
        const { requestId: completedId, tileIds } = event.data ?? {};
        if (completedId !== terrainPreloadRequestId || !terrainTileStore || !Array.isArray(tileIds)) return;
        terrainTileStore.preloadTileIds(tileIds, {
          batchSize: 8,
          protectedIds: terrainVisibleTileIds,
          shouldCancel: () => completedId !== terrainPreloadRequestId
        });
      });
      terrainPreloadWorker.addEventListener("error", () => {
        terrainPreloadWorker?.terminate();
        terrainPreloadWorker = null;
        fallback();
      });
    }
    terrainPreloadWorker.postMessage({ requestId, input });
  } catch {
    terrainPreloadWorker?.terminate();
    terrainPreloadWorker = null;
    fallback();
  }
}

function beginMapPreview() {
  if (previewBaseViewport) return;
  const canvas = $("world-map");
  if (!canvas?.width || !canvas?.height) return;
  previewCanvas = document.createElement("canvas");
  previewCanvas.width = canvas.width;
  previewCanvas.height = canvas.height;
  const snapshotContext = previewCanvas.getContext("2d");
  if (!snapshotContext) { previewCanvas = null; return; }
  snapshotContext.drawImage(canvas, 0, 0);
  previewBaseViewport = { ...mapViewport };
  lastPreviewPreloadViewport = { ...mapViewport };
  lastPreviewPreloadAt = -Infinity;
}

function drawMapPreview() {
  if (!previewCanvas || !previewBaseViewport) return;
  const canvas = $("world-map");
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = Math.max(1, canvas.clientWidth || 960);
  const height = Math.max(1, canvas.clientHeight || Math.round(width * 0.5));
  const ratio = canvas.width / width;
  const transform = calculateViewportTransform(previewBaseViewport, mapViewport, width, height);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(transform.scale, 0, 0, transform.scale, transform.translateX * ratio, transform.translateY * ratio);
  const wrapCopies = getViewportPreviewWrapCopies(previewBaseViewport, mapViewport);
  for (const copy of wrapCopies) {
    context.drawImage(previewCanvas, copy * previewCanvas.width, 0);
  }
}

function scheduleMapPreview() {
  if (!previewBaseViewport) return;
  // Toute nouvelle position rend les plans d'anticipation précédents obsolètes.
  terrainPreloadRequestId++;
  // Annule immédiatement les uploads GPU prédictifs de l’ancienne position.
  if (terrainTileStore) cancelTerrainWebGLPending(terrainTileStore);
  if (pendingPreviewFrame !== null) return;
  pendingPreviewFrame = window.requestAnimationFrame(() => {
    pendingPreviewFrame = null;
    // Réchauffe les tuiles autour du nouveau centre au plus 10 fois/seconde.
    // Le bitmap reste la seule chose dessinée pendant le geste.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (terrainTileStore && now - lastPreviewPreloadAt >= 100) {
      const previous = lastPreviewPreloadViewport ?? previewBaseViewport;
      const elapsed = Number.isFinite(lastPreviewPreloadAt)
        ? Math.max(0.1, (now - lastPreviewPreloadAt) / 1000)
        : 0.1;
      const longitudeDelta = mapViewport.centerLongitude - previous.centerLongitude;
      const latitudeDelta = mapViewport.centerLatitude - previous.centerLatitude;
      const movementFraction = Math.max(
        Math.abs(longitudeDelta) / Math.max(1, 360 / mapViewport.zoom),
        Math.abs(latitudeDelta) / Math.max(1, 180 / mapViewport.zoom)
      );
      // Une exploration rapide reçoit une avance plus longue; à faible
      // vitesse, on réduit les tuiles anticipées pour limiter le travail.
      const speedFactor = Math.min(1, movementFraction * 0.1 / elapsed);
      const lookAhead = speedFactor > 0 ? 0.2 + speedFactor * 0.7 : 0;
      // Actualise d'abord le jeu strictement visible, puis anticipe le
      // mouvement sans exposer ces tuiles visibles à l'éviction LRU.
      terrainVisibleTileIds = terrainTileStore.preloadViewport(mapViewport, {
        padding: 0.45,
        retainExisting: true
      });
      terrainTileStore.preloadViewport(mapViewport, {
        padding: 0.45,
        retainExisting: true,
        protectedIds: terrainVisibleTileIds,
        lookAhead,
        directionLongitude: Math.sign(longitudeDelta),
        directionLatitude: Math.sign(latitudeDelta)
      });
      lastPreviewPreloadViewport = { ...mapViewport };
      lastPreviewPreloadAt = now;
    }
    drawMapPreview();
  });
}

function scheduleMapPreviewCommit() {
  if (previewIdleTimer !== null) window.clearTimeout(previewIdleTimer);
  previewIdleTimer = window.setTimeout(finishMapPreview, 120);
}

function finishMapPreview() {
  // Coupe immédiatement tout travail associé à l'ancien viewport.
  terrainPreloadRequestId++;
  if (previewIdleTimer !== null) window.clearTimeout(previewIdleTimer);
  previewIdleTimer = null;
  if (pendingPreviewFrame !== null) window.cancelAnimationFrame(pendingPreviewFrame);
  pendingPreviewFrame = null;
  previewCanvas = null;
  previewBaseViewport = null;
  scheduleMapRender();
}

function scheduleMapRender() {
  if (previewBaseViewport) return;
  if (pendingMapFrame !== null) return;
  pendingMapFrame = window.requestAnimationFrame(() => {
    pendingMapFrame = null;
    if (previewBaseViewport) return;
    renderMap();
  });
}

async function connectTerrainTilePersistence() {
  if (!terrainTileStore || !terrainGrid) return;
  try {
    const persistence = await createTerrainTilePersistence();
    if (!persistence) return;
    terrainTilePersistence = persistence;
    const tileSize = terrainTileStore.tileSize;
    terrainTileStore.setOnTileChange(async (snapshot) => {
      try {
        await persistence.saveTile(snapshot, terrainGrid, tileSize);
        terrainTileStore?.markPersisted(snapshot.id, snapshot.revision);
      } catch (error) {
        console.warn("Persistance d’une tuile de relief impossible :", error);
      }
    });
    const snapshots = await persistence.loadAll(terrainGrid, tileSize);
    let restored = 0;
    for (const snapshot of snapshots) {
      if (terrainTileStore.restoreTile(snapshot)) restored++;
    }
    if (restored) scheduleMapRender();
    console.info(`Persistance du relief prête : ${restored} tuile(s) restaurée(s).`);
  } catch (error) {
    console.warn("Stockage local du relief indisponible :", error);
  }
}

async function loadWorldMap() {
  try {
    const responses = await Promise.all([
      fetch("./data/ne_110m_land.geojson"),
      fetch("./data/ne_110m_lakes.geojson"),
      fetch("./data/ne_110m_rivers.geojson"),
      fetch("./data/ne_110m_glaciated_areas.geojson"),
      fetch("./data/ne_110m_elevation_points.geojson"),
      fetch("./data/ne_110m_map_labels.geojson")
    ]);
    for (const response of responses) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    [worldFeatures, lakeFeatures, riverFeatures, glacierFeatures, elevationPoints, mapLabels] =
      await Promise.all(responses.map(response => response.json()));
    try {
      const terrainResponse = await fetch("./data/terrain/etopo_global_10m_i16.bin");
      if (terrainResponse.ok) {
        terrainGrid = createTerrainGrid(await terrainResponse.arrayBuffer());
        // Les tuiles sont matérialisées à la demande et conservées en LRU.
        // La grille source reste intacte comme référence de chargement initial.
        terrainTileStore = createTerrainTileStore(terrainGrid, { tileSize: 180, maxTiles: 96 });
        void connectTerrainTilePersistence();
      }
    } catch (terrainError) {
      console.warn("Grille ETOPO non chargée :", terrainError);
    }
    scheduleMapRender();
  } catch (error) {
    $("map-status").textContent = `Carte indisponible : ${error.message}`;
  }
}

function render() {
  $("current-date").textContent = formatDate(state.clock.date);
  $("elapsed-days").textContent = "Jour " + state.clock.day.toLocaleString("fr-FR");
  $("run-state").textContent = state.clock.paused ? "EN PAUSE" : "EN COURS";
  $("toggle-clock").textContent = state.clock.paused ? "Lancer" : "Pause";
  $("speed").value = String(state.clock.speed);
  scheduleMapRender();
}

function stopTimer() {
  if (interval !== null) clearInterval(interval);
  interval = null;
}
function schedule() {
  stopTimer();
  if (!state.clock.paused) interval = setInterval(() => {
    state.clock = advanceClock(state.clock, state.clock.speed);
    render();
  }, 1000);
}

$("toggle-clock").addEventListener("click", () => {
  state.clock.paused = !state.clock.paused;
  schedule();
  render();
});
$("advance-day").addEventListener("click", () => {
  state.clock = advanceClock(state.clock);
  render();
});
$("speed").addEventListener("change", (event) => {
  const speed = Number(event.target.value);
  if (SPEEDS.includes(speed)) state.clock.speed = speed;
  schedule();
  render();
});
$("save-game").addEventListener("click", () => {
  try {
    const at = saveGame(state);
    $("save-status").textContent = "Sauvegarde effectuée à " + new Date(at).toLocaleTimeString("fr-FR");
  } catch (error) {
    $("save-status").textContent = "Échec de sauvegarde : " + error.message;
  }
});
$("load-game").addEventListener("click", () => {
  try {
    const loaded = loadGame();
    if (!loaded) { $("save-status").textContent = "Aucune sauvegarde trouvée."; return; }
    state = loaded;
    state.clock.paused = true;
    stopTimer();
    validateGameState(state);
    render();
    $("save-status").textContent = "Sauvegarde chargée.";
  } catch (error) {
    $("save-status").textContent = "Sauvegarde illisible : " + error.message;
  }
});

const mapCanvas = $("world-map");
const geographicCanvas = document.createElement("canvas");
const geographicGL = geographicCanvas.getContext("webgl", {
  alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false
});
if (geographicGL) {
  try { geographicWebGLRenderer = createGeographicWebGLRenderer(geographicGL); }
  catch { geographicWebGLRenderer = null; }
}
$("map-zoom-in").addEventListener("click", () => zoomMap(1.5));
$("map-zoom-out").addEventListener("click", () => zoomMap(1 / 1.5));
$("map-reset").addEventListener("click", resetMapView);

mapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (previewIdleTimer !== null) window.clearTimeout(previewIdleTimer);
  previewIdleTimer = null;
  beginMapPreview();
  mapDrag = { x: event.clientX, y: event.clientY, centerLongitude: mapViewport.centerLongitude, centerLatitude: mapViewport.centerLatitude };
  mapCanvas.classList.add("is-dragging");
  mapCanvas.setPointerCapture?.(event.pointerId);
});
mapCanvas.addEventListener("pointermove", (event) => {
  if (!mapDrag) {
    const rect = mapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = [...mapLabelHits].reverse().find(label =>
      x >= label.bounds.left && x <= label.bounds.right && y >= label.bounds.top && y <= label.bounds.bottom
    );
    mapCanvas.style.cursor = previewBaseViewport ? "grabbing" : hit ? "pointer" : "grab";
    if (previewBaseViewport) { hideMapTooltip(); return; }
    if (hit) showMapTooltip(hit, x, y, false);
    else hideMapTooltip();
    return;
  }
  const rect = mapCanvas.getBoundingClientRect();
  const dx = event.clientX - mapDrag.x;
  const dy = event.clientY - mapDrag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) mapDrag.moved = true;
  mapViewport.centerLongitude = Math.max(-540, Math.min(540, mapDrag.centerLongitude - dx / rect.width * 360 / mapViewport.zoom));
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, mapDrag.centerLatitude + dy / rect.height * 180 / mapViewport.zoom));
  scheduleMapPreview();
});
function showMapTooltip(label, x, y, selected) {
  const tooltip = $("map-tooltip");
  const kindNames = { continent: "Continent", ocean: "Océan", city: "Ville historique" };
  tooltip.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = label.name;
  const subtitle = document.createElement("span");
  subtitle.textContent = selected
    ? `${kindNames[label.kind] ?? "Lieu"} · ${label.coordinates[1].toFixed(2)}°, ${label.coordinates[0].toFixed(2)}°`
    : `${kindNames[label.kind] ?? "Lieu"} · Cliquez pour afficher les coordonnées`;
  tooltip.append(title, subtitle);
  tooltip.hidden = false;
  tooltip.classList.toggle("is-selected", selected);
  tooltip.style.left = `${Math.min(Math.max(8, x + 14), mapCanvas.parentElement.clientWidth - 190)}px`;
  tooltip.style.top = `${Math.max(8, y + 14)}px`;
}
function hideMapTooltip() {
  $("map-tooltip").hidden = true;
}
function stopMapDrag() {
  if (mapDrag) {
    lastDragMoved = mapDrag.moved;
    mapDrag = null;
    mapCanvas.classList.remove("is-dragging");
    const viewportChanged = previewBaseViewport && (
      previewBaseViewport.zoom !== mapViewport.zoom
      || previewBaseViewport.centerLongitude !== mapViewport.centerLongitude
      || previewBaseViewport.centerLatitude !== mapViewport.centerLatitude
    );
    if (lastDragMoved || viewportChanged) finishMapPreview();
    else {
      if (pendingPreviewFrame !== null) window.cancelAnimationFrame(pendingPreviewFrame);
      pendingPreviewFrame = null;
      previewCanvas = null;
      previewBaseViewport = null;
    }
  }
}
mapCanvas.addEventListener("click", (event) => {
  if (previewBaseViewport) return;
  if (lastDragMoved) { lastDragMoved = false; return; }
  const rect = mapCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = [...mapLabelHits].reverse().find(label =>
    x >= label.bounds.left && x <= label.bounds.right && y >= label.bounds.top && y <= label.bounds.bottom
  );
  if (hit) showMapTooltip(hit, x, y, true);
});
mapCanvas.addEventListener("pointerup", stopMapDrag);
mapCanvas.addEventListener("pointercancel", stopMapDrag);
mapCanvas.addEventListener("pointerleave", () => { if (!mapDrag) hideMapTooltip(); });
mapCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = mapCanvas.getBoundingClientRect();
  zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

state.clock = createClock();
render();
updateMapControls();
loadWorldMap();
window.addEventListener("resize", scheduleMapRender);
