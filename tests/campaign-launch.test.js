import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/main.css", import.meta.url), "utf8");

test("le lancement expose une séquence accessible et ses informations de campagne", () => {
  for (const id of ["campaign-launch", "launch-era", "launch-country", "launch-year", "launch-mode", "launch-caption"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
});

test("la séquence reprend l'intitulé historique et le mode réellement sélectionnés", () => {
  for (const title of ["Chambre des Cartographes", "Chancellerie", "La Gazette", "État-Major", "Centre de Veille", "Console Orbitale"]) {
    assert.ok(script.includes(title), "intitulé absent : " + title);
  }
  assert.match(script, /launchOverlay\.hidden = false/);
  assert.match(script, /launch-country.*selected\?\.label/s);
  assert.match(script, /SANDBOX · EXPLORATION LIBRE/);
});

test("la campagne ne passe à l'état démarré qu'à la fin de la révélation", () => {
  assert.match(script, /animationName === "campaign-launch-fade"\) finishCampaignLaunch/);
  assert.match(script, /campaignLaunchInProgress \|\| document\.body\.classList\.contains\("campaign-started"\)/);
  assert.match(script, /document\.body\.classList\.add\("campaign-started"\)/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
});

test("la révélation préserve la carte et masque progressivement les panneaux de préparation", () => {
  assert.match(css, /body\.campaign-launching \.campaign-setup/);
  assert.match(css, /body\.campaign-launching \.game-layout/);
  assert.match(css, /@keyframes campaign-launch-fade/);
  assert.match(css, /@keyframes campaign-launch-card/);
  assert.match(html, /id="map-title" tabindex="-1"/);
});


test("la préparation de campagne garde le dossier synchronisé avec l'année choisie", () => {
  assert.match(script, /startYearSlider\.setAttribute\("aria-valuetext", String\(year\)\)/);
  assert.match(script, /if \(selectedPreview\) renderCountryDossier\(selectedPreview\)/);
  assert.match(script, /item\.raw === previewCountry\)\?\.label \|\| "Le monde"/);
});

test("la recherche de nations annonce les résultats vides et permet d'effacer avec Échap", () => {
  assert.match(html, /id="country-result-count" class="country-result-count" role="status" aria-live="polite"/);
  assert.match(html, /aria-controls="country-results"/);
  assert.match(script, /Aucune nation ne correspond à cette recherche/);
  assert.match(script, /event\.key==="Escape"/);
  assert.match(css, /\.country-empty-state/);
});

test("les filtres replacent la liste en haut et conservent une sélection lisible", () => {
  assert.match(script, /country-results"\)\.scrollTop=0/);
  assert.match(css, /\.country-result\.is-selected \.country-result-name/);
  assert.match(css, /\.country-result:focus-visible/);
});

test("le mode choisi adapte le libellé de l'action principale", () => {
  assert.match(script, /mode === "sandbox" \? "Explorer le monde " : "Entrer dans l’Histoire "/);
});


test("la recherche des nations expose un compteur accessible et un raccourci d'effacement", () => {
  assert.match(html, /id="country-result-count" class="country-result-count" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /aria-controls="country-results"/);
  assert.match(html, /aria-describedby="country-result-count"/);
});

test("le dossier affiche le drapeau ISO de la nation ou son blason historique", () => {
  assert.match(script, /function countryFlagCode\(feature\)/);
  assert.match(script, /function countryFlagEmoji\(code\)/);
  assert.match(script, /dossier-emblem--flag/);
  assert.match(script, /dossier-emblem--crest/);
  assert.match(script, /Drapeau de /);
  assert.match(script, /Blason de /);
});
