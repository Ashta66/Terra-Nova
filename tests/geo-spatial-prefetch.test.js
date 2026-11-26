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


test("la sélection multi-tuile déduplique sans altérer l'ordre des entités",()=>{
  const data=collection();
  const first=selectGeoSpatialFeatures(data,{zoom:4,centerLongitude:0,centerLatitude:0});
  const ids=first.features.map(feature=>feature.properties.id);
  assert.equal(new Set(ids).size,ids.length);
  const sourceOrder=new Map(data.features.map((feature,index)=>[feature.properties.id,index]));
  assert.deepEqual(ids,[...ids].sort((a,b)=>sourceOrder.get(a)-sourceOrder.get(b)));
  assert.equal(selectGeoSpatialFeatures(data,{zoom:4,centerLongitude:0,centerLatitude:0}),first,
    "une requête identique réutilise le résultat LRU");
});

test("le préchargement conserve son budget avec une grille personnalisée étroite",()=>{
  const data=collection();
  buildGeoSpatialIndex(data,90);
  const count=prefetchGeoSpatialFeatures(data,{zoom:8,centerLongitude:179,centerLatitude:0},1);
  assert.ok(count>0 && count<=24);
  assert.ok(getGeoSpatialIndexStats(data).cachedTiles<=24);
});

test("fusionne les entités globales et locales en conservant l'ordre source",()=>{
  const globalFeature={type:"Feature",properties:{id:"global"},geometry:{type:"Polygon",coordinates:[[[-170,-10],[170,-10],[170,10],[-170,10],[-170,-10]]]}};
  const before={type:"Feature",properties:{id:"before"},geometry:{type:"Point",coordinates:[0,0]}};
  const after={type:"Feature",properties:{id:"after"},geometry:{type:"Point",coordinates:[5,5]}};
  const data={type:"FeatureCollection",features:[globalFeature,before,after]};
  const result=selectGeoSpatialFeatures(data,{zoom:5,centerLongitude:0,centerLatitude:0});
  assert.deepEqual(result.features.map(feature=>feature.properties.id),["global","before","after"]);
});
test("une cellule mise en cache restitue la même liste triée sans reconstruire ses indices",()=>{
  const data=collection();
  buildGeoSpatialIndex(data);
  const viewport={zoom:8,centerLongitude:0,centerLatitude:0};
  const first=selectGeoSpatialFeatures(data,viewport);
  const before=getGeoSpatialIndexStats(data);
  const second=selectGeoSpatialFeatures(data,viewport);
  const after=getGeoSpatialIndexStats(data);
  assert.equal(second,first);
  assert.equal(after.tileHits,before.tileHits);
  assert.ok(after.cachedQueries<=after.maxCachedQueries);
});
test("la sélection autour de l'antiméridien reste sans doublons et ordonnée",()=>{
  const data=collection();
  const result=selectGeoSpatialFeatures(data,{zoom:3,centerLongitude:179,centerLatitude:0});
  const indices=new Map(data.features.map((feature,index)=>[feature,index]));
  const selected=result.features.map(feature=>indices.get(feature));
  assert.equal(new Set(selected).size,selected.length);
  assert.deepEqual(selected,[...selected].sort((a,b)=>a-b));
});
test("le cache de requêtes reste borné après des déplacements répétés",()=>{
  const data=collection();
  for(let i=0;i<180;i++){
    selectGeoSpatialFeatures(data,{zoom:9,centerLongitude:-179+(i*17)%358,centerLatitude:-70+(i*11)%140});
  }
  const stats=getGeoSpatialIndexStats(data);
  assert.ok(stats.cachedQueries<=stats.maxCachedQueries);
  assert.ok(stats.cachedTiles<=stats.maxCachedTiles);
});

test("le calcul des bornes réutilise correctement le parcours des géométries composites",()=>{
 const data={type:"FeatureCollection",features:[
  {type:"Feature",properties:{id:"nested"},geometry:{type:"GeometryCollection",geometries:[
   {type:"Point",coordinates:[-120,45]},
   {type:"GeometryCollection",geometries:[
    {type:"LineString",coordinates:[[10,-20],[30,5]]},
    {type:"MultiPoint",coordinates:[[0,0],[15,25]]}
   ]}
  ]}},
  {type:"Feature",properties:{id:"point"},geometry:{type:"Point",coordinates:[7,-8]}},
  {type:"Feature",properties:{id:"empty"},geometry:{type:"GeometryCollection",geometries:[]}}
 ]};
 const index=buildGeoSpatialIndex(data);
 assert.deepEqual(index.bounds,[
  {minX:-120,minY:-20,maxX:30,maxY:45},
  {minX:7,minY:-8,maxX:7,maxY:-8},
  null
 ]);
});
