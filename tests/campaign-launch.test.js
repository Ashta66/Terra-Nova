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

test("le blason historique est prioritaire sur le drapeau ISO", () => {
  assert.match(script, /resolveCountryInsignia\(x\.feature/);
  assert.match(script, /document\.createElement\("img"\)/);
  assert.match(script, /insigniaData\.src/);
  assert.match(script, /dossier-emblem--flag/);
  assert.match(script, /dossier-emblem--crest/);
  const assets = readFileSync(new URL("../src/game/country-insignia.js", import.meta.url), "utf8");
  assert.match(assets, /flagcdn\.com\/w160/);
  assert.match(assets, /commons\.wikimedia\.org\/wiki\/Special:FilePath/);
});
test("le catalogue relie les principales puissances à des armoiries documentées", () => {
  const assets = readFileSync(new URL("../src/game/country-insignia.js", import.meta.url), "utf8");
  for (const [name,file] of [["France","Arms_of_the_Kingdom_of_France"],["England","Royal_Arms_of_England"],["Castile","Blason_Castille"],["Portugal","Coat_of_arms_of_the_Kingdom_of_Portugal"],["Ottoman Empire","Osmanli-nisani"],["Russian Empire","Coat_of_arms_of_the_Russian_Empire"],["Holy Roman Empire","Generic_Arms_of_the_Holy_Roman_Emperor"]]) {
    assert.ok(assets.includes('"'+name+'"') && assets.includes(file), `armoiries sourcées manquantes : ${name}`);
  }
});

test("la liste de campagne affiche un insigne à côté de chaque nation", () => {
  assert.match(script, /country-result-heading/);
  assert.match(script, /country-result-insignia/);
  assert.match(script, /insignia\.src=insigniaData\.src/);
  assert.match(script, /identity\.append\(insignia,name\)/);
  assert.match(script, /btn\.append\(identity,meta\)/);
  assert.match(css, /\.country-result-insignia/);
});

test("les insignes masqués après échec de chargement ne sont pas réaffichés par le CSS", () => {
  assert.match(css, /\.country-result-insignia\[hidden\],\.dossier-emblem\[hidden\]\{display:none!important\}/);
});

test("un insigne est masqué si le fichier principal et le drapeau de secours échouent", () => {
  assert.match(script, /insignia\.dataset\.fallbackAttempted!=="true"/);
  assert.match(script, /emblem\.dataset\.fallbackAttempted!=="true"/);
  assert.match(script, /insignia\.hidden=true;insignia\.removeAttribute\("src"\)/);
  assert.match(script, /emblem\.hidden=true;emblem\.removeAttribute\("src"\)/);
  assert.doesNotMatch(script, /insignia\.onerror=null/);
  assert.doesNotMatch(script, /emblem\.onerror=null/);
});
