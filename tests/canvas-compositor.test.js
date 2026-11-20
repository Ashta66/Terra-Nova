import test from "node:test";
import assert from "node:assert/strict";
import { getSceneTransform } from "../src/world/canvas-compositor.js";
test("identity transform for committed viewport",()=>assert.deepEqual(getSceneTransform({zoom:2,centerLongitude:10,centerLatitude:5},{zoom:2,centerLongitude:10,centerLatitude:5},1000,500),{scale:1,x:0,y:0}));
test("eastward pan moves the scene west",()=>{const t=getSceneTransform({zoom:1,centerLongitude:0,centerLatitude:0},{zoom:1,centerLongitude:10,centerLatitude:0},1000,500);assert.equal(t.x,-1000*10/360);assert.equal(t.y,0);});
test("zoom scales around viewport center",()=>assert.deepEqual(getSceneTransform({zoom:2,centerLongitude:0,centerLatitude:0},{zoom:4,centerLongitude:0,centerLatitude:0},800,400),{scale:2,x:-400,y:-200}));
test("zoom and geographic recentering compose together",()=>{const t=getSceneTransform({zoom:1,centerLongitude:0,centerLatitude:0},{zoom:2,centerLongitude:5,centerLatitude:3},720,360);assert.equal(t.x,-380);assert.equal(t.y,-168);});
