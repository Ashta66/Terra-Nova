import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css=readFileSync(new URL("../styles/main.css",import.meta.url),"utf8");

test("le titre de carte reçoit une signature éditoriale et un filet d'accent",()=>{
 assert.match(css,/\.map-stage-heading::after[\s\S]*?background:linear-gradient\(90deg,var\(--theme-accent\),transparent\)/);
});
test("le cadre de carte possède un fond atmosphérique dépendant du thème",()=>{
 assert.match(css,/\.map-frame \{[\s\S]*?radial-gradient\(ellipse at 50% 48%/);
});
test("le grain du cadre reste décoratif et non interactif",()=>{
 assert.match(css,/\.map-frame::after[\s\S]*?pointer-events:none/);
});
test("les ornements cartographiques restent confinés à leur cadre",()=>{
 assert.match(css,/\.map-cartographic-overlay \{ contain:paint; \}/);
});
test("la rose des vents bénéficie d'une profondeur matérielle",()=>{
 assert.match(css,/\.map-compass \{[\s\S]*?backdrop-filter:blur\(3px\)/);
});
test("la légende est séparée du plan par un filet thématique",()=>{
 assert.match(css,/\.map-bottom-bar \{[\s\S]*?border-top:1px solid color-mix/);
});
test("les outils de carte forment un instrument cohérent",()=>{
 assert.match(css,/\.map-tools \{[\s\S]*?box-shadow:inset 0 1px #ffffff0a/);
});
test("l'exploration possède un encadrement de portulan",()=>{
 assert.match(css,/body\[data-cartographic-era="exploration"\] \.map-frame[\s\S]*?border:6px double #80613c/);
});
test("les ères historiques et industrielles ont des cadres distincts",()=>{
 for(const era of ["westphalia","revolution","modern"]) assert.match(css,new RegExp('body\\[data-cartographic-era="'+era+'"\\] \\.map-frame'));
});
test("le présent et le futur ont des cadres technologiques distincts",()=>{
 for(const era of ["present","future"]) assert.match(css,new RegExp('body\\[data-cartographic-era="'+era+'"\\] \\.map-frame'));
});
test("les outils se réorganisent sur mobile sans sortir du cadre",()=>{
 assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.map-tools \{ max-width:100%;flex-wrap:wrap/);
});
test("les transitions du cadre respectent le mouvement réduit",()=>{
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.map-frame,.map-tools,.map-tool \{ transition:none!important; \}/);
});
