import test from "node:test";
import assert from "node:assert/strict";
import { simplifyGeoJsonCollection } from "../src/world/geometry-generalization.js";

const polygon=(coordinates)=>({type:"Feature",properties:{},geometry:{type:"Polygon",coordinates}});
test("simplifie les anneaux et lignes avant projection sans modifier les sources",()=>{
 const ring=[[0,0],[1,0.0001],[2,0],[2,1],[1,1.0001],[0,1],[0,0]];
 const line=[[0,0],[1,0.0001],[2,0],[3,0]];
 const source={type:"FeatureCollection",features:[polygon([ring]),{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:line}}]};
 const result=simplifyGeoJsonCollection(source,0.01);
 assert.ok(result.geometryStats.removedVertices>=2);
 assert.equal(source.features[0].geometry.coordinates[0].length,ring.length);
 assert.equal(result.features[0].geometry.coordinates[0][0][0],0);
 assert.equal(result.features[0].geometry.coordinates[0].at(-1)[0],0);
});
test("préserve les sommets partagés des frontières entre deux pays",()=>{
 const a=[[0,0],[1,0.001],[2,0],[2,1],[0,1],[0,0]];
 const b=[[2,0],[3,0.001],[4,0],[4,1],[2,1],[2,0]];
 const result=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([a]),polygon([b])]},0.01);
 const sharedA=result.features[0].geometry.coordinates[0].filter(p=>p[0]===2);
 const sharedB=result.features[1].geometry.coordinates[0].filter(p=>p[0]===2);
 assert.deepEqual(sharedA,sharedB);
 assert.ok(sharedA.length>=2);
});
test("ignore les collections absentes et les tolérances invalides",()=>{
 assert.equal(simplifyGeoJsonCollection(null,0.1),null);
 const source={type:"FeatureCollection",features:[]};
 assert.equal(simplifyGeoJsonCollection(source,0),source);
});
