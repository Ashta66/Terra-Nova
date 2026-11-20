import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { getMapTilePyramidPlan } from "./world/map-tile-system.js";
import { createMapLayerFamilies } from "./world/map-layer-families.js";
import { createMapFrameScheduler } from "./world/map-frame-scheduler.js";
import { simplifyGeoJsonCollection } from "./world/geometry-generalization.js";
import { INTERACTION_PREVIEW_INTERVAL_MS, INTERACTION_SETTLE_DELAY_MS } from "./world/interaction-refresh.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { buildCountryDossier } from "./game/country-dossier.js";
import { isNonStateHistoricalRegion } from "./world/historical-boundaries.js";
import { renderWorldMap, buildTerritoryLabels, frenchTerritoryName, filterSmallIslandComponents, filterMajorLakeFeatures } from "./world/map-renderer.js";
import { prefetchGeoSpatialFeatures } from "./world/geo-spatial-index.js";
import { constrainEquirectangularViewport } from "./world/projection.js";
import { sceneRenderParams, composeRects, shouldRecenterScene, snapSceneViewportCenter } from "./world/scene-compose.js";
import { createTerrainGrid, prepareTerrainHillshade } from "./world/terrain.js";
import { buildPhysicalCellsFromTerrainGrid, createPhysicalWorld, applyPhysicalEvent, refinePhysicalWorldForImpact, expirePhysicalSurfaceEffects } from "./world/physical-geography.js";
import { loadPoliticalBoundaries, loadAdministrativeBoundaries, loadAdministrativeRegions } from "./world/historical-boundaries.js";
import { loadOptionalGeoJson, fetchMapAsset, downloadFullMapPack, getMapPackStatus, purgeObsoleteLakeCaches, REGIONAL_LAND_DATA_PATH, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH, selectMapLayerDetailLevel, getRegionalWarmupProfile } from "./world/map-lod.js";

let state = createGameState();
let interval = null;
let worldFeatures = null;
let lakeFeatures = null;
let riverFeatures = null;
let glacierFeatures = null;
let elevationPoints = null;
let mapLabels = null;
let politicalBoundaryFeatures = null;
let administrativeBoundaryFeatures = null;
let territoryFeatures = null;
let territoryLabelFeatures = null;
let previewCountry = "";
let playerCountry = "";
let boundaryRequestedKey = null;
let boundaryLoadPromise = null;
let boundarySourceLabel = "frontières en attente";
let terrainGrid = null;
let regionalLandFeatures = null;
let regionalLandLoadPromise = null;
let regionalLandLoadAttempted = false;
let regionalRiverFeatures = null;
let regionalLabelFeatures = null;
let regionalRiverLoadAttempted = false;
let regionalLabelLoadAttempted = false;
let mapLabelHits = [];
let mapRenderFrame = null;
let mapPrefetchHandle = null;
let mapPrefetchUsesIdleCallback = false;
let lastMapPrefetchViewport = null;
let lastMapTilePlan = null;
let lastRenderedMapSignature = null;
let interactionRenderTimer = null;
let interactionPreviewTimer = null;
let interactionRenderAllowed = false;
let lastDragMoved = false;
let mapInteractionActive = false;
const sceneCanvas = document.createElement("canvas");
let sceneViewport = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
let sceneSize = { w: 0, h: 0, f: 1 };
let sceneOcean = "#10232c";
let sceneLabelHits = [];
let sceneReady = false;
let mapRenderWorker = null;
let mapRenderWorkerDisabled = false;
let mapRenderWorkerBusy = false;
let mapRenderWorkerPending = null;
let mapRenderWorkerActive = null;
let mapRenderWorkerSequence = 0;
let mapRenderWorkerLayerRefs = Object.create(null);
let sceneRecenterPending = false;
let lastSceneRecenterAt = 0;
const OVERSCAN = 1.4;
// Le rendu cartographique est volontairement plafonné à 1,25× : sur les écrans
// Retina, cela réduit fortement le nombre de pixels à composer sans dégrader
// sensiblement la lecture à l'échelle normale.
const MAP_PIXEL_RATIO = Math.min(1.25, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
let combinedLabelSources = { base: null, territories: null, collection: null };
function getCombinedLabelCollection(base, territories) {
  if (combinedLabelSources.base !== base || combinedLabelSources.territories !== territories) {
    combinedLabelSources = { base, territories, collection: {
      type: "FeatureCollection",
      features: [...(base?.features ?? []), ...(territories?.features ?? [])]
    }};
  }
  return combinedLabelSources.collection;
}
let activeGeoEventMode = null;
const mapViewport = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
let mapDrag = null;
let mapCanvas = null;
function viewSize() {
  const frame = mapCanvas?.parentElement;
  const availableWidth = frame?.clientWidth || mapCanvas?.clientWidth || 960;
  const availableHeight = frame?.clientHeight || availableWidth * 0.5;
  const width = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * 2)));
  return { width, height: Math.max(1, Math.round(width * 0.5)) };
}
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 20;
const $ = (id) => document.getElementById(id);
let initialLoadingFinished=false;
let loadingProgressValue=5,loadingProgressTarget=5,loadingAnimationFrame=null;
let mapWarmupPromise=null,mapIndexWarmupStarted=false;
const loadingStages=["Initialisation du monde","Chargement des cartes","Préparation du relief","Synchronisation historique","Ouverture de la campagne"];
function animateLoadingProgress(target){
  loadingProgressTarget=Math.max(0,Math.min(100,target));
  if(loadingAnimationFrame!==null)return;
  const tick=()=>{
    const delta=loadingProgressTarget-loadingProgressValue;
    loadingProgressValue+=delta*0.13;
    if(Math.abs(delta)<0.18)loadingProgressValue=loadingProgressTarget;
    const pct=Math.round(loadingProgressValue*10)/10;
    $("loading-progress").style.width=pct+"%";
    $("loading-percent").textContent=Math.round(pct)+"%";
    if(loadingProgressValue!==loadingProgressTarget)loadingAnimationFrame=requestAnimationFrame(tick);
    else loadingAnimationFrame=null;
  };
  loadingAnimationFrame=requestAnimationFrame(tick);
}
function setInitialLoading(stage,message,progress=null){
  if(initialLoadingFinished)return;
  const n=Math.max(0,Math.min(4,stage)),pct=progress??[5,28,54,78,92][n];
  animateLoadingProgress(pct);
  $("loading-stage").textContent=loadingStages[n];
  $("loading-message").textContent=message;
  $("loading-status").textContent="ÉTAPE "+(n+1)+" / 5";
}
function setMapCacheStatus(message,kind="loading"){
  const node=$("map-cache-status");if(!node)return;
  node.textContent=message;node.dataset.state=kind;
}
function startMapWarmup(){
  // Les couches 1:10m sont chargées individuellement au seuil de zoom utile.
  if(mapWarmupPromise)return mapWarmupPromise;
  setMapCacheStatus("Atlas régionaux chargés à la demande pour préserver la fluidité.","ready");
  mapWarmupPromise=Promise.resolve(null);
  return mapWarmupPromise;
}
function scheduleMapIndexWarmup(){
  if(mapIndexWarmupStarted)return;
  mapIndexWarmupStarted=true;
  const collections=[worldFeatures,lakeFeatures,riverFeatures,mapLabels,territoryFeatures].filter(collection=>collection?.features?.length);
  let cursor=0;
  const idle=deadline=>{
    let didWork=false;
    while(cursor<collections.length&&(!deadline||deadline.timeRemaining()>8||!didWork)){
      const collection=collections[cursor++];
      try{prefetchGeoSpatialFeatures(collection,{zoom:2,centerLongitude:0,centerLatitude:0},1);}catch(error){console.info("Préparation différée d’index cartographique :",error);}
      didWork=true;
    }
    if(cursor<collections.length){
      if(typeof requestIdleCallback==="function")requestIdleCallback(idle,{timeout:1800});
      else setTimeout(()=>idle(null),80);
    }
  };
  if(typeof requestIdleCallback==="function")requestIdleCallback(idle,{timeout:1200});
  else setTimeout(()=>idle(null),250);
}
function completeInitialLoading(){
  if(initialLoadingFinished)return;
  initialLoadingFinished=true;
  animateLoadingProgress(100);
  $("loading-stage").textContent="Le monde est prêt";
  $("loading-message").textContent="Les frontières sont établies. Votre histoire peut commencer.";
  document.body.classList.add("world-ready");
  scheduleMapIndexWarmup();
  setTimeout(()=>$("initial-loading")?.setAttribute("aria-hidden","true"),650);
}
function failInitialLoading(error){
  if(initialLoadingFinished)return;
  $("loading-stage").textContent="Chargement interrompu";
  $("loading-message").textContent="Certaines données n’ont pas pu être chargées : "+(error?.message??"erreur inconnue");
  $("loading-retry").hidden=false;
  $("loading-retry").addEventListener("click",()=>location.reload(),{once:true});
}

