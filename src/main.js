import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { renderWorldMap, buildTerritoryLabels } from "./world/map-renderer.js";
import { prefetchGeoSpatialFeatures } from "./world/geo-spatial-index.js";
import { constrainEquirectangularViewport } from "./world/projection.js";
import { createTerrainGrid } from "./world/terrain.js";
import { buildPhysicalCellsFromTerrainGrid, createPhysicalWorld } from "./world/physical-geography.js";
import { loadPoliticalBoundaries, loadAdministrativeBoundaries, loadAdministrativeRegions } from "./world/historical-boundaries.js";
import { loadOptionalGeoJson, fetchMapAsset, downloadFullMapPack, getMapPackStatus, REGIONAL_LAND_DATA_PATH, REGIONAL_LAKES_DATA_PATH, REGIONAL_RIVERS_DATA_PATH, REGIONAL_LABELS_DATA_PATH, selectMapLayerDetailLevel } from "./world/map-lod.js";

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
let regionalHydroFeatures = null;
let regionalRiverFeatures = null;
let regionalLabelFeatures = null;
let regionalHydroLoadAttempted = false;
let regionalLabelLoadAttempted = false;
let mapLabelHits = [];
let mapRenderFrame = null;
let mapPrefetchHandle = null;
let mapPrefetchUsesIdleCallback = false;
let lastRenderedMapSignature = null;
let wheelZoomState = null;
let wheelZoomTimer = null;
let lastDragMoved = false;
let mapInteractionActive = false;
const mapViewport = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
let mapDrag = null;
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 35;
const $ = (id) => document.getElementById(id);

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
  clearWheelZoomPreview();
  renderMap();
  updateMapControls();
}

function renderMap() {
  if (!worldFeatures || mapRenderFrame !== null) return;
  mapRenderFrame = requestAnimationFrame(() => {
    mapRenderFrame = null;
    renderMapFrame();
  });
}

function scheduleMapPrefetch(collections) {
  if (mapInteractionActive || mapViewport.zoom <= 1.001) return;
  if (mapPrefetchHandle !== null) {
    if (mapPrefetchUsesIdleCallback && typeof cancelIdleCallback === "function") cancelIdleCallback(mapPrefetchHandle);
    else clearTimeout(mapPrefetchHandle);
    mapPrefetchHandle = null;
  }
  const prepare = () => {
    mapPrefetchHandle = null;
    if (mapInteractionActive) return;
    for (const collection of collections) {
      if (collection?.features) prefetchGeoSpatialFeatures(collection, mapViewport, 1);
    }
  };
  if (typeof requestIdleCallback === "function") {
    mapPrefetchUsesIdleCallback = true;
    mapPrefetchHandle = requestIdleCallback(prepare, { timeout: 700 });
  } else {
    mapPrefetchUsesIdleCallback = false;
    mapPrefetchHandle = setTimeout(prepare, 90);
  }
}

