import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css=readFileSync(new URL("../styles/main.css",import.meta.url),"utf8");

test("la préparation évite les débordements horizontaux dans ses panneaux",()=>{
 assert.match(css,/body:not\(\.campaign-started\) \.campaign-setup,[\s\S]*?min-width:0/);
 assert.match(css,/\.country-result-name \{ overflow-wrap:anywhere; \}/);
});
test("les listes et dossiers gardent leur propre zone de défilement",()=>{
 assert.match(css,/\.setup-card \{ overscroll-behavior:contain; scrollbar-gutter:stable; \}/);
 assert.match(css,/\.country-dossier,[\s\S]*?overscroll-behavior:contain/);
});
test("les champs de recherche et filtres peuvent rétrécir sans pousser le panneau",()=>{
 assert.match(css,/\.country-search,[\s\S]*?min-width:0; max-width:100%/);
});
test("le bouton de lancement conserve une cible tactile suffisante",()=>{
 assert.match(css,/\.setup-start \{ min-height:44px; \}/);
});
test("les contrôles de campagne disposent d'un focus visible",()=>{
 assert.match(css,/\.setup-card :focus-visible \{[\s\S]*?outline:2px solid var\(--theme-accent\)/);
});
test("les fenêtres intermédiaires réduisent la largeur de la fiche",()=>{
 assert.match(css,/@media \(min-width:761px\) and \(max-width:1100px\)/);
});
test("les écrans desktop de faible hauteur compactent la préparation",()=>{
 assert.match(css,/@media \(max-height:720px\) and \(min-width:761px\)/);
});
test("les mobiles respectent les zones sûres et limitent la hauteur du panneau",()=>{
 assert.match(css,/padding-bottom:max\(8px,env\(safe-area-inset-bottom\)\)/);
 assert.match(css,/max-height:min\(58dvh,calc\(100dvh - 150px\)\)/);
});
test("les mobiles en paysage disposent d'une disposition dédiée",()=>{
 assert.match(css,/@media \(max-width:760px\) and \(orientation:landscape\)/);
});
test("les très petits écrans empilent les filtres sans débordement",()=>{
 assert.match(css,/@media \(max-width:360px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
test("les animations de défilement respectent la préférence de mouvement réduit",()=>{
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)[\s\S]*?scroll-behavior:auto/);
});
