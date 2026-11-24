import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css=readFileSync(new URL("../styles/main.css",import.meta.url),"utf8");

test("la profondeur du cadre combine vignettage et lumière rasante",()=>{
 assert.match(css,/\.map-frame::before \{[\s\S]*?radial-gradient\(ellipse at 50% 48%[\s\S]*?inset 0 0 54px/);
});
test("la texture est isolée dans l'overlay décoratif",()=>{
 assert.match(css,/\.map-cartographic-overlay::after \{[\s\S]*?pointer-events:none[\s\S]*?mix-blend-mode:soft-light/);
});
test("les repères restent au-dessus des textures",()=>{
 assert.match(css,/\.map-overlay-coordinate,\.map-compass,\.map-reticle \{\s*z-index:2/);
});
test("l'ère des explorations emploie le parchemin fibrosé",()=>{
 assert.match(css,/data-cartographic-era="exploration"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/parchment\.svg/);
});
test("Westphalie emploie le vélin",()=>{
 assert.match(css,/data-cartographic-era="westphalia"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/vellum\.svg/);
});
test("la période révolutionnaire emploie le grain de presse et une trame discrète",()=>{
 assert.match(css,/data-cartographic-era="revolution"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/newsprint\.svg/);
 assert.match(css,/data-cartographic-era="revolution"\] \.map-cartographic-overlay::before \{[\s\S]*?radial-gradient\(circle/);
});
test("l'ère industrielle ajoute la matière militaire et les courbes topographiques",()=>{
 assert.match(css,/data-cartographic-era="modern"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/military\.svg/);
 assert.match(css,/data-cartographic-era="modern"\] \.map-cartographic-overlay::before \{[\s\S]*?repeating-radial-gradient/);
});
test("le présent reçoit un verre fumé discret",()=>{
 assert.match(css,/data-cartographic-era="present"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/glass\.svg/);
});
test("le futur reçoit une matière obsidienne et une trame HUD",()=>{
 assert.match(css,/data-cartographic-era="future"\] \.map-cartographic-overlay::after \{[\s\S]*?assets\/textures\/obsidian\.svg/);
 assert.match(css,/repeating-linear-gradient\(0deg,transparent 0 7px/);
});
test("les textures sont atténuées sur mobile",()=>{
 assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.map-cartographic-overlay::after \{ opacity:\.12/);
});
test("les textures restent décoratives et respectent le mouvement réduit",()=>{
 assert.match(css,/\.map-cartographic-overlay::after \{[\s\S]*?pointer-events:none/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.map-cartographic-overlay::after \{ transition:none!important/);
});