function updateMapControls() {
  $("map-zoom-level").textContent = Math.round(mapViewport.zoom * 100) + " %";
  $("map-zoom-out").disabled = mapViewport.zoom <= MIN_MAP_ZOOM;
  $("map-zoom-in").disabled = mapViewport.zoom >= MAX_MAP_ZOOM;
}

function zoomMap(factor, anchorX, anchorY, shouldRender = true, rectOverride = null) {
  const canvas = $("world-map");
  const rect = rectOverride ?? canvas.getBoundingClientRect();
  const x = anchorX ?? rect.width / 2;
  const y = anchorY ?? rect.height / 2;
  const ratioX = rect.width ? x / rect.width - 0.5 : 0;
  const ratioY = rect.height ? y / rect.height - 0.5 : 0;
  const oldZoom = mapViewport.zoom;
  const newZoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, oldZoom * factor));
  if (newZoom === oldZoom) return;
  const longitudeAtAnchor = mapViewport.centerLongitude + ratioX * 360 / oldZoom;
  const latitudeAtAnchor = mapViewport.centerLatitude - ratioY * 180 / oldZoom;
  mapViewport.zoom = newZoom;
  mapViewport.centerLongitude = longitudeAtAnchor - ratioX * 360 / newZoom;
  mapViewport.centerLatitude = latitudeAtAnchor + ratioY * 180 / newZoom;
  Object.assign(mapViewport, constrainEquirectangularViewport(mapViewport, MAX_MAP_ZOOM));
  if (shouldRender) renderMap();
  updateMapControls();
}

function resetMapView() {
  mapViewport.zoom = 1;
  mapViewport.centerLongitude = 0;
  mapViewport.centerLatitude = 0;
  if (interactionRenderTimer !== null) clearTimeout(interactionRenderTimer);
  if (interactionPreviewTimer !== null) clearTimeout(interactionPreviewTimer);
  interactionRenderTimer = null;
  interactionPreviewTimer = null;
  interactionRenderAllowed = false;
  mapInteractionActive = false;
  renderMap();
  updateMapControls();
}

function renderMap() {
  if (state.physicalWorld) state.physicalWorld = expirePhysicalSurfaceEffects(state.physicalWorld, state.clock.date);
  if (!worldFeatures || mapRenderFrame !== null) return;
  mapRenderFrame = requestAnimationFrame(() => {
    mapRenderFrame = null;
    renderMapFrame();
  });
}

function cancelMapPrefetch() {
  if (mapPrefetchHandle === null) return;
  if (mapPrefetchUsesIdleCallback && typeof cancelIdleCallback === "function") cancelIdleCallback(mapPrefetchHandle);
  else clearTimeout(mapPrefetchHandle);
  mapPrefetchHandle = null;
}
function scheduleMapPrefetch(collections) {
  cancelMapPrefetch();
  if (mapInteractionActive || mapViewport.zoom <= 1.001) return;
  const previous = lastMapPrefetchViewport;
  const zoomDirection = previous ? Math.sign(mapViewport.zoom - previous.zoom) : 0;
  const direction = previous ? {
    x: mapViewport.centerLongitude - previous.centerLongitude,
    y: previous.centerLatitude - mapViewport.centerLatitude
  } : { x: 0, y: 0 };
  // Les différences de longitude sont cycliques autour de l'antiméridien.
  if (direction.x > 180) direction.x -= 360;
  if (direction.x < -180) direction.x += 360;
  lastMapPrefetchViewport = { ...mapViewport };
  // Pyramide de tuiles avec marge et priorité directionnelle. Les index GeoJSON
  // existants restent le moteur de sélection pendant cette étape de transition.
  const tilePlan = getMapTilePyramidPlan(mapViewport, { previousViewport: previous, overscan: 1.6, maxTiles: 48 });
  lastMapTilePlan = tilePlan;
  let index = 0;
  const prepareNext = () => {
    mapPrefetchHandle = null;
    if (mapInteractionActive) return;
    while (index < collections.length && !collections[index]?.features) index++;
    if (index >= collections.length) return;
    // Priorité à l'emprise élargie, avec un biais vers la trajectoire récente.
    // Une famille par tranche inactive : le rendu visible reste prioritaire.
    prefetchGeoSpatialFeatures(collections[index++], mapViewport, 1, {
      coverage: tilePlan.truncated ? 1.35 : 1.6, lookAhead: 0.55, direction, zoomDirection
    });
    if (index >= collections.length || mapInteractionActive) return;
    if (typeof requestIdleCallback === "function") {
      mapPrefetchUsesIdleCallback = true;
      mapPrefetchHandle = requestIdleCallback(prepareNext, { timeout: 900 });
    } else {
      mapPrefetchUsesIdleCallback = false;
      mapPrefetchHandle = setTimeout(prepareNext, 32);
    }
  };
  if (typeof requestIdleCallback === "function") {
    mapPrefetchUsesIdleCallback = true;
    mapPrefetchHandle = requestIdleCallback(prepareNext, { timeout: 700 });
  } else {
    mapPrefetchUsesIdleCallback = false;
    mapPrefetchHandle = setTimeout(prepareNext, 90);
  }
}

function updateMapDiagnostics(result) {
  const total = $("map-perf-total");
  const layers = $("map-perf-layers");
  if (!total || !layers) return;
  total.textContent = (result.totalRenderMs ?? 0).toFixed(1) + " ms";
  const labels = {
    "relief-base": "Relief de base", "terres-et-cotes": "Terres et côtes",
    territoires: "Territoires", "ombrage-multidirectionnel": "Ombrage du relief",
    "catastrophes-et-geographie": "Catastrophes et géographie",
    "frontieres-politiques": "Frontières politiques",
    "frontieres-administratives": "Frontières administratives", etiquettes: "Étiquettes"
  };
  layers.replaceChildren(...Object.entries(result.renderTimings ?? {}).map(([key, value]) => {
    const item = document.createElement("span");
    item.textContent = (labels[key] ?? key) + " : " + value.toFixed(1) + " ms";
    return item;
  }));
}

