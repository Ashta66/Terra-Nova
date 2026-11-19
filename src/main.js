import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
import { renderWorldMap } from "./world/map-renderer.js";

let state = createGameState();
let interval = null;
let worldFeatures = null;
let lakeFeatures = null;
let riverFeatures = null;
const $ = (id) => document.getElementById(id);

function renderMap() {
  if (!worldFeatures) return;
  const canvas = $("world-map");
  const width = Math.max(320, Math.floor(canvas.clientWidth || 960));
  const year = Number(String(state.clock.date).slice(0, 4));
  const result = renderWorldMap(canvas, worldFeatures, {
    width, height: Math.round(width * 0.5), year,
    projection: "equirectangular",
    lakes: lakeFeatures,
    rivers: riverFeatures
  });
  $("map-era").textContent = result.theme.label;
  $("map-status").textContent = `${result.landCount} terres · ${result.lakeCount} lacs · ${result.riverCount} grands cours d’eau`;
}

async function loadWorldMap() {
  try {
    const [landResponse, lakeResponse, riverResponse] = await Promise.all([
      fetch("./data/ne_110m_land.geojson"),
      fetch("./data/ne_110m_lakes.geojson"),
      fetch("./data/ne_110m_rivers.geojson")
    ]);
    for (const response of [landResponse, lakeResponse, riverResponse]) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }
    [worldFeatures, lakeFeatures, riverFeatures] = await Promise.all([
      landResponse.json(), lakeResponse.json(), riverResponse.json()
    ]);
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

state.clock = createClock();
render();
loadWorldMap();
window.addEventListener("resize", () => renderMap());