function renderMapFrame() {
  if (!worldFeatures) return;
  if (mapViewport.zoom >= 4 && !regionalLandFeatures && !regionalLandLoadAttempted) {
    regionalLandLoadAttempted = true;
    regionalLandLoadPromise = loadOptionalGeoJson(REGIONAL_LAND_DATA_PATH).then(features => {
      regionalLandFeatures = features;
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
  if (mapViewport.zoom >= 3 && !regionalLabelLoadAttempted) {
    regionalLabelLoadAttempted = true;
    activateRegionalLayer(loadOptionalGeoJson(REGIONAL_LABELS_DATA_PATH), features => { regionalLabelFeatures = features; }, "labels");
  }
  if (mapViewport.zoom >= 5 && !regionalHydroLoadAttempted) {
    regionalHydroLoadAttempted = true;
    Promise.all([
      activateRegionalLayer(loadOptionalGeoJson(REGIONAL_LAKES_DATA_PATH), features => { regionalHydroFeatures = features; }, "lacs"),
      activateRegionalLayer(loadOptionalGeoJson(REGIONAL_RIVERS_DATA_PATH), features => { regionalRiverFeatures = features; }, "rivières")
    ]);
  }
  const canvas = $("world-map");
  const width = Math.max(320, Math.floor(canvas.clientWidth || 960));
  const height = Math.round(width * 0.5);
  const year = Number(String(state.clock.date).slice(0, 4));
  const administrativeDetail = mapViewport.zoom >= 4 ? "regional" : "world";
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
      politicalBoundaryFeatures = political?.collection ?? null;
      territoryFeatures = political?.territories ?? null;
      populateCampaignCountries();
      administrativeBoundaryFeatures = administrative;
      territoryLabelFeatures = buildTerritoryLabels(territoryFeatures, administrativeRegions);
      boundarySourceLabel = political?.sourceYear
        ? (political.exact ? String(political.sourceYear) : "≈ " + political.sourceYear)
        : "indisponible";
      lastRenderedMapSignature = null;
      renderMap();
    }).catch(error => {
      console.warn("Couches de frontières indisponibles :", error);
      boundarySourceLabel = "indisponibles";
    }).finally(() => { boundaryLoadPromise = null; });
  }
  const signature = [width, year, state.physicalWorld?.revision ?? 0, mapViewport.zoom.toFixed(4), mapViewport.centerLongitude.toFixed(4), mapViewport.centerLatitude.toFixed(4), mapInteractionActive ? 'interactive' : 'full'].join(':');
  if (signature === lastRenderedMapSignature) return;
  lastRenderedMapSignature = signature;
  const landDetail = selectMapLayerDetailLevel(mapViewport.zoom, worldFeatures, regionalLandFeatures);
  const lakeDetail = selectMapLayerDetailLevel(mapViewport.zoom, lakeFeatures, regionalHydroFeatures);
  const riverDetail = selectMapLayerDetailLevel(mapViewport.zoom, riverFeatures, regionalRiverFeatures);
  const labelDetail = selectMapLayerDetailLevel(mapViewport.zoom, mapLabels, regionalLabelFeatures);
  const result = renderWorldMap(canvas, landDetail.features, {
    width, height, year,
    projection: "equirectangular",
    viewport: mapViewport,
    lakes: lakeDetail.features,
    rivers: riverDetail.features,
    glaciers: glacierFeatures,
    elevationPoints,
    labels: { type: "FeatureCollection", features: [...(labelDetail.features?.features ?? []), ...(territoryLabelFeatures?.features ?? [])] },
    territories: territoryFeatures,
    physicalWorld: state.physicalWorld,
    selectedCountry: playerCountry || previewCountry,
    politicalBoundaries: politicalBoundaryFeatures,
    administrativeBoundaries: administrativeBoundaryFeatures,
    terrain: terrainGrid,
    terrainEnabled: !mapInteractionActive,
    terrainQuality: 1,
    pixelRatio: mapInteractionActive ? 1 : undefined,
    interactive: mapInteractionActive,
  });
  mapLabelHits = result.labelHits ?? [];
  $("map-era").textContent = result.theme.label;
  const terrainStatus = mapInteractionActive ? " · relief allégé pendant le déplacement" : result.terrainEnabled ? " · relief ETOPO actif" : " · relief ETOPO non installé";
  const regionalLayerCount = [landDetail, lakeDetail, riverDetail, labelDetail].filter(layer => layer.level === "regional-10m").length;
  const fallbackLayerCount = [landDetail, lakeDetail, riverDetail, labelDetail].filter(layer => layer.isFallback).length;
  const detailStatus = regionalLayerCount
    ? ` · ${regionalLayerCount}/4 couches régionales 1:10m${fallbackLayerCount ? ` (${fallbackLayerCount} en repli)` : ""}`
    : fallbackLayerCount ? " · données régionales absentes : fond mondial" : " · fond mondial";
  $("map-status").textContent = `${result.landCount} terres · ${result.territoryCount} territoires colorés · ${result.lakeCount} lacs · ${result.riverCount} cours d’eau · ${result.glacierCount} zones glaciaires · ${result.elevationPointCount} repères · ${result.physicalChangeCount ?? 0} zones transformées · ${result.physicalChangeCount ?? 0} zones transformées · frontières politiques ${result.politicalBoundaryCount} (${boundarySourceLabel}) · limites administratives ${result.administrativeBoundaryCount}${terrainStatus}${detailStatus}`;
  updateMapControls();
  if (!mapInteractionActive) {
    scheduleMapPrefetch([landDetail.features, lakeDetail.features, riverDetail.features, labelDetail.features]);
  }
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
    regionalHydroFeatures = null;
    regionalRiverFeatures = null;
    regionalLabelFeatures = null;
    regionalLandLoadAttempted = false;
    regionalHydroLoadAttempted = false;
    regionalLabelLoadAttempted = false;
    lastRenderedMapSignature = null;
    button.textContent = "Pack cartographique installé";
    status.textContent = "Pack complet prêt : 7 ressources de base et 4 couches régionales. Les détails se chargeront à la demande pour préserver la fluidité.";
    renderMap();
  } catch (error) {
    status.textContent = "Installation interrompue : " + error.message;
    button.textContent = "Reprendre le téléchargement du pack";
  } finally {
    button.disabled = false;
  }
}