const MAP_WORKER_LAYER_FAMILIES = ["physical", "political", "dynamic"];
function getMapRenderWorker() {
  if (mapRenderWorkerDisabled || typeof Worker !== "function" || typeof OffscreenCanvas !== "function") return null;
  if (mapRenderWorker) return mapRenderWorker;
  try {
    mapRenderWorker = new Worker(new URL("./world/map-render-worker.js", import.meta.url), { type: "module" });
    // Un Worker neuf ne possède aucun des objets précédemment mémorisés.
    mapRenderWorkerLayerRefs = Object.create(null);
    mapRenderWorker.addEventListener("message", event => {
      const active = mapRenderWorkerActive;
      mapRenderWorkerActive = null;
      mapRenderWorkerBusy = false;
      const message = event.data ?? {};
      if (message.error) {
        mapRenderWorkerDisabled = true;
        mapRenderWorker?.terminate();
        mapRenderWorker = null;
        mapRenderWorkerLayerRefs = Object.create(null);
        const latest = mapRenderWorkerPending ?? active;
        mapRenderWorkerPending = null;
        if (latest) latest.onFallback();
        return;
      }
      const pending = mapRenderWorkerPending;
      if (pending) {
        message.bitmap?.close?.();
        mapRenderWorkerPending = null;
        dispatchMapWorkerRender(pending);
        return;
      }
      if (!active || message.id !== active.id) {
        message.bitmap?.close?.();
        return;
      }
      const bitmap = message.bitmap;
      if (!bitmap) {
        active.onFallback();
        return;
      }
      sceneCanvas.width = bitmap.width;
      sceneCanvas.height = bitmap.height;
      const context = sceneCanvas.getContext("2d");
      context?.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      active.onDone(message.result);
    });
    mapRenderWorker.addEventListener("error", () => {
      mapRenderWorkerDisabled = true;
      mapRenderWorker?.terminate();
      mapRenderWorker = null;
      mapRenderWorkerBusy = false;
      mapRenderWorkerLayerRefs = Object.create(null);
      const latest = mapRenderWorkerPending ?? mapRenderWorkerActive;
      mapRenderWorkerPending = null;
      mapRenderWorkerActive = null;
      latest?.onFallback();
    });
  } catch (error) {
    console.info("Rendu cartographique déporté indisponible, rendu local conservé :", error);
    mapRenderWorkerDisabled = true;
    mapRenderWorker = null;
  }
  return mapRenderWorker;
}
function dispatchMapWorkerRender(job) {
  if (!mapRenderWorker || mapRenderWorkerDisabled) {
    job.onFallback();
    return;
  }
  const familyUpdates = {};
  for (const family of MAP_WORKER_LAYER_FAMILIES) {
    if (mapRenderWorkerLayerRefs[family] !== job.families[family]) {
      familyUpdates[family] = job.families[family];
    }
  }
  const {
    lakes, rivers, glaciers, elevationPoints, labels, territories, physicalWorld,
    politicalBoundaries, administrativeBoundaries, terrain, ...options
  } = job.options;
  try {
    mapRenderWorker.postMessage({ id: job.id, familyUpdates, options });
    for (const family of Object.keys(familyUpdates)) mapRenderWorkerLayerRefs[family] = job.families[family];
    mapRenderWorkerBusy = true;
    mapRenderWorkerActive = job;
  } catch (error) {
    console.warn("Transfert des familles cartographiques au Worker impossible :", error);
    mapRenderWorkerDisabled = true;
    mapRenderWorker.terminate();
    mapRenderWorker = null;
    mapRenderWorkerLayerRefs = Object.create(null);
    job.onFallback();
  }
}
function renderMapOffThread(land, options, onDone, onFallback) {
  const worker = getMapRenderWorker();
  if (!worker) return false;
  const layers = {
    land, lakes: options.lakes, rivers: options.rivers, glaciers: options.glaciers,
    elevationPoints: options.elevationPoints, labels: options.labels,
    territories: options.territories, physicalWorld: options.physicalWorld,
    politicalBoundaries: options.politicalBoundaries,
    administrativeBoundaries: options.administrativeBoundaries, terrain: options.terrain
  };
  const families = createMapLayerFamilies(layers);
  const job = { id: ++mapRenderWorkerSequence, families, options, onDone, onFallback };
  if (mapRenderWorkerBusy) mapRenderWorkerPending = job;
  else dispatchMapWorkerRender(job);
  return true;
}
function completeMapRender(result, context) {
  if (!result) return;
  sceneViewport = context.sceneViewport;
  sceneSize = context.sceneSize;
  sceneOcean = result.theme.colors.ocean;
  sceneLabelHits = result.labelHits ?? [];
  sceneReady = true;
  sceneRecenterPending = false;
  requestCompose();
  updateMapDiagnostics(result);
  if (territoryFeatures) completeInitialLoading();
  $("map-era").textContent = result.theme.label;
  const terrainStatus = result.terrainEnabled ? " · relief ETOPO actif" : " · relief ETOPO non installé";
  const regionalLayerCount = [context.landDetail, context.riverDetail, context.labelDetail].filter(layer => layer.level === "regional-10m").length;
  const fallbackLayerCount = [context.landDetail, context.riverDetail, context.labelDetail].filter(layer => layer.isFallback).length;
  const detailStatus = regionalLayerCount
    ? ` · ${regionalLayerCount}/3 couches régionales 1:10m${fallbackLayerCount ? ` (${fallbackLayerCount} en repli)` : ""}`
    : fallbackLayerCount ? " · données régionales absentes : fond mondial" : " · fond mondial";
  $("map-status").textContent = `${result.landCount} terres · ${result.territoryCount} territoires colorés · ${result.lakeCount} lacs · ${result.riverCount} cours d’eau · ${result.glacierCount} zones glaciaires · ${result.elevationPointCount} repères · ${result.physicalChangeCount ?? 0} zones transformées · frontières politiques ${result.politicalBoundaryCount} (${boundarySourceLabel}) · limites administratives ${result.administrativeBoundaryCount}${terrainStatus}${detailStatus}`;
  updateMapControls();
  scheduleMapPrefetch([context.landDetail.features, context.lakeDetail.features, context.riverDetail.features, context.labelDetail.features]);
}

