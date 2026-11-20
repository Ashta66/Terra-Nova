import test from "node:test";
import assert from "node:assert/strict";
import { visibleTileRevisionSignature } from "../src/world/terrain.js";

test("le cache de relief dépend des révisions des tuiles visibles, pas du monde entier",()=>{
 const view={zoom:8,centerLongitude:2,centerLatitude:4};
 const initial=visibleTileRevisionSignature(view,{"18:9":0,"0:0":0});
 const outside=visibleTileRevisionSignature(view,{"18:9":0,"0:0":7});
 assert.equal(initial,outside);
 const changed=visibleTileRevisionSignature(view,{"18:9":1,"0:0":0});
 assert.notEqual(initial,changed);
});
test("le cache de relief tient compte des tuiles autour de l'antiméridien",()=>{
 const view={zoom:8,centerLongitude:179,centerLatitude:0};
 const initial=visibleTileRevisionSignature(view,{});
 const changed=visibleTileRevisionSignature(view,{"0:9":1});
 assert.notEqual(initial,changed);
});
