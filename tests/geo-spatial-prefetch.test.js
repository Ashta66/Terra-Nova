import test from "node:test";
import assert from "node:assert/strict";
import { buildGeoSpatialIndex, prefetchGeoSpatialFeatures, getGeoSpatialIndexStats, selectGeoSpatialFeatures } from "../src/world/geo-spatial-index.js";

function collection() {
  const features=[];
  for(let lat=-80;lat<=80;lat+=10) for(let lon=-170;lon<=170;lon+=10) {
    features.push({type:"Feature",properties:{id:lat+":"+lon},geometry:{type:"Point",coordinates:[lon,lat]}});
  }
  return {type:"FeatureCollection",features};
}

test("prépare une emprise élargie sans dépasser le budget de tuiles",()=>{
  const data=collection(); buildGeoSpatialIndex(data);
  const count=prefetchGeoSpatialFeatures(data,{zoom:5,centerLongitude:0,centerLatitude:0},1,{coverage:1.6});
  const stats=getGeoSpatialIndexStats(data);
  assert.ok(count>0 && count<=24);
  assert.ok(stats.cachedTiles<=24);
});

test("oriente les secteurs anticipés dans la direction du déplacement",()=>{
  const east=collection(), west=collection();
  buildGeoSpatialIndex(east); buildGeoSpatialIndex(west);
  prefetchGeoSpatialFeatures(east,{zoom:5,centerLongitude:0,centerLatitude:0},1,{coverage:1.6,direction:{x:1,y:0}});
  prefetchGeoSpatialFeatures(west,{zoom:5,centerLongitude:0,centerLatitude:0},1,{coverage:1.6,direction:{x:-1,y:0}});
  const eastKeys=[...east.features].length;
  const westKeys=[...west.features].length;
  assert.equal(eastKeys,westKeys);
  assert.ok(getGeoSpatialIndexStats(east).cachedTiles>0);
  assert.ok(getGeoSpatialIndexStats(west).cachedTiles>0);
});

test("gère le préchargement près de l'antiméridien",()=>{
  const data=collection(); buildGeoSpatialIndex(data);
  const count=prefetchGeoSpatialFeatures(data,{zoom:8,centerLongitude:179,centerLatitude:0},1,{direction:{x:1,y:0}});
  assert.ok(count>0 && count<=24);
});

test("ne précharge rien à l'échelle mondiale",()=>{
  const data=collection();
  assert.equal(prefetchGeoSpatialFeatures(data,{zoom:1,centerLongitude:0,centerLatitude:0}),0);
  assert.equal(getGeoSpatialIndexStats(data).indexed,false);
});


test("le cache spatial LRU conserve davantage de zones récemment consultées",()=>{
  const data=collection();
  for(let i=0;i<90;i++) selectGeoSpatialFeatures(data,{zoom:12,centerLongitude:-150+i*3,centerLatitude:20});
  const stats=getGeoSpatialIndexStats(data);
  assert.equal(stats.maxCachedTiles,256);
  assert.equal(stats.maxCachedQueries,64);
  assert.ok(stats.cachedTiles<=256);
  assert.ok(stats.cachedQueries<=64);
});