function renderMapFrame() {
  // Un chargement régional ou une invalidation asynchrone ne doit jamais
  // lancer un rendu complet pendant que le joueur manipule la carte.
  if (!worldFeatures || (mapInteractionActive && !interactionRenderAllowed)) return;
  if (mapInteractionActive) interactionRenderAllowed = false;
  const regionalWarmup = getRegionalWarmupProfile(mapViewport.zoom);
  if (regionalWarmup.land && !regionalLandFeatures && !regionalLandLoadAttempted) {
    regionalLandLoadAttempted = true;
    regionalLandLoadPromise = loadOptionalGeoJson(REGIONAL_LAND_DATA_PATH).then(features => {
      regionalLandFeatures = simplifyGeoJsonCollection(filterSmallIslandComponents(features,100,false),0.0018);
      if (features) {
        lastRenderedMapSignature = null;
        renderMap();
      } else {
        console.info("Fond régional Natural Earth absent : conservation du fond mondial.");
      }
    });
  }
  // Les couches sont demandées selon leur utilité visuelle : les noms de villes
  // arrivent avant les détails physiques, les réseaux hydrographiques plus tard.
  const activateRegionalLayer = (loader, assign, label) => loader.then(features => {
    if (!features) return;
    assign(features);
    lastRenderedMapSignature = null;
    renderMap();
  }).catch(error => console.warn("Couche régionale " + label + " indisponible :", error));
  if (regionalWarmup.labels && !regionalLabelLoadAttempted) {
    regionalLabelLoadAttempted = true;
    activateRegionalLayer(loadOptionalGeoJson(REGIONAL_LABELS_DATA_PATH), features => { regionalLabelFeatures = features; }, "labels");
  }
  if (regionalWarmup.rivers && !regionalRiverLoadAttempted) {
    regionalRiverLoadAttempted = true;
    activateRegionalLayer(loadOptionalGeoJson(REGIONAL_RIVERS_DATA_PATH), features => { regionalRiverFeatures = simplifyGeoJsonCollection(features,0.0015); }, "rivières");
  }
  const { width, height } = viewSize();
  const { f, Ws, Hs, renderViewport } = sceneRenderParams(mapViewport, width, height, OVERSCAN);
  const snappedSceneViewport = snapSceneViewportCenter(mapViewport, renderViewport.zoom);
  renderViewport.centerLongitude = snappedSceneViewport.centerLongitude;
  renderViewport.centerLatitude = snappedSceneViewport.centerLatitude;
  const year = Number(String(state.clock.date).slice(0, 4));
  const administrativeDetail = mapViewport.zoom >= 7 ? "regional" : "world";
  const boundaryRequestKey = year + ":" + administrativeDetail;
  if (boundaryRequestedKey !== boundaryRequestKey && !boundaryLoadPromise) {
    boundaryRequestedKey = boundaryRequestKey;
    boundaryLoadPromise = Promise.all([
      loadPoliticalBoundaries(year),
      loadAdministrativeBoundaries(year, mapViewport.zoom),
      loadAdministrativeRegions(year).catch(error => {
        console.warn("Noms des provinces indisponibles :", error);
        return null;
      })
    ]).then(([political, administrative, administrativeRegions]) => {
      politicalBoundaryFeatures = simplifyGeoJsonCollection(political?.collection ?? null,0.0035);
      territoryFeatures = simplifyGeoJsonCollection(filterSmallIslandComponents(political?.territories ?? null,100,true),0.0035);
      populateCampaignCountries();
      administrativeBoundaryFeatures = simplifyGeoJsonCollection(administrative,0.0045);
      territoryLabelFeatures = buildTerritoryLabels(territoryFeatures, administrativeRegions);
      boundarySourceLabel = political?.sourceYear
        ? (political.exact ? String(political.sourceYear) : "≈ " + political.sourceYear)
        : "indisponible";
      lastRenderedMapSignature = null;
      renderMap();
    }).catch(error => {
      console.warn("Couches de frontières indisponibles :", error);
      boundarySourceLabel = "indisponibles";
      failInitialLoading(error);
    }).finally(() => { boundaryLoadPromise = null; });
  }
  const signature = [
    width, height, year, state.physicalWorld?.revision ?? 0, mapViewport.zoom.toFixed(4),
    snappedSceneViewport.centerLongitude.toFixed(4), snappedSceneViewport.centerLatitude.toFixed(4),
    playerCountry || previewCountry, $("terrain-mode")?.value ?? "political",
    Number($("country-opacity")?.value ?? 52)
  ].join(':');
  if (signature === lastRenderedMapSignature) {
    // Le bitmap suffit toujours ; reconstruire uniquement les hitboxes après le relâchement.
    requestCompose();
    return;
  }
  lastRenderedMapSignature = signature;
  const landDetail = selectMapLayerDetailLevel(mapViewport.zoom, worldFeatures, regionalLandFeatures, 6);
  const lakeDetail = selectMapLayerDetailLevel(mapViewport.zoom, lakeFeatures, null, Infinity);
  const riverDetail = selectMapLayerDetailLevel(mapViewport.zoom, riverFeatures, regionalRiverFeatures, 8);
  const labelDetail = selectMapLayerDetailLevel(mapViewport.zoom, mapLabels, regionalLabelFeatures, 4);
  const renderOptions = {
    width: Ws, height: Hs, year,
    projection: "equirectangular",
    viewport: renderViewport,
    lodZoom: mapViewport.zoom,
    renderScale: Ws / width,
    lakes: lakeDetail.features,
    rivers: riverDetail.features,
    glaciers: glacierFeatures,
    elevationPoints,
    labels: getCombinedLabelCollection(labelDetail.features, territoryLabelFeatures),
    territories: territoryFeatures,
    physicalWorld: state.physicalWorld,
    selectedCountry: playerCountry || previewCountry,
    politicalBoundaries: politicalBoundaryFeatures,
    administrativeBoundaries: administrativeBoundaryFeatures,
    terrain: terrainGrid,
    terrainEnabled: true,
    terrainQuality: mapViewport.zoom < 2.5 ? 0.75 : mapViewport.zoom < 6 ? 0.85 : 0.9,
    terrainMode: $("terrain-mode")?.value ?? "political",
    countryOpacity: Number($("country-opacity")?.value ?? 52) / 100,
    pixelRatio: MAP_PIXEL_RATIO,
    interactive: false,
    physicalOverlayContext: null,
  };
  const completionContext = {
    sceneViewport: { ...mapViewport, centerLongitude: snappedSceneViewport.centerLongitude, centerLatitude: snappedSceneViewport.centerLatitude },
    sceneSize: { w: Ws, h: Hs, f }, landDetail, lakeDetail, riverDetail, labelDetail
  };
  const fallback = () => {
    try { completeMapRender(renderWorldMap(sceneCanvas, landDetail.features, renderOptions), completionContext); }
    catch (error) { console.error("Échec du rendu cartographique local :", error); }
  };
  if (!renderMapOffThread(landDetail.features, renderOptions, result => completeMapRender(result, completionContext), fallback)) fallback();
}

async function installFullMapPack() {
  const button = $("install-map-pack");
  const status = $("map-pack-status");
  button.disabled = true;
  try {
    await downloadFullMapPack(progress => {
      status.textContent = "Pack cartographique " + progress.current + "/" + progress.total + " : " + progress.label + (progress.cached ? " · déjà en cache" : " · téléchargement") + "…";
    });
    regionalLandFeatures = null;
    regionalRiverFeatures = null;
    regionalLabelFeatures = null;
    regionalLandLoadAttempted = false;
    regionalRiverLoadAttempted = false;
    regionalLabelLoadAttempted = false;
    lastRenderedMapSignature = null;
    button.textContent = "Pack cartographique installé";
    status.textContent = "Pack complet prêt : 6 ressources de base et 3 couches régionales. Les détails se chargeront à la demande pour préserver la fluidité.";
    renderMap();
  } catch (error) {
    status.textContent = "Installation interrompue : " + error.message;
    button.textContent = "Reprendre le téléchargement du pack";
  } finally {
    button.disabled = false;
  }
}

