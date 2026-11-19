import { advanceClock, createClock, formatDate, SPEEDS } from "./core/clock.js";
import { loadGame, saveGame } from "./core/save.js";
import { createGameState, validateGameState } from "./game/state.js";
let state = createGameState();
let interval = null;
const $ = (id) => document.getElementById(id);
function render() {
  $("current-date").textContent = formatDate(state.clock.date);
  $("elapsed-days").textContent = "Jour " + state.clock.day.toLocaleString("fr-FR");
  $("run-state").textContent = state.clock.paused ? "EN PAUSE" : "EN COURS";
  $("toggle-clock").textContent = state.clock.paused ? "Lancer" : "Pause";
  $("speed").value = String(state.clock.speed);
}
function stopTimer() { if (interval !== null) clearInterval(interval); interval = null; }
function schedule() {
  stopTimer();
  if (!state.clock.paused) interval = setInterval(() => { state.clock = advanceClock(state.clock, state.clock.speed); render(); }, 1000);
}
$("toggle-clock").addEventListener("click", () => { state.clock.paused = !state.clock.paused; schedule(); render(); });
$("advance-day").addEventListener("click", () => { state.clock = advanceClock(state.clock); render(); });
$("speed").addEventListener("change", (event) => { const speed = Number(event.target.value); if (SPEEDS.includes(speed)) state.clock.speed = speed; schedule(); render(); });
$("save-game").addEventListener("click", () => {
  try { const at = saveGame(state); $("save-status").textContent = "Sauvegarde effectuée à " + new Date(at).toLocaleTimeString("fr-FR"); }
  catch (error) { $("save-status").textContent = "Échec de sauvegarde : " + error.message; }
});
$("load-game").addEventListener("click", () => {
  try { const loaded = loadGame(); if (!loaded) { $("save-status").textContent = "Aucune sauvegarde trouvée."; return; } state = loaded; state.clock.paused = true; stopTimer(); validateGameState(state); render(); $("save-status").textContent = "Sauvegarde chargée."; }
  catch (error) { $("save-status").textContent = "Sauvegarde illisible : " + error.message; }
});
state.clock = createClock();
render();