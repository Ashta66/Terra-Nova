import test from "node:test";
import assert from "node:assert/strict";
import { territoriesToSharedBoundaries } from "../src/world/historical-boundaries.js";

test("derive modern shared political boundaries from country polygon edges",()=>{
 const a=[[0,0],[1,0],[1,1],[0,1],[0,0]];
 const b=[[1,0],[2,0],[2,1],[1,1],[1,0]];
 const result=territoriesToSharedBoundaries({type:"FeatureCollection",features:[
  {type:"Feature",properties:{name:"A"},geometry:{type:"Polygon",coordinates:[a]}},
  {type:"Feature",properties:{name:"B"},geometry:{type:"Polygon",coordinates:[b]}}
 ]});
 assert.equal(result.features.length,1);
 assert.equal(result.features[0].geometry.type,"MultiLineString");
 assert.deepEqual(result.features[0].geometry.coordinates,[[[1,0],[1,1]]]);
});

test("only edges shared by distinct features are returned",()=>{
 const ring=[[0,0],[1,0],[1,1],[0,1],[0,0]];
 const result=territoriesToSharedBoundaries({type:"FeatureCollection",features:[
  {type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[ring]}}
 ]});
 assert.deepEqual(result.features,[]);
});

test("repeated edges within one feature do not count as international boundaries",()=>{
 const ring=[[0,0],[1,0],[1,1],[0,1],[0,0]];
 const result=territoriesToSharedBoundaries({type:"FeatureCollection",features:[
  {type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[ring,ring]}}
 ]});
 assert.deepEqual(result.features,[]);
});
