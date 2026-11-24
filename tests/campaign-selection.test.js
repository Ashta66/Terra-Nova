import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");

test("la sélection refuse une nation absente du catalogue sans altérer l'état",()=>{
 assert.match(script,/const x=campaignCountries\.find\(item=>item\.raw===raw\);\s*if\(!x\)return false;/);
});
test("les sélecteurs de campagne et sandbox restent synchronisés",()=>{
 assert.match(script,/\$\("player-country"\)\.value=x\.raw/);
 assert.match(script,/sandboxSelect\.value=x\.raw/);
 assert.match(script,/if\(!selectCampaignCountry\(raw\)\)return/);
});
test("une sélection valide efface une erreur de validation précédente",()=>{
 assert.match(script,/\$\("player-country"\)\.setCustomValidity\(" "\)/);
});
test("la sélection met à jour le dossier et son titre de carte",()=>{
 assert.match(script,/renderCountryDossier\(x\)/);
 assert.match(script,/x\.label\+" · "\+state\.clock\.date\.slice\(0,4\)/);
});
test("la sélection clavier restaure le focus sur l'option correspondante",()=>{
 assert.match(script,/restoreFocus:event\.detail===0/);
 assert.match(script,/if\(restoreFocus\).*find\(button=>button\.dataset\.country===x\.raw\)\?\.focus\(\)/s);
});
test("la liste applique une navigation clavier à tabulation unique",()=>{
 assert.match(script,/btn\.tabIndex=x\.raw===activeRaw\?0:-1/);
 assert.match(script,/event\.key==="ArrowDown"\)target=buttons\[\(index\+1\)%buttons\.length\]/);
 assert.match(script,/event\.key==="ArrowUp"\)target=buttons\[\(index-1\+buttons\.length\)%buttons\.length\]/);
 assert.match(script,/event\.key==="Home"\)target=buttons\[0\]/);
 assert.match(script,/event\.key==="End"\)target=buttons\.at\(-1\)/);
});
test("le listbox annonce le nombre de résultats et un état vide accessible",()=>{
 assert.match(script,/list\.setAttribute\("aria-label","Nations jouables · "\+items\.length/);
 assert.match(script,/empty\.setAttribute\("role","status"\)/);
});
test("les insignes de la liste se recalculent lorsque la date est validée",()=>{
 assert.match(script,/startYearSlider\.addEventListener\("change",\(\)=>renderCountryPicker\(\)\)/);
});
test("le curseur de date annonce son année dès son initialisation et pendant son déplacement",()=>{
 assert.match(script,/startYearSlider\.setAttribute\("aria-valuetext","Année "\+startYearSlider\.value\)/);
 assert.match(script,/setAttribute\("aria-valuetext", "Année "\+year\)/);
 assert.match(html,/id="start-year"[^>]*aria-label="Faire défiler les années historiques"/);
});
test("le changement de nation est annoncé aux technologies d'assistance",()=>{
 assert.match(html,/class="country-selected-heading" aria-live="polite" aria-atomic="true"/);
});
test("le changement de nation sandbox passe par le même contrôleur",()=>{
 assert.match(script,/\$\("sandbox-country"\)\.addEventListener\("change", event => \{\s*const raw=event\.target\.value;\s*if\(!selectCampaignCountry\(raw\)\)return;\s*playerCountry=raw;/);
});
