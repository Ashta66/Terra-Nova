import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { renderWorldMap } from "./world/map-renderer.js";
import { createTerrainGrid } from "./world/terrain.js";

let state = createGameState();
let interval = null;
let worldFeatures = null;
let lakeFeatures = null;
let riverFeatures = null;
let glacierFeatures = null;
let elevationPoints = null;
let mapLabels = null;
let terrainGrid = null;
let mapLabelHits = [];
let mapRenderFrame = null;
let lastRenderedMapSignature = null;
let wheelZoomState = null;
let wheelZoomTimer = null;
let lastDragMoved = false;
const mapViewport = { zoom: 1, centerLongitude: 0, centerLatitude: 0 };
let mapDrag = null;
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 8;
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
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, latitudeAtAnchor + ratioY * 180 / newZoom));
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

function renderMapFrame() {
  if (!worldFeatures) return;
  const canvas = $("world-map");
  const width = Math.max(320, Math.floor(canvas.clientWidth || 960));
  const year = Number(String(state.clock.date).slice(0, 4));
  const signature = [width, year, mapViewport.zoom.toFixed(4), mapViewport.centerLongitude.toFixed(4), mapViewport.centerLatitude.toFixed(4)].join(':');
  if (signature === lastRenderedMapSignature) return;
  lastRenderedMapSignature = signature;
  const result = renderWorldMap(canvas, worldFeatures, {
    width, height: Math.round(width * 0.5), year,
    projection: "equirectangular",
    viewport: mapViewport,
    lakes: lakeFeatures,
    rivers: riverFeatures,
    glaciers: glacierFeatures,
    elevationPoints,
    labels: mapLabels,
    terrain: terrainGrid,
  });
  mapLabelHits = result.labelHits ?? [];
  $("map-era").textContent = result.theme.label;
  const terrainStatus = result.terrainEnabled ? " · relief ETOPO actif" : " · relief ETOPO non installé";
  $("map-status").textContent = `${result.landCount} terres · ${result.lakeCount} lacs · ${result.riverCount} cours d’eau · ${result.glacierCount} zones glaciaires · ${result.elevationPointCount} repères de relief${terrainStatus}`;
  updateMapControls();
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
      if (terrainResponse.ok) terrainGrid = createTerrainGrid(await terrainResponse.arrayBuffer());
    } catch (terrainError) {
      console.warn("Grille ETOPO non chargée :", terrainError);
    }
    renderMap();
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
$("map-zoom-in").addEventListener("click", () => { clearWheelZoomPreview(); zoomMap(1.5); });
$("map-zoom-out").addEventListener("click", () => { clearWheelZoomPreview(); zoomMap(1 / 1.5); });
$("map-reset").addEventListener("click", resetMapView);

mapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (wheelZoomState) { clearWheelZoomPreview(); renderMap(); }
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
  mapViewport.centerLongitude = Math.max(-540, Math.min(540, mapDrag.centerLongitude - dx / rect.width * 360 / mapViewport.zoom));
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, mapDrag.centerLatitude + dy / rect.height * 180 / mapViewport.zoom));
  // Déplacement visuel immédiat du bitmap déjà rendu : aucun recalcul du relief
  // ou des géométries pendant le geste. Le rendu complet est fait au relâchement.
  mapCanvas.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
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
function clearWheelZoomPreview() {
  if (wheelZoomTimer !== null) clearTimeout(wheelZoomTimer);
  wheelZoomTimer = null;
  wheelZoomState = null;
  mapCanvas.style.transform = '';
}
function stopMapDrag() {
  if (mapDrag) lastDragMoved = mapDrag.moved;
  mapDrag = null;
  mapCanvas.classList.remove("is-dragging");
  mapCanvas.style.transform = "";
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
      baseZoom: mapViewport.zoom,
      anchorX: event.clientX - rect.left,
      anchorY: event.clientY - rect.top,
      rect: { width: rect.width, height: rect.height }
    };
  }
  const anchor = wheelZoomState;
  zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, anchor.anchorX, anchor.anchorY, false, anchor.rect);
  const scale = mapViewport.zoom / anchor.baseZoom;
  mapCanvas.style.transformOrigin = "0 0";
  mapCanvas.style.transform = "translate3d(" + anchor.anchorX * (1 - scale) + "px, " + anchor.anchorY * (1 - scale) + "px, 0) scale(" + scale + ")";
  if (wheelZoomTimer !== null) clearTimeout(wheelZoomTimer);
  wheelZoomTimer = setTimeout(() => {
    clearWheelZoomPreview();
    renderMap();
  }, 130);
}, { passive: false });

state.clock = createClock();
render();
updateMapControls();
loadWorldMap();
window.addEventListener("resize", () => renderMap());
