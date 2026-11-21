import test from "node:test";
import assert from "node:assert/strict";
import { simplifyGeoJsonCollection, createGeoJsonLodSet } from "../src/world/geometry-generalization.js";

const polygon=(coordinates)=>({type:"Feature",properties:{},geometry:{type:"Polygon",coordinates}});
test("simplifie les anneaux et lignes avant projection sans modifier les sources",()=>{
 const ring=[[0,0],[1,0.0001],[2,0],[2,1],[1,1.0001],[0,1],[0,0]];
 const line=[[10,0],[11,0.0001],[12,0],[13,0]];
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


test("les niveaux LOD sont calculés une fois puis réutilisés pendant les déplacements",()=>{
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const source={type:"FeatureCollection",features:[polygon([ring])]};
 const base=simplifyGeoJsonCollection(source,0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:2,tolerance:0.01},
  {maxZoom:5,tolerance:0.002}
 ],0.0001);
 const coarse=lod.getForZoom(1.5);
 assert.equal(lod.getStats().generatedLevels,1);
 assert.equal(lod.getForZoom(1.2),coarse,"un même niveau de zoom doit réutiliser la collection déjà préparée");
 const medium=lod.getForZoom(3);
 assert.notEqual(medium,coarse);
 assert.equal(lod.getForZoom(4.5),medium,"les pans et zooms dans le même palier réutilisent la géométrie");
 assert.equal(lod.getForZoom(8),base,"le niveau de base détaillé sert au zoom rapproché");
 assert.equal(lod.getStats().generatedLevels,2);
});

test("les collections LOD absentes restent sans effet et les seuils sont ordonnés",()=>{
 const lod=createGeoJsonLodSet(null,[{maxZoom:3,tolerance:0.1}],0);
 assert.equal(lod.getForZoom(1),null);
 assert.deepEqual(lod.getStats(),{generatedLevels:0,cachedLevels:0,configuredLevels:1,generationTimeMs:0,lastGenerationMs:0,removedVertices:0,cachedTolerances:[],workerCollectionTransfers:0,workerJobsCompleted:0,workerActive:false});
});


test("prépare le palier LOD adjacent sans attendre son premier affichage",()=>{
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:1.8,tolerance:0.04},
  {maxZoom:3.5,tolerance:0.02},
  {maxZoom:6,tolerance:0.008}
 ],0.0001);
 const coarse=lod.getForZoom(1);
 assert.equal(lod.getAdjacentZoom(1,1),1.801);
 assert.equal(lod.prepareAdjacent(1,1),true);
 assert.equal(lod.getForZoom(2),lod.getForZoom(1.801));
 assert.notEqual(lod.getForZoom(2),coarse);
 assert.equal(lod.getStats().generatedLevels,2);
 assert.ok(lod.getStats().generationTimeMs>=0);
 assert.ok(Array.isArray(lod.getStats().cachedTolerances));
});

test("le préchauffage LOD vers un zoom inférieur prépare le niveau plus grossier",()=>{
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:1.8,tolerance:0.04},
  {maxZoom:3.5,tolerance:0.02},
  {maxZoom:6,tolerance:0.008}
 ],0.0001);
 lod.getForZoom(5);
 assert.equal(lod.getAdjacentZoom(5,-1),3.5);
 assert.equal(lod.prepareAdjacent(5,-1),true);
 assert.equal(lod.getStats().generatedLevels,2);
});


test("le préchauffage LOD utilise un worker et ne bloque pas la sélection du niveau courant", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 let posted=null, terminated=false;
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:1.8,tolerance:0.04},{maxZoom:3.5,tolerance:0.02}
 ],0.0001,{
  createWorker:()=>({
   postMessage(message){
    posted=message;
    if(message.type==="simplify")queueMicrotask(()=>this.onmessage({data:{
     requestId:message.requestId,
     result:simplifyGeoJsonCollection(base,message.tolerance)
    }}));
   },
   terminate(){terminated=true;}
  })
 });
 const currentLevel=lod.getForZoom(1);
 assert.notEqual(currentLevel,base);
 const promise=lod.prepareAdjacentAsync(1,1);
 assert.equal(lod.getForZoom(2),base,"le niveau adjacent en attente ne doit pas être généré sur le thread principal");
 assert.equal(posted.type,"simplify");
 assert.equal(await promise,true);
 assert.equal(terminated,false,"le worker reste actif pour réutiliser la collection source");
 assert.notEqual(lod.getForZoom(2),base,"le niveau calculé devient disponible après la réponse worker");
 assert.equal(lod.getStats().generatedLevels,2);
 assert.equal(lod.getStats().workerCollectionTransfers,1);
 assert.equal(lod.getStats().workerJobsCompleted,1);
 assert.equal(lod.getStats().workerActive,true);
 lod.dispose();
 assert.equal(terminated,true);
});

test("un worker LOD en erreur retombe sur la génération locale", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:1.8,tolerance:0.04},{maxZoom:3.5,tolerance:0.02}
 ],0.0001,{
  createWorker:()=>({
   postMessage(message){
    if(message.type==="simplify")queueMicrotask(()=>this.onmessage({data:{
     requestId:message.requestId,error:"worker failure"
    }}));
   },
   terminate(){}
  })
 });
 lod.getForZoom(1);
 assert.equal(await lod.prepareAdjacentAsync(1,1),true);
 assert.notEqual(lod.getForZoom(2),base);
});



test("getForZoom ne généralise pas sur le thread principal quand un Worker est configuré", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 let jobs=0, init=0;
 const lod=createGeoJsonLodSet(base,[{maxZoom:2,tolerance:0.01}],0.0001,{
  createWorker:()=>({
   postMessage(message){
    if(message.type==="init"){init++;return;}
    if(message.type==="simplify"){
     jobs++;
     queueMicrotask(()=>this.onmessage({data:{requestId:message.requestId,result:simplifyGeoJsonCollection(base,message.tolerance)}}));
    }
   },
   terminate(){}
  })
 });
 assert.equal(lod.getForZoom(1),base,"le premier rendu doit utiliser le niveau de base, sans calcul synchrone");
 assert.equal(await lod.prepareZoomAsync(1),true);
 assert.equal(jobs,1);
 assert.equal(init,1);
 assert.notEqual(lod.getForZoom(1),base,"le niveau généralisé doit être disponible après la réponse Worker");
 lod.dispose();
});

test("les niveaux LOD successifs réutilisent le même worker et ne retransfèrent pas le GeoJSON", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 let workerCreations=0, initMessages=0, jobs=0;
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:1.8,tolerance:0.04},
  {maxZoom:3.5,tolerance:0.02},
  {maxZoom:6,tolerance:0.008}
 ],0.0001,{
  createWorker:()=>{
   workerCreations++;
   return {
    postMessage(message){
     if(message.type==="init"){initMessages++;return;}
     if(message.type==="simplify"){
      jobs++;
      queueMicrotask(()=>this.onmessage({data:{
       requestId:message.requestId,
       result:simplifyGeoJsonCollection(base,message.tolerance)
      }}));
     }
    },
    terminate(){}
   };
  }
 });
 lod.getForZoom(1);
 assert.equal(await lod.prepareAdjacentAsync(1,1),true);
 assert.equal(await lod.prepareAdjacentAsync(2,1),true);
 const stats=lod.getStats();
 assert.equal(workerCreations,1);
 assert.equal(initMessages,1);
 assert.equal(jobs,2);
 assert.equal(stats.workerCollectionTransfers,1);
 assert.equal(stats.workerJobsCompleted,2);
 assert.notEqual(lod.getForZoom(4),base);
 lod.dispose();
});