async function loadWorldMap() {
  try {
    const responses = await Promise.all([
      fetchMapAsset("./data/ne_110m_land.geojson"),
      fetchMapAsset("./data/ne_110m_lakes.geojson"),
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
    try {
      const terrainResponse = await fetchMapAsset("./data/terrain/etopo_global_10m_i16.bin");
      if (terrainResponse.ok) {
        terrainGrid = createTerrainGrid(await terrainResponse.arrayBuffer());
        if (!state.physicalWorld?.currentCells?.length) {
          const physicalCells = buildPhysicalCellsFromTerrainGrid(terrainGrid, { step: 12, maxCoastSearchCells: 4 });
          state.physicalWorld = createPhysicalWorld(physicalCells);
          console.info("Grille géophysique initialisée depuis ETOPO :", physicalCells.length, "cellules de 2° environ.");
        }
      }
    } catch (terrainError) {
      console.warn("Grille ETOPO non chargée :", terrainError);
    }
    const cacheStatus = await getMapPackStatus();
    if (cacheStatus.ready) {
      $("install-map-pack").textContent = "Pack cartographique installé";
      $("map-pack-status").textContent = "Pack cartographique déjà enregistré dans ce navigateur : données mondiales, relief et détails régionaux.";
    } else {
      $("map-pack-status").textContent = cacheStatus.coreCount + "/" + cacheStatus.coreTotal + " ressources de base en cache · " + cacheStatus.regionalCount + "/4 couches régionales installées.";
      if (cacheStatus.regionalCount > 0) $("install-map-pack").textContent = "Reprendre le téléchargement du pack";
    }
    renderMap();
  } catch (error) {
    $("map-status").textContent = `Carte indisponible : ${error.message}`;
  }
}


function populateCampaignCountries() {
  const select = $("player-country");
  if (!select || !territoryFeatures?.features) return;
  const names = territoryFeatures.features.map(feature => {
    const p = feature.properties ?? {};
    return p.NAME || p.ADMIN || p.name || p.NAME_EN || p.SOVEREIGNT || p.NAME_LONG;
  }).filter(name => typeof name === "string" && name.trim());
  const unique = [...new Set(names)].sort((a,b) => a.localeCompare(b, "fr"));
  const previousChoice = playerCountry || previewCountry || select.value;
  const options = '<option value="">Choisir une nation…</option>' + unique.map(name => {
    const safe = name.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    return '<option value="' + safe + '">' + safe + '</option>';
  }).join("");
  select.innerHTML = options;
  const sandboxSelect = $("sandbox-country");
  if (sandboxSelect) sandboxSelect.innerHTML = options;
  const preferred = unique.find(name => /france/i.test(name));
  const restored = unique.find(name => name === previousChoice) || preferred || unique[0] || "";
  select.value = restored;
  if (!playerCountry) previewCountry = restored;
  if (sandboxSelect) sandboxSelect.value = playerCountry || restored;
  renderMap();
}
$("player-country").addEventListener("change", event => {
  previewCountry = event.target.value;
  renderMap();
});
$("sandbox-country").addEventListener("change", event => {
  if (!event.target.value) return;
  playerCountry = event.target.value;
  previewCountry = playerCountry;
  $("map-title").textContent = event.target.value + " · " + state.clock.date.slice(0,4);
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
  $("map-title").textContent = country + " · " + year;
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

const mapCanvas = $("world-map");
$("map-zoom-in").addEventListener("click", () => { clearWheelZoomPreview(); zoomMap(1.5); });
$("map-zoom-out").addEventListener("click", () => { clearWheelZoomPreview(); zoomMap(1 / 1.5); });
$("map-reset").addEventListener("click", resetMapView);

mapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (wheelZoomState) clearWheelZoomPreview();
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
  // Rendu léger coalescé à l’écran : le canvas reste aligné avec son viewport.
  mapInteractionActive = true;
  renderMap();
});
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
function clearWheelZoomPreview() {
  if (wheelZoomTimer !== null) clearTimeout(wheelZoomTimer);
  wheelZoomTimer = null;
  wheelZoomState = null;
  mapInteractionActive = false;
  mapCanvas.style.transform = "";
}

function stopMapDrag() {
  if (mapDrag) lastDragMoved = mapDrag.moved;
  mapDrag = null;
  mapCanvas.classList.remove("is-dragging");
  mapCanvas.style.transform = "";
  mapInteractionActive = false;
  lastRenderedMapSignature = null;
  if (lastDragMoved) renderMap();
}
mapCanvas.addEventListener("click", (event) => {
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
  if (!wheelZoomState) {
    const rect = mapCanvas.getBoundingClientRect();
    wheelZoomState = {
      anchorX: event.clientX - rect.left,
      anchorY: event.clientY - rect.top,
      rect: { width: rect.width, height: rect.height }
    };
  }
  const anchor = wheelZoomState;
  mapInteractionActive = true;
  zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, anchor.anchorX, anchor.anchorY, true, anchor.rect);
  if (wheelZoomTimer !== null) clearTimeout(wheelZoomTimer);
  wheelZoomTimer = setTimeout(() => {
    if (wheelZoomTimer !== null) clearTimeout(wheelZoomTimer);
    wheelZoomTimer = null;
    wheelZoomState = null;
    mapCanvas.style.transform = "";
    mapInteractionActive = false;
    lastRenderedMapSignature = null;
    renderMap();
  }, 150);
}, { passive: false });

state.clock = createClock();
render();
updateMapControls();
loadWorldMap();
window.addEventListener("resize", () => renderMap());
