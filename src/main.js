import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { renderWorldMap } from "./world/map-renderer.js";

let state = createGameState();
let interval = null;
let worldFeatures = null;
let lakeFeatures = null;
let riverFeatures = null;
let glacierFeatures = null;
let elevationPoints = null;
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
  const longitudeAtAnchor = mapViewport.centerLongitude + ratioX * 360 / oldZoom;
  const latitudeAtAnchor = mapViewport.centerLatitude - ratioY * 180 / oldZoom;
  mapViewport.zoom = newZoom;
  mapViewport.centerLongitude = longitudeAtAnchor - ratioX * 360 / newZoom;
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, latitudeAtAnchor + ratioY * 180 / newZoom));
  renderMap();
  updateMapControls();
}

function resetMapView() {
  mapViewport.zoom = 1;
  mapViewport.centerLongitude = 0;
  mapViewport.centerLatitude = 0;
  renderMap();
  updateMapControls();
}

function renderMap() {
  if (!worldFeatures) return;
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
    elevationPoints
  });
  $("map-era").textContent = result.theme.label;
  $("map-status").textContent = `${result.landCount} terres · ${result.lakeCount} lacs · ${result.riverCount} cours d’eau · ${result.glacierCount} zones glaciaires · ${result.elevationPointCount} repères de relief`;
  updateMapControls();
}

async function loadWorldMap() {
  try {
    const responses = await Promise.all([
      fetch("./data/ne_110m_land.geojson"),
      fetch("./data/ne_110m_lakes.geojson"),
      fetch("./data/ne_110m_rivers.geojson"),
      fetch("./data/ne_110m_glaciated_areas.geojson"),
      fetch("./data/ne_110m_elevation_points.geojson")
    ]);
    for (const response of responses) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    [worldFeatures, lakeFeatures, riverFeatures, glacierFeatures, elevationPoints] =
      await Promise.all(responses.map(response => response.json()));
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
$("map-zoom-in").addEventListener("click", () => zoomMap(1.5));
$("map-zoom-out").addEventListener("click", () => zoomMap(1 / 1.5));
$("map-reset").addEventListener("click", resetMapView);

mapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  mapDrag = { x: event.clientX, y: event.clientY, centerLongitude: mapViewport.centerLongitude, centerLatitude: mapViewport.centerLatitude };
  mapCanvas.classList.add("is-dragging");
  mapCanvas.setPointerCapture?.(event.pointerId);
});
mapCanvas.addEventListener("pointermove", (event) => {
  if (!mapDrag) return;
  const rect = mapCanvas.getBoundingClientRect();
  const dx = event.clientX - mapDrag.x;
  const dy = event.clientY - mapDrag.y;
  mapViewport.centerLongitude = Math.max(-540, Math.min(540, mapDrag.centerLongitude - dx / rect.width * 360 / mapViewport.zoom));
  mapViewport.centerLatitude = Math.max(-80, Math.min(80, mapDrag.centerLatitude + dy / rect.height * 180 / mapViewport.zoom));
  renderMap();
});
function stopMapDrag() {
  mapDrag = null;
  mapCanvas.classList.remove("is-dragging");
}
mapCanvas.addEventListener("pointerup", stopMapDrag);
mapCanvas.addEventListener("pointercancel", stopMapDrag);
mapCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = mapCanvas.getBoundingClientRect();
  zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

state.clock = createClock();
render();
updateMapControls();
loadWorldMap();
window.addEventListener("resize", () => renderMap());