async function loadWorldMap() {
  setInitialLoading(1,"Lecture des données géographiques…");
  try {
    await purgeObsoleteLakeCaches();
    const responses = await Promise.all([
      fetchMapAsset("./data/ne_110m_land.geojson"),
      fetch("./data/ne_110m_lakes.geojson"),
      fetchMapAsset("./data/ne_110m_rivers.geojson"),
      fetchMapAsset("./data/ne_110m_glaciated_areas.geojson"),
      fetchMapAsset("./data/ne_110m_elevation_points.geojson"),
      fetchMapAsset("./data/ne_110m_map_labels.geojson")
    ]);
    for (const response of responses) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    [worldFeatures, lakeFeatures, riverFeatures, glacierFeatures, elevationPoints, mapLabels] =
      await Promise.all(responses.map(response => response.json()));
    worldFeatures = simplifyGeoJsonCollection(filterSmallIslandComponents(worldFeatures,100,false),0.008);
    lakeFeatures = simplifyGeoJsonCollection(filterMajorLakeFeatures(lakeFeatures,500),0.006);
    riverFeatures = simplifyGeoJsonCollection(riverFeatures,0.005);
    glacierFeatures = simplifyGeoJsonCollection(glacierFeatures,0.008);
    setInitialLoading(2,"Atlas mondial assemblé · préparation du relief…");
    if(typeof requestIdleCallback==="function")requestIdleCallback(()=>{void startMapWarmup();},{timeout:1400});else setTimeout(()=>{void startMapWarmup();},350);
    try {
      const terrainResponse = await fetchMapAsset("./data/terrain/etopo_global_10m_i16.bin");
      if (terrainResponse.ok) {
        terrainGrid = createTerrainGrid(await terrainResponse.arrayBuffer());
        prepareTerrainHillshade(terrainGrid).then(ready => { if (ready) { lastRenderedMapSignature = null; renderMap(); } });
        if (!state.physicalWorld?.currentCells?.length) {
          const physicalCells = buildPhysicalCellsFromTerrainGrid(terrainGrid, { step: 12, maxCoastSearchCells: 4 });
          state.physicalWorld = createPhysicalWorld(physicalCells);
          console.info("Grille géophysique initialisée depuis ETOPO :", physicalCells.length, "cellules de 2° environ.");
        }
      }
    } catch (terrainError) {
      console.warn("Grille ETOPO non chargée :", terrainError);
    }
    setInitialLoading(3,"Géographie physique initialisée · synchronisation des frontières historiques…");
    const cacheStatus = await getMapPackStatus();
    if (cacheStatus.ready) {
      $("install-map-pack").textContent = "Pack cartographique installé";
      $("map-pack-status").textContent = "Pack cartographique déjà enregistré dans ce navigateur : données mondiales, relief et détails régionaux.";
    } else {
      $("map-pack-status").textContent = cacheStatus.coreCount + "/" + cacheStatus.coreTotal + " ressources de base en cache · " + cacheStatus.regionalCount + "/3 couches régionales installées.";
      if (cacheStatus.regionalCount > 0) $("install-map-pack").textContent = "Reprendre le téléchargement du pack";
    }
    setInitialLoading(4,"Dernière étape : construction de l’atlas jouable…");
    renderMap();
  } catch (error) {
    $("map-status").textContent = `Carte indisponible : ${error.message}`;
    failInitialLoading(error);
  }
}


