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
 assert.deepEqual(lod.getStats(),{generatedLevels:0,cachedLevels:0,configuredLevels:1,generationTimeMs:0,lastGenerationMs:0,removedVertices:0,cachedTolerances:[],workerCollectionTransfers:0,workerJobsCompleted:0,workerCreationAttempts:0,workerCreationFailures:0,workerRuntimeFailures:0,workerSyncFallbackJobs:0,workerActive:false});
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
 assert.equal(currentLevel,base,"le rendu initial conserve le niveau de base sans calcul synchrone");
 assert.equal(await lod.prepareZoomAsync(1),true);
 assert.notEqual(lod.getForZoom(1),base,"le niveau courant devient disponible après le Worker");
 const promise=lod.prepareAdjacentAsync(1,1);
 assert.equal(lod.getForZoom(2),base,"le niveau adjacent en attente ne doit pas être généré sur le thread principal");
 assert.equal(posted.type,"simplify");
 assert.equal(await promise,true);
 assert.equal(terminated,false,"le worker reste actif pour réutiliser la collection source");
 assert.notEqual(lod.getForZoom(2),base,"le niveau calculé devient disponible après la réponse worker");
 assert.equal(lod.getStats().generatedLevels,2);
 assert.equal(lod.getStats().workerCollectionTransfers,1);
 assert.equal(lod.getStats().workerJobsCompleted,2);
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
 assert.equal(lod.getStats().workerRuntimeFailures,1);
 assert.equal(lod.getStats().workerSyncFallbackJobs,1);
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
 assert.notEqual(lod.getForZoom(4),base,"le troisième niveau est préchauffé par le second appel adjacent");
 lod.dispose();
});


test("les statistiques distinguent un worker indisponible du fallback synchrone", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 const lod=createGeoJsonLodSet(base,[{maxZoom:2,tolerance:0.01}],0.0001,{createWorker:()=>null});
 assert.equal(await lod.prepareZoomAsync(1),true);
 const stats=lod.getStats();
 assert.equal(stats.workerCreationAttempts,1);
 assert.equal(stats.workerCreationFailures,1);
 assert.equal(stats.workerSyncFallbackJobs,1);
 assert.equal(stats.workerRuntimeFailures,0);
});

test("généralise les MultiLineString et GeometryCollection sans perdre leurs chemins", () => {
 const lineA=[[0,0],[1,0.0001],[2,0],[3,0]];
 const lineB=[[10,0],[11,0.0001],[12,0],[13,0]];
 const source={type:"FeatureCollection",features:[{
  type:"Feature",properties:{},geometry:{type:"GeometryCollection",geometries:[
   {type:"MultiLineString",coordinates:[lineA,lineB]}
  ]}
 }]};
 const result=simplifyGeoJsonCollection(source,0.01);
 const geometries=result.features[0].geometry.geometries;
 assert.equal(geometries[0].coordinates.length,2);
 assert.ok(geometries[0].coordinates.every(line=>line.length<4));
 assert.equal(result.geometryStats.originalVertices,8);
 assert.equal(result.geometryStats.simplifiedVertices,4);
 assert.equal(source.features[0].geometry.geometries[0].coordinates[0].length,4);
});

test("les seuils LOD dupliqués conservent le dernier niveau déclaré",()=>{
 const ring=[[0,0],[1,0.0001],[2,0],[3,0.0001],[4,0],[4,2],[3,2.0001],[2,2],[1,2.0001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:2,tolerance:0.01},
  {maxZoom:2,tolerance:0.02}
 ],0.0001);
 const result=lod.getForZoom(1);
 assert.equal(result.geometryStats.tolerance,0.02);
});


test("un worker LOD détruit ne peut pas être recréé et ignore ses réponses tardives", async () => {
 const ring=[[0,0],[1,0.001],[2,0],[3,0.001],[4,0],[4,2],[3,2.001],[2,2],[1,2.001],[0,2],[0,0]];
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([ring])]},0.0001);
 let creations=0, terminated=0, listener=null;
 const lod=createGeoJsonLodSet(base,[{maxZoom:2,tolerance:0.01}],0.0001,{
  createWorker:()=>{
   creations++;
   return {
    postMessage(message){ if(message.type==="simplify") listener=this.onmessage; },
    terminate(){terminated++;}
   };
  }
 });
 const pending=lod.prepareZoomAsync(1);
 assert.equal(creations,1);
 lod.dispose();
 assert.equal(await pending,false);
 assert.equal(terminated,1);
 assert.equal(await lod.prepareZoomAsync(1),false);
 assert.equal(await lod.prepareAdjacentAsync(1,1),false);
 assert.equal(creations,1,"aucun worker ne doit être recréé après dispose");
 listener?.({data:{requestId:1,result:base}});
 assert.equal(lod.getStats().workerActive,false);
});

