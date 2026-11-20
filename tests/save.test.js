import test from "node:test";
import assert from "node:assert/strict";
import { saveGame, loadGame, SAVE_KEY } from "../src/core/save.js";
import { createGameState } from "../src/game/state.js";
import { createPhysicalWorld, applyPhysicalEvent } from "../src/world/physical-geography.js";
function memoryStorage(){const data=new Map();return{setItem:(k,v)=>data.set(k,v),getItem:(k)=>data.get(k)??null};}
test("round-trip une sauvegarde locale",()=>{const storage=memoryStorage();const state=createGameState();state.clock.date="1444-02-03";saveGame(state,storage);assert.equal(loadGame(storage).clock.date,"1444-02-03");});
test("retourne null si aucune sauvegarde",()=>{assert.equal(loadGame(memoryStorage()),null);});
test("rejette une sauvegarde d'une version inconnue",()=>{const storage=memoryStorage();storage.setItem(SAVE_KEY,JSON.stringify({schemaVersion:999}));assert.throws(()=>loadGame(storage));});
test("compacte les cellules physiques modifiées et restaure un état identique",()=>{
 const storage=memoryStorage(),state=createGameState();
 const cells=[{id:"a",longitude:0,latitude:0,elevationM:10,coastalDistanceKm:2},{id:"b",longitude:20,latitude:5,elevationM:100,coastalDistanceKm:40}];
 state.physicalWorld=createPhysicalWorld(cells);
 state.physicalWorld=applyPhysicalEvent(state.physicalWorld,{id:"impact-save",type:"meteor-impact",date:"1500-01-01",longitude:0,latitude:0,radiusKm:80,craterRadiusKm:40,craterDepthM:250}).world;
 const expected=JSON.stringify(state.physicalWorld.currentCells);
 saveGame(state,storage);
 const raw=JSON.parse(storage.getItem(SAVE_KEY));
 assert.equal(raw.physicalWorld.currentCells,undefined);
 assert.equal(raw.physicalWorld.compactCells.changedCells.length,1);
 assert.equal(JSON.stringify(loadGame(storage).physicalWorld.currentCells),expected);
});