const COUNTRY_MAJOR=new Set(["France","England","Castile","Portugal","Ottoman Empire","Ming","Ming Dynasty","Timurid Empire","Mamluk Sultanate","Mali Empire","Poland","Lithuania","Muscovy","Venice","Burgundy","Aragon","Vijayanagara","Delhi Sultanate","Ethiopia","Japan","Holy Roman Empire"]);
const COUNTRY_REGIONAL=new Set(["Scotland","Denmark","Sweden","Norway","Hungary","Bohemia","Novgorod","Golden Horde","Aq Qoyunlu","Qara Qoyunlu","Songhai","Benin","Kongo","Ayutthaya","Majapahit","Korea","Joseon","Chagatai Khanate","Morocco","Tunis","Granada"]);
const COUNTRY_HARD=new Set(["Byzantine Empire","Trebizond","Granada","Irish clans","Novgorod","Mali Empire","Ethiopia","Kongo","Ternate","Theodoro"]),COUNTRY_EASY=new Set(["France","Ming","Ottoman Empire","Castile","Portugal","Muscovy"]);
let campaignCountries=[],selectedCountryFilter={query:"",region:"all",difficulty:"all"};
function countryRegion(feature){const p=feature.properties??{},raw=String(p.CONTINENT||p.continent||p.REGION_UN||p.region||p.SUBREGION||"").toLowerCase();if(/europe/.test(raw))return"Europe";if(/asia/.test(raw))return"Asie";if(/africa/.test(raw))return"Afrique";if(/north america/.test(raw))return"Amérique du Nord";if(/south america/.test(raw))return"Amérique du Sud";if(/oceania|australia/.test(raw))return"Océanie";const pts=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else v.forEach(walk)};walk(feature.geometry?.coordinates);const lon=pts.length?pts.reduce((n,p)=>n+p[0],0)/pts.length:0,lat=pts.length?pts.reduce((n,p)=>n+p[1],0)/pts.length:0;if(lon< -30&&lat>8)return"Amérique du Nord";if(lon< -30)return"Amérique du Sud";if(lon>110&&lat< -5)return"Océanie";if(lon> -20&&lon<55&&lat<38)return"Afrique";if(lon>55||(lon>25&&lat>35))return"Asie";return"Europe";}
function countryDifficulty(raw,region,feature){if(COUNTRY_EASY.has(raw))return 1;if(COUNTRY_HARD.has(raw))return 5;if(COUNTRY_MAJOR.has(raw))return 2;if(COUNTRY_REGIONAL.has(raw))return 3;const p=feature.properties??{},pop=Number(p.POP_EST??p.pop_est??0),area=Number(p.AREA??p.area??0);if(pop>30000000||area>1800000)return 2;if(pop>8000000||area>450000)return 3;return region==="Océanie"||region==="Amérique du Sud"?4:3;}
function countryRank(raw,difficulty,feature){if(COUNTRY_MAJOR.has(raw))return"Puissance majeure";if(COUNTRY_REGIONAL.has(raw))return"Puissance régionale";const p=feature.properties??{};if(Number(p.POP_EST??p.pop_est??0)>30000000||Number(p.AREA??p.area??0)>1800000)return"Grande nation";return difficulty>=4?"Défi historique":"Nation émergente";}
function renderCountryPicker(){const list=$("country-results"),count=$("country-result-count");if(!list)return;const q=selectedCountryFilter.query.trim().toLocaleLowerCase("fr"),items=campaignCountries.filter(x=>(!q||x.label.toLocaleLowerCase("fr").includes(q)||x.raw.toLocaleLowerCase("fr").includes(q))&&(selectedCountryFilter.region==="all"||x.region===selectedCountryFilter.region)&&(selectedCountryFilter.difficulty==="all"||String(x.difficulty)===selectedCountryFilter.difficulty));count.textContent=items.length+" nation"+(items.length>1?"s":"")+" disponible"+(items.length>1?"s":"");list.replaceChildren();const groups=new Map();for(const x of items){if(!groups.has(x.region))groups.set(x.region,[]);groups.get(x.region).push(x)}for(const region of ["Europe","Asie","Afrique","Amérique du Nord","Amérique du Sud","Océanie"]){const group=groups.get(region);if(!group?.length)continue;const head=document.createElement("div");head.className="country-region-heading";head.textContent=region+" · "+group.length;list.append(head);group.sort((x,y)=>x.tier-y.tier||x.label.localeCompare(y.label,"fr"));for(const x of group){const btn=document.createElement("button");btn.type="button";btn.className="country-result"+(x.raw===$("player-country").value?" is-selected":"");btn.setAttribute("aria-pressed",String(x.raw===$("player-country").value));const name=document.createElement("span");name.className="country-result-name";name.textContent=x.label;const meta=document.createElement("span");meta.className="country-result-meta";const rank=document.createElement("span");rank.className="country-rank";rank.textContent=x.rank;const diff=document.createElement("span");diff.className="country-difficulty";diff.textContent="Difficulté "+x.difficulty+"/5";meta.append(rank,diff);btn.append(name,meta);btn.addEventListener("click",()=>selectCampaignCountry(x.raw));list.append(btn)}}}
function renderCountryDossier(item){
 const root=$("country-dossier");if(!root)return;root.replaceChildren();if(!item){root.hidden=true;return;}root.hidden=false;
 const dossier=buildCountryDossier(item.feature,Number(state.clock.date.slice(0,4)),{rank:item.rank,difficulty:item.difficulty,region:item.region});
 const hero=document.createElement("div");hero.className="dossier-hero";
 const emblem=document.createElement("span");emblem.className="dossier-emblem";emblem.textContent=dossier.emblem;
 const heading=document.createElement("div");heading.className="dossier-identity";
 const name=document.createElement("strong");name.textContent=item.label;const subtitle=document.createElement("span");subtitle.textContent=dossier.subtitle;heading.append(name,subtitle);hero.append(emblem,heading);root.append(hero);
 const metrics=document.createElement("div");metrics.className="dossier-metrics";
 for(const metric of dossier.metrics){const cell=document.createElement("div");cell.className="dossier-metric";const label=document.createElement("span");label.textContent=metric.label;const value=document.createElement("strong");value.textContent=metric.value;const note=document.createElement("small");note.textContent=metric.note;cell.append(label,value,note);metrics.append(cell);}root.append(metrics);
 const diplomacy=document.createElement("div");diplomacy.className="dossier-diplomacy";const dlabel=document.createElement("span");dlabel.textContent="SITUATION DIPLOMATIQUE";const dtext=document.createElement("p");dtext.textContent=dossier.diplomacy;diplomacy.append(dlabel,dtext);root.append(diplomacy);
 const objectives=document.createElement("div");objectives.className="dossier-objectives";const title=document.createElement("h4");title.textContent="Vos objectifs de campagne";objectives.append(title);
 dossier.objectives.forEach((objective,index)=>{const row=document.createElement("div");row.className="dossier-objective";const number=document.createElement("span");number.textContent=String(index+1).padStart(2,"0");const text=document.createElement("p");text.textContent=objective;row.append(number,text);objectives.append(row);});root.append(objectives);
 const note=document.createElement("p");note.className="dossier-data-note";note.textContent=dossier.dataNote;root.append(note);
}
function selectCampaignCountry(raw){$("player-country").value=raw;previewCountry=raw;const x=campaignCountries.find(v=>v.raw===raw);$("country-selected-name").textContent=x?.label??"Nation sélectionnée";$("country-selected-detail").textContent=x?x.rank+" · difficulté "+x.difficulty+"/5 · "+x.region:"";renderCountryDossier(x);renderCountryPicker();if(!mapWarmupPromise)void startMapWarmup();scheduleMapIndexWarmup();renderMap();}
function populateCampaignCountries(){const select=$("player-country");if(!select||!territoryFeatures?.features)return;const names=territoryFeatures.features.map(feature=>{const p=feature.properties??{},raw=p.NAME||p.ADMIN||p.name||p.NAME_EN||p.SOVEREIGNT||p.NAME_LONG,status=String(p.historicalStatus??p.status??p.STATUS??"").toLowerCase();if(typeof raw!=="string"||!raw.trim()||["influence","unclaimed","influence-zone"].includes(status)||isNonStateHistoricalRegion(feature))return null;const name=raw.trim(),label=frenchTerritoryName(name,p),region=countryRegion(feature),difficulty=countryDifficulty(name,region,feature),tier=COUNTRY_MAJOR.has(name)?0:COUNTRY_REGIONAL.has(name)?1:2;return{raw:name,label,region,difficulty,tier,rank:countryRank(name,difficulty,feature),feature}}).filter(Boolean);campaignCountries=[...new Map(names.map(x=>[x.raw,x])).values()];const previous=playerCountry||previewCountry||select.value,options='<option value="">Choisir une nation…</option>'+campaignCountries.map(x=>{const safe=x.raw.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));return'<option value="'+safe+'">'+x.label+'</option>'}).join("");select.innerHTML=options;const sandbox=$("sandbox-country");if(sandbox)sandbox.innerHTML=options;const preferred=campaignCountries.find(x=>/france/i.test(x.raw)||x.label==="France"),restored=campaignCountries.find(x=>x.raw===previous)||preferred||campaignCountries[0]||null;select.value=restored?.raw??"";if(!playerCountry)previewCountry=restored?.raw??"";if(sandbox)sandbox.value=playerCountry||restored?.raw||"";if(restored)selectCampaignCountry(restored.raw);else renderCountryPicker();}
$("country-search").addEventListener("input",e=>{selectedCountryFilter.query=e.target.value;renderCountryPicker()});$("country-region-filter").addEventListener("change",e=>{selectedCountryFilter.region=e.target.value;renderCountryPicker()});$("country-difficulty-filter").addEventListener("change",e=>{selectedCountryFilter.difficulty=e.target.value;renderCountryPicker()});
$("player-country").addEventListener("change", event => {
  selectCampaignCountry(event.target.value);
  renderMap();
});
$("sandbox-country").addEventListener("change", event => {
  if (!event.target.value) return;
  playerCountry = event.target.value;
  previewCountry = playerCountry;
  $("map-title").textContent = frenchTerritoryName(event.target.value) + " · " + state.clock.date.slice(0,4);
  $("save-status").textContent = "Sandbox : nation active — " + event.target.value;
  renderMap();
});
$("start-year").addEventListener("input", event => {
  const year = Number(event.target.value);
  $("start-year-value").textContent = String(year);
  state.clock.date = year + "-01-01";
  state.clock.day = 1;
  $("map-title").textContent = "Le monde en " + year;
  render();
});
$("begin-campaign").addEventListener("click", () => {
  const year = Number($("start-year").value);
  const mode = $("campaign-mode").value;
  const country = $("player-country").value;
  if (!country) {
    $("player-country").focus();
    $("player-country").setCustomValidity("Choisissez une nation à diriger.");
    $("player-country").reportValidity();
    return;
  }
  $("player-country").setCustomValidity("");
  playerCountry = country;
  previewCountry = country;
  const month = Number(state.clock.date.slice(5,7));
  const day = Number(state.clock.date.slice(8,10));
  const safeDay = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  state.clock.date = new Date(Date.UTC(year, month - 1, safeDay)).toISOString().slice(0,10);
  state.clock.day = 1;
  state.clock.paused = true;
  document.body.classList.add("campaign-started");
  document.body.classList.toggle("sandbox-mode", mode === "sandbox");
  $("map-title").textContent = frenchTerritoryName(country) + " · " + year;
  $("sandbox-country").value = country;
  $("save-status").textContent = "Campagne : " + country + " · " + year + (mode === "sandbox" ? " · Sandbox" : "");
  schedule();
  render();
});

