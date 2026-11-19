import test from "node:test";
import assert from "node:assert/strict";
import { saveGame, loadGame, SAVE_KEY } from "../src/core/save.js";
import { createGameState } from "../src/game/state.js";
function memoryStorage(){const data=new Map();return{setItem:(k,v)=>data.set(k,v),getItem:(k)=>data.get(k)??null};}
test("round-trip une sauvegarde locale",()=>{const storage=memoryStorage();const state=createGameState();state.clock.date="1444-02-03";saveGame(state,storage);assert.equal(loadGame(storage).clock.date,"1444-02-03");});
test("retourne null si aucune sauvegarde",()=>{assert.equal(loadGame(memoryStorage()),null);});
test("rejette une sauvegarde d'une version inconnue",()=>{const storage=memoryStorage();storage.setItem(SAVE_KEY,JSON.stringify({schemaVersion:999}));assert.throws(()=>loadGame(storage));});