test("les compteurs de sommets couvrent les géométries composites sans perdre de coordonnées",()=>{
 const polygonRing=[[0,0],[1,0.0001],[2,0],[2,1],[1,1.0001],[0,1],[0,0]];
 const line=[[10,0],[11,0.0001],[12,0],[13,0]];
 const geometry={type:"GeometryCollection",geometries:[
  {type:"Polygon",coordinates:[polygonRing]},
  {type:"MultiLineString",coordinates:[line,[[20,0],[21,0],[22,0]]]},
  {type:"MultiPolygon",coordinates:[[[[30,0],[31,0],[31,1],[30,0]]]]}
 ]};
 const source={type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry}]};
 const original=polygonRing.length+line.length+3+4;
 const result=simplifyGeoJsonCollection(source,0.01);
 assert.equal(result.geometryStats.originalVertices,original);
 assert.equal(result.geometryStats.simplifiedVertices,result.features[0].geometry.geometries.reduce((total,child)=>{
  if(child.type==="Polygon")return total+child.coordinates.reduce((n,ring)=>n+ring.length,0);
  if(child.type==="MultiLineString")return total+child.coordinates.reduce((n,path)=>n+path.length,0);
  if(child.type==="MultiPolygon")return total+child.coordinates.reduce((n,poly)=>n+poly.reduce((m,ring)=>m+ring.length,0),0);
  return total;
 },0));
});

test("la recherche LOD binaire respecte les seuils exacts et les niveaux non triés",()=>{
 const base=simplifyGeoJsonCollection({type:"FeatureCollection",features:[polygon([[[0,0],[1,0],[1,1],[0,0]]])]},0.0001);
 const lod=createGeoJsonLodSet(base,[
  {maxZoom:6,tolerance:0.006},
  {maxZoom:2,tolerance:0.04},
  {maxZoom:4,tolerance:0.02}
 ],0.0001);
 const coarse=lod.getForZoom(1.5);
 assert.equal(lod.getForZoom(2),coarse);
 const medium=lod.getForZoom(2.001);
 assert.equal(lod.getForZoom(4),medium);
 const fine=lod.getForZoom(4.001);
 assert.equal(lod.getForZoom(6),fine);
 assert.equal(lod.getForZoom(6.001),base);
 assert.equal(lod.getAdjacentZoom(1,1),2.001);
 assert.equal(lod.getAdjacentZoom(5,-1),4);
 assert.equal(lod.getForZoom(Infinity),base);
});
test("la recherche LOD ignore les zooms non numériques sans altérer le cache",()=>{
 const base={type:"FeatureCollection",features:[]};
 const lod=createGeoJsonLodSet(base,[{maxZoom:3,tolerance:0.1}],0.001);
 assert.equal(lod.getForZoom(NaN),base);
 assert.equal(lod.getForZoom("not-a-zoom"),base);
 assert.equal(lod.getStats().generatedLevels,0);
 assert.equal(lod.getStats().cachedLevels,0);
});


test("la simplification RDP traite une longue ligne avec pile compacte sans perdre ses extrémités",()=>{
 const coordinates=[];
 for(let index=0;index<12000;index++){
  coordinates.push([index*0.01,Math.sin(index/17)*0.0002]);
 }
 const source={type:"FeatureCollection",features:[{
  type:"Feature",properties:{id:"long-line"},
  geometry:{type:"LineString",coordinates}
 }]};
 const result=simplifyGeoJsonCollection(source,0.001);
 const simplified=result.features[0].geometry.coordinates;
 assert.deepEqual(simplified[0],coordinates[0]);
 assert.deepEqual(simplified[simplified.length-1],coordinates[coordinates.length-1]);
 assert.ok(simplified.length<coordinates.length);
 assert.equal(result.geometryStats.originalVertices,coordinates.length);
 assert.equal(result.geometryStats.simplifiedVertices,simplified.length);
 assert.equal(coordinates.length,12000,"la collection source reste immuable");
});

test("la pile compacte conserve les points d'ancrage partagés lors de la simplification",()=>{
 const shared=[2,0.0001];
 const first=[[0,0],shared,[4,0],[6,0],[8,0]];
 const second=[[2,-2],shared,[2,2]];
 const source={type:"FeatureCollection",features:[
  {type:"Feature",properties:{id:"a"},geometry:{type:"LineString",coordinates:first}},
  {type:"Feature",properties:{id:"b"},geometry:{type:"LineString",coordinates:second}}
 ]};
 const result=simplifyGeoJsonCollection(source,0.1);
 assert.ok(result.features.every(feature=>feature.geometry.coordinates.some(point=>
  point[0]===shared[0]&&point[1]===shared[1])));
});

test("le parcours direct des chemins conserve les ancrages dans une grande collection composite",()=>{
 const shared=[12,4];
 const features=[];
 for(let index=0;index<1500;index++){
  const offset=index*0.01;
  features.push({type:"Feature",properties:{id:index},geometry:{
   type:"GeometryCollection",geometries:[
    {type:"LineString",coordinates:[[offset,0],shared,[offset+1,0]]},
    {type:"MultiLineString",coordinates:[[[offset,1],shared,[offset+1,1]]]}
   ]
  }});
 }
 const result=simplifyGeoJsonCollection({type:"FeatureCollection",features},0.5);
 for(const feature of result.features){
  for(const geometry of feature.geometry.geometries){
   const lines=geometry.type==="LineString"?[geometry.coordinates]:geometry.coordinates;
   assert.ok(lines.every(line=>line.some(point=>point[0]===shared[0]&&point[1]===shared[1])));
  }
 }
 assert.equal(result.geometryStats.originalVertices,1500*6);
 assert.equal(features[0].geometry.geometries[0].coordinates.length,3,"la source reste immuable");
});