function render() {
  $("current-date").textContent = formatDate(state.clock.date);
  if (document.body.classList.contains("campaign-started")) $("map-title").textContent = "Le monde en " + state.clock.date.slice(0, 4);
  $("elapsed-days").textContent = "Jour " + state.clock.day.toLocaleString("fr-FR");
  $("run-state").textContent = state.clock.paused ? "EN PAUSE" : "EN COURS";
  $("toggle-clock-label").textContent = state.clock.paused ? "Reprendre le temps" : "Mettre en pause";
  const year = Number(state.clock.date.slice(0, 4));
  $("clock-year").textContent = String(year);
  const era = year < 1492 ? "Âge des royaumes" : year < 1648 ? "Explorations & empires" : year < 1789 ? "Équilibre des puissances" : year < 1914 ? "Révolutions & nations" : year < 2026 ? "Ère contemporaine" : "Ère future";
  $("era-name").textContent = era;
  $("map-era").textContent = era;
  document.querySelectorAll("[data-year]").forEach(button => button.classList.toggle("is-active", Number(button.dataset.year) === year));
  $("year-scrubber").value = String(Number(state.clock.date.slice(0, 4)));
  if (!document.body.classList.contains("campaign-started")) {
    $("start-year").value = String(year);
    $("start-year-value").textContent = String(year);
  }
  document.querySelectorAll("[data-speed]").forEach(button => {
    button.classList.toggle("is-active", Number(button.dataset.speed) === state.clock.speed);
  });
  renderMap();
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
function moveClockToYear(year) {
  const month = Number(state.clock.date.slice(5, 7));
  const day = Number(state.clock.date.slice(8, 10));
  const monthIndex = month - 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const nextDate = new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
  const oldDate = new Date(state.clock.date + "T00:00:00Z");
  const delta = Math.round((nextDate - oldDate) / 86400000);
  state.clock.date = nextDate.toISOString().slice(0, 10);
  state.clock.day = Math.max(1, state.clock.day + delta);
  render();
}
$("advance-year").addEventListener("click", () => {
  moveClockToYear(Math.min(2100, Number(state.clock.date.slice(0, 4)) + 1));
});
document.querySelectorAll("[data-year]").forEach(button => button.addEventListener("click", () => {
  const year = Number(button.dataset.year);
  if (Number.isFinite(year)) moveClockToYear(Math.max(1444, Math.min(2100, year)));
}));
$("year-scrubber").addEventListener("input", event => {
  const year = Math.max(1444, Math.min(2100, Number(event.target.value)));
  moveClockToYear(year);
});
document.querySelectorAll("[data-speed]").forEach(button => button.addEventListener("click", () => {
  const speed = Number(button.dataset.speed);
  if (SPEEDS.includes(speed)) state.clock.speed = speed;
  schedule();
  render();
}));
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

$("install-map-pack").addEventListener("click", installFullMapPack);

$("terrain-mode")?.addEventListener("change", () => { lastRenderedMapSignature = null; renderMap(); });
$("country-opacity")?.addEventListener("input", event => {
 const output=$("country-opacity-value");if(output)output.textContent=event.target.value+" %";
 lastRenderedMapSignature=null;renderMap();
});
mapCanvas = $("world-map");
$("map-zoom-in").addEventListener("click", () => zoomMap(1.5));
$("map-zoom-out").addEventListener("click", () => zoomMap(1 / 1.5));
$("map-reset").addEventListener("click", resetMapView);

mapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  mapDrag = { x: event.clientX, y: event.clientY, centerLongitude: mapViewport.centerLongitude, centerLatitude: mapViewport.centerLatitude };
  mapInteractionActive = true;
  cancelMapPrefetch();
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
    mapCanvas.style.cursor = hit ? "pointer" : "grab";
    if (hit) showMapTooltip(hit, x, y, false);
    else hideMapTooltip();
    return;
  }
  const rect = mapCanvas.getBoundingClientRect();
  const dx = event.clientX - mapDrag.x;
  const dy = event.clientY - mapDrag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) mapDrag.moved = true;
  mapViewport.centerLongitude = mapDrag.centerLongitude - dx / rect.width * 360 / mapViewport.zoom;
  mapViewport.centerLatitude = mapDrag.centerLatitude + dy / rect.height * 180 / mapViewport.zoom;
  Object.assign(mapViewport, constrainEquirectangularViewport(mapViewport, MAX_MAP_ZOOM));
  requestCompose();
  scheduleInteractionRender();
});
function playDisasterSound(type) {
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  try{const ctx=new Audio();ctx.resume().catch(()=>{});const now=ctx.currentTime;
   const tone=(f0,f1,delay,duration,volume,wave)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=wave;o.frequency.setValueAtTime(f0,now+delay);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),now+delay+duration);g.gain.setValueAtTime(.0001,now+delay);g.gain.exponentialRampToValueAtTime(volume,now+delay+.025);g.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);o.connect(g);g.connect(ctx.destination);o.start(now+delay);o.stop(now+delay+duration+.04);};
   if(type==="meteor-impact"){tone(105,28,0,.9,.22,"sawtooth");tone(880,55,0,.48,.09,"triangle");tone(48,24,.16,1.15,.25,"sine");}
   else if(type==="tsunami"){tone(95,42,0,1.6,.17,"sine");tone(210,70,.18,1.35,.1,"triangle");tone(620,180,.05,1.1,.045,"sawtooth");}
   else{tone(52,25,0,1.35,.24,"sawtooth");tone(78,32,.12,1.05,.16,"triangle");tone(190,60,.04,.65,.07,"sine");}
   setTimeout(()=>ctx.close().catch(()=>{}),2200);
  }catch(error){console.info("Audio catastrophe indisponible",error);}
}
function animateMeteorImpact(x, y) {
  const marker = document.createElement("div");
  marker.className = "meteor-impact-animation";
  marker.setAttribute("aria-hidden", "true");
  marker.style.left = (x + (mapCanvas.offsetLeft || 0)) + "px";
  marker.style.top = (y + (mapCanvas.offsetTop || 0)) + "px";
  mapCanvas.parentElement.append(marker);
  setTimeout(() => marker.remove(), 1500);
}
function setGeoEventPlacementMode(type) {
  activeGeoEventMode = activeGeoEventMode === type ? null : type;
  for (const [id,eventType] of [["meteor-test","meteor-impact"],["tsunami-test","tsunami"],["earthquake-test","earthquake"]]) {
    const button = $(id); if (!button) continue;
    const active = activeGeoEventMode === eventType;
    button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active));
    button.textContent = active ? "Clique sur la carte…" : eventType==="meteor-impact" ? "☄ Météorite · test" : eventType==="tsunami" ? "〰 Tsunami · test" : "ϟ Séisme · test";
  }
  mapCanvas.style.cursor = activeGeoEventMode ? "crosshair" : "grab";
  if (activeGeoEventMode) $("save-status").textContent = "Clique sur la carte pour placer "+(activeGeoEventMode==="meteor-impact"?"la météorite":activeGeoEventMode==="tsunami"?"le tsunami":"le séisme")+".";
}
for(const [id,type] of [["meteor-test","meteor-impact"],["tsunami-test","tsunami"],["earthquake-test","earthquake"]]) $(id).addEventListener("click",()=>setGeoEventPlacementMode(type));

