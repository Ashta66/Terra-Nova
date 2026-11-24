import test from "node:test";
import assert from "node:assert/strict";
import {buildCountryDossier} from "../src/game/country-dossier.js";
test("fiche historique ne recycle pas population et PIB modernes",()=>{const d=buildCountryDossier({properties:{NAME:"France",POP_EST:67000000,GDP_MD:2700000}},1444,{rank:"Puissance majeure",difficulty:2,region:"Europe"});assert.equal(d.metrics[0].value,"Paris");assert.equal(d.metrics[1].value,"Non documentée");assert.equal(d.metrics[2].value,"Non documentée");assert.match(d.dataNote,/masquées/);assert.equal(d.objectives.length,3);});
test("fiche contemporaine expose les données source et un indice estimatif",()=>{const d=buildCountryDossier({properties:{NAME:"France",POP_EST:67000000,POP_YEAR:2019,GDP_MD:2700000,ISO_A2:"FR"}},2026,{rank:"Puissance majeure",difficulty:1,region:"Europe"});assert.equal(d.metrics[0].value,"Paris");assert.match(d.metrics[1].value,/M/);assert.match(d.metrics[2].value,/billions/);assert.match(d.metrics[3].value,/100/);assert.match(d.metrics[3].note,/estimation/);assert.equal(d.insignia.type,"flag");assert.equal(d.insignia.src,"https://flagcdn.com/w160/fr.png");});
test("la dépendance est reflétée dans la situation diplomatique",()=>{const d=buildCountryDossier({properties:{NAME:"Duché",SUBJECTO:"Royaume voisin",historicalStatus:"sovereign"}},1444,{rank:"Nation émergente",difficulty:4,region:"Europe"});assert.match(d.diplomacy,/Royaume voisin/);assert.match(d.objectives[0],/survie/);});
test("un statut contesté est explicitement signalé",()=>{const d=buildCountryDossier({properties:{NAME:"Territoire",historicalStatus:"contested"}},1444);assert.match(d.diplomacy,/contesté/);});
test("une fiche vide ne fabrique pas de capital ni de statistiques",()=>{const d=buildCountryDossier({properties:{NAME:"Inconnu"}},1444);assert.equal(d.metrics[0].value,"Non documentée");assert.equal(d.metrics[1].value,"Non documentée");assert.equal(d.metrics[2].value,"Non documentée");assert.equal(d.metrics[3].value,"Non documenté");});

test("la fiche localise les capitales et les puissances de tutelle",()=>{const d=buildCountryDossier({properties:{NAME:"English polity",CAPITAL:"London",SUBJECTO:"Kingdom of England"}},1812);assert.equal(d.metrics[0].value,"Londres");assert.match(d.diplomacy,/Royaume d’Angleterre/);});
test("la fiche expose la superficie et le statut politique sans inventer de données",()=>{const d=buildCountryDossier({properties:{NAME:"État",AREA:2500000,historicalStatus:"contested"}},1444);assert.match(d.metrics[4].value,/km²/);assert.equal(d.stateStatus,"Souveraineté contestée");assert.match(d.territory,/2.*500.*000/);});
test("la lecture stratégique évolue selon la période historique",()=>{const early=buildCountryDossier({properties:{NAME:"État"}},1500);const modern=buildCountryDossier({properties:{NAME:"État"}},2026);assert.match(early.historicalLens,/dynastique/);assert.match(modern.historicalLens,/technologies/);assert.equal(early.year,1500);});
test("les champs manquants restent explicitement non documentés",()=>{const d=buildCountryDossier({properties:{NAME:"État"}},2026);assert.equal(d.metrics[4].value,"Non documentée");assert.match(d.territory,/pas renseignée|n’est pas renseignée/i);});

test("une nation sans code ISO valide ne reçoit aucune URL de drapeau",()=>{const d=buildCountryDossier({properties:{NAME:"Pays inconnu",ISO_A2:"ZZ"}},2026);assert.equal(d.insignia.type,"none");assert.equal(d.insignia.src,"");});
test("les puissances historiques utilisent de vrais fichiers d’armoiries",()=>{for(const [name,fragment,year] of [["France","Arms_of_the_Kingdom_of_France",1500],["Castile","Blason_Castille",1500],["England","Royal_Arms_of_England",1500],["Ottoman Empire","Osmanli-nisani",1900],["Russian Empire","Coat_of_arms_of_the_Russian_Empire",1900],["Holy Roman Empire","Generic_Arms_of_the_Holy_Roman_Emperor",1500]]){const d=buildCountryDossier({properties:{NAME:name,ISO_A2:"GB"}},year);assert.equal(d.insignia.type,"coat");assert.ok(d.insignia.src.includes(fragment));}});

test("aucun insigne n'est généré sans drapeau ISO ni armoiries disponibles",()=>{
 const d=buildCountryDossier({properties:{NAME:"Entité inconnue"}},2026);
 assert.equal(d.insignia.type,"none");
 assert.equal(d.insignia.src,"");
 assert.equal(d.insignia.fallback,undefined);
});
test("une armoirie conserve un repli uniquement si un vrai drapeau image existe",()=>{
 const known=buildCountryDossier({properties:{NAME:"France",ISO_A2:"FR"}},1500);
 assert.equal(known.insignia.type,"coat");
 assert.equal(known.insignia.fallback,"https://flagcdn.com/w160/fr.png");
 const unknown=buildCountryDossier({properties:{NAME:"Entité inconnue"}},1500);
 assert.equal(unknown.insignia.fallback,undefined);
});

test("les codes ISO réservés ou fictifs ne produisent aucune URL d'image",()=>{
 for(const code of ["ZZ","XX","-99","00","UN"]){
  const d=buildCountryDossier({properties:{NAME:"Entité sans drapeau",ISO_A2:code}},2026);
  assert.equal(d.insignia.type,"none",code);
  assert.equal(d.insignia.src,"",code);
  assert.equal(d.insignia.alt,"",code);
 }
});
test("les codes ISO valides et le code régional écossais restent pris en charge",()=>{
 for(const [name,code] of [["Pays test","FR"],["Scotland","gb-sct"]]){
  const d=buildCountryDossier({properties:{NAME:name,ISO_A2:code}},2026);
  assert.equal(d.insignia.type,"flag");
  assert.equal(d.insignia.src,"https://flagcdn.com/w160/"+code.toLowerCase()+".png");
 }
});
test("un code ISO invalide ne masque pas un code de repli valide",()=>{
 const d=buildCountryDossier({properties:{NAME:"France",ISO_A2:"ZZ",ISO_A2_EH:"FR"}},2026);
 assert.equal(d.insignia.src,"https://flagcdn.com/w160/fr.png");
});
