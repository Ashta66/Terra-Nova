import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMapTileWorkQueue, takeNextMapTileWork, getMapTileWorkQueueStats, hasMapTileWork } from "../src/world/map-tile-work-queue.js";

test("queue follows the visible plan priority and removes obsolete work", () => {
  const old = [{ key: "old" }];
  const plan = [{ key: "center" }, { key: "near" }, { key: "edge" }];
  const queue = reconcileMapTileWorkQueue(plan, old);
  assert.deepEqual(queue.map(tile => tile.key), ["center", "near", "edge"]);
});
test("queue reconciliation deduplicates and skips cached or already pending tiles", () => {
  const plan = [{ key: "a" }, { key: "b" }, { key: "a" }, { key: "c" }];
  const queue = reconcileMapTileWorkQueue(plan, [], key => key === "b", key => key === "c");
  assert.deepEqual(queue.map(tile => tile.key), ["a"]);
});
test("taking work skips entries that became cached or pending after reconciliation", () => {
  const queue = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const next = takeNextMapTileWork(queue, key => key === "a", key => key === "b");
  assert.equal(next.key, "c");
  assert.equal(queue.length, 0);
});
test("taking work returns null for malformed or exhausted queues", () => {
  assert.equal(takeNextMapTileWork(null), null);
  assert.equal(takeNextMapTileWork([{ key: "" }, null]), null);
});
test("queue diagnostics report queued and in-flight work independently", () => {
  assert.deepEqual(getMapTileWorkQueueStats([{ key: "a" }, { key: "b" }], new Map([["c", 3]])), {
    queued: 2, pending: 1
  });
  assert.deepEqual(getMapTileWorkQueueStats(null, null), { queued: 0, pending: 0 });
});

test("la consommation séquentielle avance sans décaler le tableau à chaque tuile",()=>{
 const queue=[{key:"a"},{key:"b"},{key:"c"},{key:"d"}];
 const originalFirst=queue[0];
 assert.equal(takeNextMapTileWork(queue).key,"a");
 assert.equal(queue[0],originalFirst,"la tête du tableau n'est pas déplacée");
 assert.equal(getMapTileWorkQueueStats(queue,new Map()).queued,3);
 assert.equal(hasMapTileWork(queue),true);
 assert.equal(takeNextMapTileWork(queue).key,"b");
 assert.equal(takeNextMapTileWork(queue).key,"c");
 assert.equal(takeNextMapTileWork(queue).key,"d");
 assert.equal(hasMapTileWork(queue),false);
 assert.equal(queue.length,0,"les références sont libérées à épuisement");
});
test("les entrées devenues en cache ou pending sont sautées avec le curseur",()=>{
 const queue=[{key:"cached"},{key:"pending"},{key:"ready"}];
 assert.equal(takeNextMapTileWork(queue,key=>key==="cached",key=>key==="pending").key,"ready");
 assert.equal(queue.length,0);
});
test("une file réconciliée repart avec un nouveau curseur indépendant",()=>{
 const first=[{key:"a"},{key:"b"}];
 assert.equal(takeNextMapTileWork(first).key,"a");
 const next=reconcileMapTileWorkQueue([{key:"x"},{key:"y"}],first);
 assert.equal(hasMapTileWork(next),true);
 assert.equal(takeNextMapTileWork(next).key,"x");
 assert.equal(getMapTileWorkQueueStats(next,new Map()).queued,1);
});
test("le curseur reste cohérent quand des travaux sont ajoutés en fin de file",()=>{
 const queue=[{key:"a"}];
 assert.equal(takeNextMapTileWork(queue).key,"a");
 queue.push({key:"b"},{key:"c"});
 assert.equal(hasMapTileWork(queue),true);
 assert.equal(takeNextMapTileWork(queue).key,"b");
 assert.equal(takeNextMapTileWork(queue).key,"c");
 assert.equal(queue.length,0);
});