function showMapTooltip(label, x, y, selected) {
  const tooltip = $("map-tooltip");
  const kindNames = { continent: "Continent", ocean: "Océan", city: "Ville historique", country: "Pays / territoire", province: "Province ou région" };
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
function composeScene() {
  if (!sceneReady || !mapCanvas || !sceneCanvas.width || !sceneCanvas.height) return;
  const { width, height } = viewSize();
  const backingWidth = Math.max(1, Math.round(width * MAP_PIXEL_RATIO));
  const backingHeight = Math.max(1, Math.round(height * MAP_PIXEL_RATIO));
  if (mapCanvas.width !== backingWidth) mapCanvas.width = backingWidth;
  if (mapCanvas.height !== backingHeight) mapCanvas.height = backingHeight;
  const context = mapCanvas.getContext("2d");
  if (!context) return;
  context.setTransform(MAP_PIXEL_RATIO, 0, 0, MAP_PIXEL_RATIO, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = sceneOcean;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = mapInteractionActive ? "low" : "high";
  const composition = composeRects(mapViewport, sceneViewport, sceneSize, width, height);
  for (const rect of composition.rects) {
    context.drawImage(sceneCanvas, rect.x, rect.y, rect.w, rect.h);
  }
  // Les hitboxes ne servent qu'au survol/clic au repos. Les reconstruire à
  // chaque mouvement de souris pendant un glisser est du travail inutile.
  mapLabelHits = [];
  if (!mapDrag) {
    for (const rect of composition.rects) {
      const scaleX = rect.w / sceneSize.w;
      const scaleY = rect.h / sceneSize.h;
      for (const hit of sceneLabelHits) {
        const bounds = {
          left: rect.x + hit.bounds.left * scaleX,
          right: rect.x + hit.bounds.right * scaleX,
          top: rect.y + hit.bounds.top * scaleY,
          bottom: rect.y + hit.bounds.bottom * scaleY
        };
        if (bounds.right <= 0 || bounds.left >= width || bounds.bottom <= 0 || bounds.top >= height) continue;
        mapLabelHits.push({
          ...hit,
          x: rect.x + hit.x * scaleX,
          y: rect.y + hit.y * scaleY,
          bounds
        });
      }
    }
  }
  // En zoom monde (×1), le panoramique vertical sort naturellement du bitmap :
  // ne surtout pas reconstruire toutes les couches pendant que le pointeur bouge.
  // Le rendu final est déjà programmé au relâchement dans scheduleInteractionRender.
  if (shouldRecenterScene(composition.covered, Boolean(mapDrag))) {
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (!sceneRecenterPending && now - lastSceneRecenterAt > 250) {
      sceneRecenterPending = true;
      lastSceneRecenterAt = now;
      lastRenderedMapSignature = null;
      renderMap();
    }
  }
}
const requestCompose = createMapFrameScheduler(composeScene);
function scheduleInteractionRender() {
  // Pendant un geste continu, une seule actualisation intermédiaire est
  // autorisée par intervalle. Les événements rapprochés sont coalescés.
  if (interactionPreviewTimer === null) {
    interactionPreviewTimer = setTimeout(() => {
      interactionPreviewTimer = null;
      if (!mapInteractionActive) return;
      interactionRenderAllowed = true;
      lastRenderedMapSignature = null;
      renderMap();
    }, INTERACTION_PREVIEW_INTERVAL_MS);
  }

  // À l'arrêt, on abandonne le prochain aperçu éventuel et on lance tout de
  // suite le rendu final haute qualité, sans attendre une longue temporisation.
  if (interactionRenderTimer !== null) clearTimeout(interactionRenderTimer);
  interactionRenderTimer = setTimeout(() => {
    interactionRenderTimer = null;
    if (interactionPreviewTimer !== null) clearTimeout(interactionPreviewTimer);
    interactionPreviewTimer = null;
    interactionRenderAllowed = false;
    mapInteractionActive = false;
    lastRenderedMapSignature = null;
    renderMap();
  }, INTERACTION_SETTLE_DELAY_MS);
}
function stopMapDrag() {
  if (mapDrag) lastDragMoved = mapDrag.moved;
  mapDrag = null;
  mapCanvas.classList.remove("is-dragging");
  if (lastDragMoved) scheduleInteractionRender();
  else mapInteractionActive = false;
}
mapCanvas.addEventListener("click", (event) => {
  if (lastDragMoved) { lastDragMoved = false; return; }
  const rect = mapCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (activeGeoEventMode) {
    const longitude=((mapViewport.centerLongitude+(x/rect.width-.5)*360/mapViewport.zoom+540)%360)-180;
    const latitude=Math.max(-89.5,Math.min(89.5,mapViewport.centerLatitude-(y/rect.height-.5)*180/mapViewport.zoom));
    const type=activeGeoEventMode;
    try {
      playDisasterSound(type);
      if(type==="meteor-impact")animateMeteorImpact(x,y);
      const event={id:type+"-"+Date.now()+"-"+(state.physicalWorld?.revision??0),type,date:state.clock.date,longitude,latitude,
       ...(type==="meteor-impact"?{radiusKm:320,craterRadiusKm:125,craterDepthM:2200,rimHeightM:520,lavaRadiusKm:22,noManLandRadiusKm:65,surfaceDurationMonths:1}:{}),
       ...(type==="tsunami"?{radiusKm:900,waveHeightM:24,maxCoastalDistanceKm:420}:{}),
       ...(type==="earthquake"?{radiusKm:700,magnitude:8.8,ruptureOffsetM:28,ruptureBearingDeg:35}:{})};
      const refined=refinePhysicalWorldForImpact(state.physicalWorld,terrainGrid,event,2);
      const result=applyPhysicalEvent(refined,event);state.physicalWorld=result.world;
      const label=type==="meteor-impact"?"Météorite":type==="tsunami"?"Tsunami":"Séisme";
      $("save-status").textContent=label+" : "+latitude.toFixed(2)+"°, "+longitude.toFixed(2)+"° · "+result.result.affectedCells.length+" cellules touchées.";
      setGeoEventPlacementMode(null);lastRenderedMapSignature=null;renderMap();
    }catch(error){$("save-status").textContent="Événement impossible : "+error.message;}
    return;
  }
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
  const anchorX = event.clientX - rect.left;
  const anchorY = event.clientY - rect.top;
  mapInteractionActive = true;
  cancelMapPrefetch();
  zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, anchorX, anchorY, false, { width: rect.width, height: rect.height });
  requestCompose();
  scheduleInteractionRender();
}, { passive: false });

state.clock = createClock();
render();
updateMapControls();
loadWorldMap();
window.addEventListener("resize", () => renderMap());
