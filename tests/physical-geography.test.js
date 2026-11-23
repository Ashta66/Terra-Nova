import test from "node:test";
import assert from "node:assert/strict";
import {createPhysicalWorld,applyPhysicalEvent,getPhysicalStateAtDate,buildPhysicalCellsFromTerrainGrid,buildOceanConnectivityMask,refinePhysicalWorldForImpact,expirePhysicalSurfaceEffects,getNextPhysicalSurfaceExpiryDate} from "../src/world/physical-geography.js";
import {createSocietyState,applyPhysicalConsequences,planAiResponses,applyAiResponses} from "../src/world/society-engine.js";
import {advanceWorldSimulation} from "../src/world/world-simulation.js";
const cells=[{id:"coast",longitude:0,latitude:0,elevationM:3,coastalDistanceKm:2,regionId:"delta"},{id:"inland",longitude:.1,latitude:0,elevationM:120,coastalDistanceKm:35,regionId:"delta"},{id:"far",longitude:25,latitude:10,elevationM:800,coastalDistanceKm:300,regionId:"upland"},{id:"ocean",longitude:.02,latitude:0,elevationM:-80,coastalDistanceKm:0,regionId:"sea"}];
test("météorite : cratère et choc sans mutation de la géographie de référence",()=>{const w=createPhysicalWorld(cells),n=applyPhysicalEvent(w,{id:"impact",type:"meteor-impact",date:"1500-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500});assert.ok(n.world.currentCells[0].elevationDeltaM<0);assert.equal(w.currentCells[0].elevationDeltaM,0);assert.ok(n.result.affectedCells.length);});
test("tsunami : exposition côtière et dégâts",()=>{const n=applyPhysicalEvent(createPhysicalWorld(cells),{id:"wave",type:"tsunami",date:"1501-01-01",longitude:0,latitude:0,radiusKm:250,waveHeightM:12,maxCoastalDistanceKm:100});assert.ok(n.world.currentCells[0].damage>0);assert.ok(n.world.currentCells[0].tsunamiWaterDepthM>0);assert.equal(n.world.currentCells[2].damage,0);assert.equal(n.world.currentCells[3].damage,0);assert.ok(n.result.regionImpacts[0].damage>0);});
test("montée des eaux : seules les terres sous le niveau sont submergées",()=>{const n=applyPhysicalEvent(createPhysicalWorld(cells),{id:"sea",type:"sea-level-rise",date:"1600-01-01",seaLevelM:5});assert.equal(n.world.currentCells[0].inundated,true);assert.equal(n.world.currentCells[1].inundated,false);assert.equal(n.world.currentCells[3].inundated,false);assert.equal(n.result.affectedCells.length,1);});
test("volcan : coulée de lave et dépôt de cendres",()=>{const n=applyPhysicalEvent(createPhysicalWorld(cells),{id:"volcano",type:"volcanic-eruption",date:"1601-01-01",longitude:0,latitude:0,radiusKm:60,lavaRadiusKm:5,ashLoad:.9});assert.equal(n.world.currentCells[0].surfaceState,"lava-flow");assert.equal(n.world.currentCells[0].habitability,0);assert.ok(n.world.currentCells[1].ashLoad>0);});
test("séisme : dégâts et déplacement tectonique",()=>{const n=applyPhysicalEvent(createPhysicalWorld(cells),{id:"quake",type:"earthquake",date:"1602-01-01",longitude:0,latitude:0,radiusKm:150,magnitude:8,ruptureOffsetM:2});assert.ok(n.world.currentCells[0].damage>0);assert.ok(n.world.currentCells[0].elevationDeltaM>0);});
test("rejeu déterministe de l'état physique à une date passée",()=>{let w=createPhysicalWorld(cells);w=applyPhysicalEvent(w,{id:"uplift",type:"tectonic-uplift",date:"1500-01-01",longitude:0,latitude:0,radiusKm:100,upliftM:50}).world;w=applyPhysicalEvent(w,{id:"impact",type:"meteor-impact",date:"1700-01-01",longitude:0,latitude:0,radiusKm:100,craterDepthM:100}).world;const past=getPhysicalStateAtDate(w,"1600-01-01");assert.ok(past.currentCells[0].elevationDeltaM>0);assert.equal(past.events.length,1);});
test("catastrophe : déplacements de population et réponses IA",()=>{const p=applyPhysicalEvent(createPhysicalWorld(cells),{id:"flood",type:"sea-level-rise",date:"1700-01-01",seaLevelM:5}),s=createSocietyState([{regionId:"delta",countryId:"fr",population:100000,infrastructure:.9,recoveryCapacity:.6}]),h=applyPhysicalConsequences(s,p.result);assert.ok(h.society.regions[0].displacedPopulation>0);const actions=planAiResponses(h.society,{year:1700});assert.ok(actions.some(a=>["resettle","evacuate"].includes(a.type)));assert.ok(applyAiResponses(h.society,actions).actions.length>0);});
test("pipeline : monde physique, conséquences et IA",()=>{const r=advanceWorldSimulation({physicalWorld:createPhysicalWorld(cells),society:createSocietyState([{regionId:"delta",population:50000,infrastructure:.7,recoveryCapacity:.8}]),event:{id:"chain",type:"tsunami",date:"1800-01-01",longitude:0,latitude:0,radiusKm:180,waveHeightM:20,maxCoastalDistanceKm:100},year:1800});assert.ok(r.report.affectedCells>0);assert.ok(r.report.humanConsequences.length>0);assert.ok(r.report.aiActions.length>0);});

test("la grille physique peut être initialisée depuis un raster ETOPO",()=>{
 const grid={width:4,height:2,values:new Int16Array([100,80,-20,-50,110,90,-10,-40])};
 const cells=buildPhysicalCellsFromTerrainGrid(grid,{step:1,maxCoastSearchCells:2});
 assert.equal(cells.length,8);assert.equal(cells[0].elevationM,100);assert.ok(cells[0].coastalDistanceKm>0);assert.equal(cells[2].coastalDistanceKm,0);assert.ok(cells[0].regionId.startsWith("geo-"));
});

test("l'IA réinstalle les habitants déplacés vers une région sûre",()=>{
 const society=createSocietyState([{regionId:"damaged",countryId:"fr",population:10000,infrastructure:.1,habitability:.1,foodSecurity:.2},{regionId:"safe",countryId:"fr",population:20000,infrastructure:.9,habitability:.95,foodSecurity:.9}]);
 society.regions[0].displacedPopulation=3000;
 const actions=planAiResponses(society,{year:1801}),move=actions.find(a=>a.type==="resettle");
 assert.equal(move.targetRegionId,"safe");
 const result=applyAiResponses(society,[move]);
 assert.ok(result.society.regions[1].incomingMigrants>0);
 assert.ok(result.society.regions[0].migratedOutPopulation>0);
});


test("un impact affine temporairement la grille autour du point d'impact",()=>{
 const grid={width:360,height:180,values:new Int16Array(360*180).fill(120)};
 const base=createPhysicalWorld(buildPhysicalCellsFromTerrainGrid(grid,{step:12,maxCoastSearchCells:1}));
 const event={id:"local-refinement",type:"meteor-impact",date:"1444-01-01",longitude:0,latitude:0,radiusKm:1000,craterDepthM:900,lavaRadiusKm:100,noManLandRadiusKm:150};
 const refined=refinePhysicalWorldForImpact(base,grid,event,2);
 assert.ok(refined.currentCells.some(cell=>cell.gridStep===2));
 assert.ok(refined.revision>base.revision);
 const impact=applyPhysicalEvent(refined,event);
 assert.ok(impact.result.affectedCells.length>0);
 assert.ok(impact.world.currentCells.some(cell=>cell.gridStep===2&&cell.noManLand));
});

test("impact : lave et no man's land temporaires, relief permanent",()=>{const n=applyPhysicalEvent(createPhysicalWorld(cells),{id:"temporary-impact",type:"meteor-impact",date:"1500-01-31",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,lavaRadiusKm:8,noManLandRadiusKm:55,surfaceDurationMonths:3});const core=n.world.currentCells[0];assert.equal(core.surfaceState,"lava-flow");assert.equal(core.noManLand,true);assert.equal(core.surfaceExpiresAt,"1500-04-30");const expired=expirePhysicalSurfaceEffects(n.world,"1500-05-01");assert.equal(expired.currentCells[0].surfaceState,"natural");assert.equal(expired.currentCells[0].noManLand,false);assert.ok(expired.currentCells[0].elevationDeltaM<0);});

test("impact météoritique : cratère et bourrelet modifient le profil altimétrique",()=>{
 const base=createPhysicalWorld([{id:"centre",longitude:0,latitude:0,elevationM:120,coastalDistanceKm:0},{id:"rim",longitude:.55,latitude:0,elevationM:120,coastalDistanceKm:0}]);
 const result=applyPhysicalEvent(base,{id:"rim-test",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:150,craterRadiusKm:60,craterDepthM:1800,rimHeightM:600});
 assert.ok(result.world.currentCells[0].elevationDeltaM<0);assert.ok(result.world.currentCells[1].elevationDeltaM>0);
});

test("la submersion d'un tsunami dure un mois puis se retire",()=>{
 const flooded=applyPhysicalEvent(createPhysicalWorld(cells),{id:"short-wave",type:"tsunami",date:"1900-01-01",longitude:0,latitude:0,radiusKm:250,waveHeightM:20,maxCoastalDistanceKm:100}).world;
 assert.ok(flooded.currentCells[0].tsunamiWaterDepthM>0);
 const afterTwoDays=expirePhysicalSurfaceEffects(flooded,"1900-01-03");
 assert.ok(afterTwoDays.currentCells[0].tsunamiWaterDepthM>0);
 const recovered=expirePhysicalSurfaceEffects(afterTwoDays,"1900-02-01");
 assert.equal(recovered.currentCells[0].tsunamiWaterDepthM,0);
});

test("les marqueurs visuels des catastrophes expirent sans effacer les déformations",()=>{
 const w=applyPhysicalEvent(createPhysicalWorld([{id:"c",longitude:0,latitude:0,elevationM:100,coastalDistanceKm:0}]),{id:"ring-expiry",type:"earthquake",date:"1900-01-01",longitude:0,latitude:0,radiusKm:100,magnitude:8,ruptureOffsetM:2}).world;
 const stillActive=expirePhysicalSurfaceEffects(w,"1900-01-04");assert.equal(stillActive.events[0].visualExpired,undefined);const next=expirePhysicalSurfaceEffects(stillActive,"1900-01-09");assert.equal(next.events[0].visualExpired,true);assert.ok(next.currentCells[0].elevationDeltaM>0);
});


test("un cratère terrestre isolé ne se transforme pas en lac",()=>{
 const inland=createPhysicalWorld([{id:"impact-land",longitude:0,latitude:0,elevationM:120,coastalDistanceKm:500},{id:"ocean-far",longitude:8,latitude:0,elevationM:-4000,coastalDistanceKm:0}]);
 const result=applyPhysicalEvent(inland,{id:"dry-crater",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:160,craterRadiusKm:90,craterDepthM:2200,lavaRadiusKm:18});
 assert.equal(result.result.event.waterContact,false);
 assert.ok(result.world.currentCells[0].currentElevationM>0);
 assert.equal(result.world.currentCells[0].permanentlySubmerged,undefined);
});

test("un cratère proche de la mer peut devenir un lac permanent",()=>{
 const coastal=createPhysicalWorld([{id:"impact-land",longitude:0,latitude:0,elevationM:120,coastalDistanceKm:0},{id:"near-sea",longitude:.3,latitude:0,elevationM:-20,coastalDistanceKm:0}]);
 const result=applyPhysicalEvent(coastal,{id:"wet-crater",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:160,craterRadiusKm:90,craterDepthM:2200,lavaRadiusKm:18});
 assert.equal(result.result.event.waterContact,true);
 assert.equal(result.world.currentCells[0].permanentlySubmerged,true);
 assert.equal(result.world.currentCells[0].inundated,true);
});

test("lave météoritique et submersion de tsunami durent un mois de simulation",()=>{
 const base=createPhysicalWorld(cells);
 const impact=applyPhysicalEvent(base,{id:"one-month-lava",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,lavaRadiusKm:8,noManLandRadiusKm:55,surfaceDurationMonths:1}).world;
 assert.equal(impact.currentCells[0].surfaceExpiresAt,"1900-02-01");
 const wave=applyPhysicalEvent(base,{id:"one-month-wave",type:"tsunami",date:"1900-01-01",longitude:0,latitude:0,radiusKm:250,waveHeightM:20,maxCoastalDistanceKm:100}).world;
 assert.equal(wave.currentCells[0].waterExpiresAt,"1900-02-01");
 const recovered=expirePhysicalSurfaceEffects(wave,"1900-02-01");
 assert.equal(recovered.currentCells[0].tsunamiWaterDepthM,0);
});

test("un séisme soulève un côté de faille et en abaisse l'autre",()=>{
 const base=createPhysicalWorld([{id:"north",longitude:0,latitude:1,elevationM:100,coastalDistanceKm:50},{id:"south",longitude:0,latitude:-1,elevationM:100,coastalDistanceKm:50}]);
 const result=applyPhysicalEvent(base,{id:"fault",type:"earthquake",date:"1900-01-01",longitude:0,latitude:0,radiusKm:300,magnitude:9,ruptureOffsetM:30,ruptureBearingDeg:0});
 assert.ok(result.world.currentCells[0].elevationDeltaM>0);
 assert.ok(result.world.currentCells[1].elevationDeltaM<0);
});

test("un cratère terrestre éloigné de la mer ne crée jamais de lac",()=>{
 const inland=[{id:"impact-land",longitude:0,latitude:0,elevationM:600,coastalDistanceKm:180},{id:"distant-ocean",longitude:2,latitude:0,elevationM:-4000,coastalDistanceKm:0}];
 const w=applyPhysicalEvent(createPhysicalWorld(inland),{id:"dry-crater",type:"meteor-impact",date:"1500-01-01",longitude:0,latitude:0,radiusKm:120,craterRadiusKm:50,craterDepthM:1800});
 assert.equal(w.result.event.waterContact,false);
 assert.equal(w.world.currentCells[0].permanentlySubmerged,undefined);
 assert.ok(w.world.currentCells[0].currentElevationM>=0);
});
test("un cratère qui touche réellement la côte peut communiquer avec la mer",()=>{
 const coast=[{id:"impact-land",longitude:0,latitude:0,elevationM:20,coastalDistanceKm:1},{id:"ocean",longitude:.03,latitude:0,elevationM:-100,coastalDistanceKm:0}];
 const w=applyPhysicalEvent(createPhysicalWorld(coast),{id:"wet-crater",type:"meteor-impact",date:"1500-01-01",longitude:0,latitude:0,radiusKm:100,craterRadiusKm:42,craterDepthM:1800});
 assert.equal(w.result.event.waterContact,true);
});
test("cercles du tsunami et de la météorite restent actifs pendant leur effet mensuel",()=>{
 const w=createPhysicalWorld(cells);
 const meteor=applyPhysicalEvent(w,{id:"month-impact",type:"meteor-impact",date:"1500-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,surfaceDurationMonths:1}).world;
 assert.equal(expirePhysicalSurfaceEffects(meteor,"1500-01-20").events[0].visualExpired,undefined);
 const tsunami=applyPhysicalEvent(w,{id:"month-wave",type:"tsunami",date:"1500-01-01",longitude:0,latitude:0,radiusKm:250,waveHeightM:12,maxCoastalDistanceKm:100}).world;
 assert.equal(expirePhysicalSurfaceEffects(tsunami,"1500-01-20").events[0].visualExpired,undefined);
 assert.equal(expirePhysicalSurfaceEffects(tsunami,"1500-02-02").events[0].visualExpired,true);
});
test("le séisme calcule un déplacement tectonique par défaut",()=>{
 const w=applyPhysicalEvent(createPhysicalWorld(cells),{id:"auto-quake",type:"earthquake",date:"1602-01-01",longitude:0,latitude:0,radiusKm:150,magnitude:8}).world;
 assert.ok(w.events[0].ruptureOffsetM>0);
 assert.ok(w.currentCells.some(c=>Math.abs(c.elevationDeltaM)>0));
});

test("une catastrophe incrémente les révisions des seules tuiles locales et de leur halo",()=>{
 const base=createPhysicalWorld(cells);
 const result=applyPhysicalEvent(base,{id:"tile-local-impact",type:"earthquake",date:"1900-01-01",longitude:0,latitude:0,radiusKm:80,magnitude:8});
 assert.ok(result.world.tileRevisions["18:9"]>0);
 assert.ok(result.world.lastInvalidatedTileKeys.includes("18:9"));
 assert.equal(result.world.tileRevisions["20:10"]??0,0);
 assert.ok(result.world.lastInvalidatedTileKeys.length<30);
});

test("le masque de connexion réelle à l'océan exclut les lacs intérieurs isolés",()=>{
 const values=new Int16Array([-10,-10,-10,-10,-10,-10,100,100,100,-10,-10,100,-5,100,-10,-10,100,100,100,-10,-10,-10,-10,-10,-10]);
 const ocean=buildOceanConnectivityMask({width:5,height:5,values},1);
 assert.equal(ocean.mask[0],1);
 assert.equal(ocean.mask[12],0);
});

test("l'expiration conserve la référence du monde tant qu'aucune échéance n'est atteinte",()=>{
 const world=createPhysicalWorld(cells);
 const withImpact=applyPhysicalEvent(world,{id:"future-expiry-fast-path",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,surfaceDurationMonths:3}).world;
 assert.equal(expirePhysicalSurfaceEffects(withImpact,"1900-01-02"),withImpact);
});
test("l'expiration clone le monde uniquement lorsqu'une échéance est atteinte",()=>{
 const world=createPhysicalWorld(cells);
 const withWave=applyPhysicalEvent(world,{id:"due-expiry-fast-path",type:"tsunami",date:"1900-01-01",longitude:0,latitude:0,radiusKm:250,waveHeightM:12,maxCoastalDistanceKm:100}).world;
 const expired=expirePhysicalSurfaceEffects(withWave,"1900-02-02");
 assert.notEqual(expired,withWave);
 assert.equal(expired.currentCells[0].tsunamiWaterDepthM,0);
});

test("l'échéancier physique identifie la prochaine expiration sans parcourir le monde à chaque tick",()=>{
 const impact=applyPhysicalEvent(createPhysicalWorld(cells),{id:"indexed-impact",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,surfaceDurationMonths:3}).world;
 assert.equal(getNextPhysicalSurfaceExpiryDate(impact),"1900-04-01");
 const first=expirePhysicalSurfaceEffects(impact,"1900-01-02");
 assert.equal(first,impact);
 const stillBeforeSurfaceExpiry=expirePhysicalSurfaceEffects(first,"1900-02-01");
 assert.equal(stillBeforeSurfaceExpiry,impact);
 const expired=expirePhysicalSurfaceEffects(impact,"1900-04-02");
 assert.notEqual(expired,impact);
 assert.equal(getNextPhysicalSurfaceExpiryDate(expired),null);
});

test("l'échéancier prend en compte l'expiration mensuelle des effets de surface",()=>{
 const impact=applyPhysicalEvent(createPhysicalWorld(cells),{id:"indexed-surface",type:"meteor-impact",date:"1900-01-01",longitude:0,latitude:0,radiusKm:80,craterDepthM:500,surfaceDurationMonths:1}).world;
 assert.equal(getNextPhysicalSurfaceExpiryDate(impact),"1900-02-01");
 const afterVisual=expirePhysicalSurfaceEffects(impact,"1900-02-02");
 assert.notEqual(afterVisual,impact);
 assert.equal(getNextPhysicalSurfaceExpiryDate(afterVisual),null);
});
