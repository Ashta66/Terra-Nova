// Deterministic physical-world simulation. Cells reference stable geographic regions,
// never political ownership or border geometry.
const TYPES=new Set(["meteor-impact","earthquake","volcanic-eruption","tsunami","sea-level-rise","tectonic-uplift"]);
const R=6371,clone=v=>structuredClone(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function id(v,l){if(typeof v!=="string"||!v.trim())throw new TypeError(l+" requis.");return v;}
function num(v,l,a=-Infinity,b=Infinity){v=Number(v);if(!Number.isFinite(v)||v<a||v>b)throw new TypeError(l+" invalide.");return v;}
function addCalendarMonths(date,months){const d=new Date(date+"T00:00:00Z");const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
function addCalendarDays(date,days){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function distance(a,b){const rad=Math.PI/180,p1=a.latitude*rad,p2=b.latitude*rad,dp=(b.latitude-a.latitude)*rad,dl=(((b.longitude-a.longitude+540)%360)-180)*rad,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(clamp(h,0,1)));}
function checkCell(c){id(c.id,"Cellule");num(c.longitude,"Longitude",-180,180);num(c.latitude,"Latitude",-90,90);num(c.elevationM??0,"Altitude",-12000,9000);num(c.coastalDistanceKm??0,"Distance côtière",0,20000);if(c.regionId!=null)id(c.regionId,"Région");}
export function createPhysicalWorld(cells=[]){const ids=new Set(),baseCells=cells.map(c=>{checkCell(c);if(ids.has(c.id))throw Error("Cellule dupliquée : "+c.id);ids.add(c.id);return {...clone(c),baseElevationM:Number(c.elevationM??0),elevationDeltaM:0,currentElevationM:Number(c.elevationM??0),damage:0,ashLoad:0,inundated:false,waterDepthM:0,habitability:1,surfaceState:"natural"};});return {baseCells,currentCells:clone(baseCells),events:[],history:[],revision:0,meanSeaLevelM:0};}
export function validatePhysicalWorld(w){if(!w||!Array.isArray(w.baseCells)||!Array.isArray(w.currentCells)||!Array.isArray(w.events))throw TypeError("État physique invalide.");const ids=new Set();for(const c of w.currentCells){checkCell(c);if(ids.has(c.id))throw Error("Cellule dupliquée : "+c.id);ids.add(c.id);}return true;}
export function validatePhysicalEvent(e){if(!e||typeof e!=="object"||!TYPES.has(e.type))throw TypeError("Événement géophysique inconnu.");const v={...clone(e),id:id(e.id,"Événement"),date:String(e.date??"")};if(!/^\d{1,6}-\d{2}-\d{2}$/.test(v.date))throw TypeError("Date d'événement invalide.");if(e.type==="sea-level-rise")v.seaLevelM=num(e.seaLevelM,"Niveau marin",-20,200);else{v.longitude=num(e.longitude,"Longitude",-180,180);v.latitude=num(e.latitude,"Latitude",-90,90);v.radiusKm=num(e.radiusKm??100,"Rayon",1,20000);}if(e.type==="meteor-impact"){v.craterDepthM=num(e.craterDepthM??150,"Profondeur",1,12000);v.craterRadiusKm=num(e.craterRadiusKm??e.radiusKm*.42,"Rayon du cratère",1,v.radiusKm);v.rimHeightM=num(e.rimHeightM??Math.max(20,e.craterDepthM*.22),"Hauteur du bourrelet",0,5000);v.lavaRadiusKm=num(e.lavaRadiusKm??8,"Rayon de lave",0,v.radiusKm);v.noManLandRadiusKm=num(e.noManLandRadiusKm??55,"Rayon de zone interdite",v.lavaRadiusKm,v.radiusKm);v.surfaceDurationMonths=num(e.surfaceDurationMonths??3,"Durée des effets temporaires",1,6);}if(e.type==="earthquake"){v.magnitude=num(e.magnitude,"Magnitude",1,10);v.ruptureOffsetM=num(e.ruptureOffsetM??0,"Déplacement tectonique",-100,100);}if(e.type==="volcanic-eruption"){v.lavaRadiusKm=num(e.lavaRadiusKm??10,"Rayon de lave",0,v.radiusKm);v.ashLoad=num(e.ashLoad??.6,"Cendres",0,1);v.elevationDeltaM=num(e.elevationDeltaM??40,"Dépôt volcanique",-1000,5000);}if(e.type==="tsunami"){v.waveHeightM=num(e.waveHeightM,"Hauteur de vague",.1,100);v.maxCoastalDistanceKm=num(e.maxCoastalDistanceKm??250,"Portée côtière",1,5000);}if(e.type==="tectonic-uplift")v.upliftM=num(e.upliftM??10,"Soulèvement",.01,5000);return v;}
function effect(e,c,d){if(e.type==="sea-level-rise"){if(c.baseElevationM+c.elevationDeltaM<0)return null;const depth=e.seaLevelM-(c.baseElevationM+c.elevationDeltaM);return depth>0?{severity:clamp(depth/5,0,1),waterDepthM:depth}:null;}if(e.type==="tsunami"){if(c.baseElevationM<0||d>e.radiusKm||c.coastalDistanceKm>e.maxCoastalDistanceKm)return null;const coast=Math.exp(-c.coastalDistanceKm/Math.max(1,e.maxCoastalDistanceKm/3)),radial=Math.max(.15,1-d/e.radiusKm),height=e.waveHeightM*coast*radial;return height>.15?{severity:clamp(height/12,0,1),waterDepthM:height}:null;}if(d===null||d>e.radiusKm)return null;const f=Math.max(0,1-d/e.radiusKm);return {severity:e.type==="earthquake"?clamp(e.magnitude/10*f,0,1):f};}
export function applyPhysicalEvent(world,event){validatePhysicalWorld(world);const e=validatePhysicalEvent(event);if(world.events.some(x=>x.id===e.id))throw Error("Identifiant d'événement déjà utilisé.");const next=clone(world),affected=[],regions=new Map();for(const c of next.currentCells){const d=e.type==="sea-level-rise"?null:distance(e,c),fx=effect(e,c,d);if(!fx)continue;const s=fx.severity;let damage=0;if(e.type==="meteor-impact"){const impactDistance=d??Infinity;const ratio=impactDistance/e.craterRadiusKm;const bowl=impactDistance<=e.craterRadiusKm?Math.sqrt(Math.max(0,1-ratio*ratio)):0;const rim=impactDistance>e.craterRadiusKm*.82&&impactDistance<e.craterRadiusKm*1.28?Math.sin(Math.PI*(impactDistance/e.craterRadiusKm-.82)/.46):0;c.elevationDeltaM-=e.craterDepthM*bowl*bowl;c.elevationDeltaM+=e.rimHeightM*Math.max(0,rim);c.damage=clamp(c.damage+s*.95,0,1);c.noManLand=impactDistance<=e.noManLandRadiusKm;c.surfaceState=impactDistance<=e.lavaRadiusKm?"lava-flow":impactDistance<=e.noManLandRadiusKm?"impact-zone":"natural";c.surfaceExpiresAt=addCalendarMonths(e.date,e.surfaceDurationMonths);c.habitability=c.noManLand?0:clamp(c.habitability*(1-s*.9),0,1);damage=s;}else if(e.type==="earthquake"){c.damage=clamp(c.damage+s*.75,0,1);c.elevationDeltaM+=e.ruptureOffsetM*s;c.habitability=clamp(c.habitability*(1-s*.45),0,1);damage=s*.75;}else if(e.type==="volcanic-eruption"){c.ashLoad=clamp(c.ashLoad+e.ashLoad*s,0,1);c.elevationDeltaM+=e.elevationDeltaM*s;if(d<=e.lavaRadiusKm){c.surfaceState="lava-flow";c.habitability=0;c.damage=1;}else c.habitability=clamp(c.habitability-s*.55,0,1);damage=d<=e.lavaRadiusKm?1:s*.65;}else if(e.type==="tsunami"){c.damage=clamp(c.damage+s*.85,0,1);c.waterDepthM=Math.max(c.waterDepthM,fx.waterDepthM);if(fx.waterDepthM>c.currentElevationM){c.tsunamiWaterDepthM=Math.max(c.tsunamiWaterDepthM??0,fx.waterDepthM-c.currentElevationM);c.waterExpiresAt=addCalendarDays(e.date,2);}c.habitability=clamp(c.habitability-s*.7,0,1);damage=s*.85;}else if(e.type==="sea-level-rise"){c.inundated=true;c.waterDepthM=Math.max(c.waterDepthM,fx.waterDepthM);c.habitability=0;damage=1;}else if(e.type==="tectonic-uplift"){c.elevationDeltaM+=e.upliftM*s;damage=s*.08;}c.currentElevationM=c.baseElevationM+c.elevationDeltaM;const rec={cellId:c.id,regionId:c.regionId??null,severity:s,damage,inundated:c.inundated};affected.push(rec);if(c.regionId){const a=regions.get(c.regionId)??{regionId:c.regionId,cells:0,severity:0,damage:0,inundatedCells:0};a.cells++;a.severity+=s;a.damage+=damage;if(c.inundated)a.inundatedCells++;regions.set(c.regionId,a);}}if(e.type==="sea-level-rise")next.meanSeaLevelM=Math.max(next.meanSeaLevelM,e.seaLevelM);next.events.push(e);next.revision++;const regionImpacts=[...regions.values()].map(a=>({...a,exposure:a.severity/a.cells,damage:a.damage/a.cells,inundationFraction:a.inundatedCells/a.cells}));next.history.push({revision:next.revision,eventId:e.id,date:e.date,type:e.type,affectedCellCount:affected.length,regionImpacts:clone(regionImpacts)});validatePhysicalWorld(next);return {world:next,result:{event:e,affectedCells:affected,regionImpacts}};}

export function expirePhysicalSurfaceEffects(world,date){if(!world?.currentCells||!/^\d{4,6}-\d{2}-\d{2}$/.test(String(date)))return world;let changed=false;const next=clone(world);for(const c of next.currentCells){if(c.surfaceExpiresAt&&c.surfaceExpiresAt<=date&&(c.noManLand||c.surfaceState==="lava-flow"||c.surfaceState==="impact-zone")){c.noManLand=false;c.surfaceState="natural";c.surfaceExpiresAt=null;c.habitability=Math.max(c.habitability??0,.35);changed=true;}if(c.waterExpiresAt&&c.waterExpiresAt<=date){c.tsunamiWaterDepthM=0;c.waterExpiresAt=null;changed=true;}}for(const e of next.events??[]){if(e.type==="meteor-impact"&&!e.surfaceExpired&&addCalendarMonths(e.date,e.surfaceDurationMonths??3)<=date){e.surfaceExpired=true;changed=true;}}if(changed)next.revision=(Number(next.revision)||0)+1;return changed?next:world;}

export function getPhysicalStateAtDate(world,date){let current=createPhysicalWorld(world.baseCells);for(const e of [...world.events].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){if(e.date>date)break;current=applyPhysicalEvent(current,e).world;}current=expirePhysicalSurfaceEffects(current,date);return current;}

export function refinePhysicalWorldForImpact(world, grid, event, pixelStep = 2) {
 if (!world?.currentCells || !grid?.values || !Number.isInteger(pixelStep) || pixelStep < 1) return world;
 const radiusKm = Math.max(1, Number(event?.radiusKm) || 100) + 150;
 const latitude = Math.max(-89, Math.min(89, Number(event?.latitude) || 0));
 const longitude = Number(event?.longitude) || 0;
 const latSpan = radiusKm / 111.32;
 const lonSpan = radiusKm / (111.32 * Math.max(.18, Math.cos(latitude * Math.PI / 180)));
 const centerX = ((longitude + 180) / 360 * grid.width + grid.width) % grid.width;
 const centerY = (90 - latitude) / 180 * grid.height;
 const xSpan = Math.ceil(lonSpan / 360 * grid.width) + pixelStep;
 const ySpan = Math.ceil(latSpan / 180 * grid.height) + pixelStep;
 const fineCells = [];
 const seen = new Set();
 for (let row = Math.max(0, Math.floor(centerY - ySpan)); row <= Math.min(grid.height - 1, Math.ceil(centerY + ySpan)); row += pixelStep) {
  for (let offset = -xSpan; offset <= xSpan; offset += pixelStep) {
   const column = ((Math.floor(centerX) + offset) % grid.width + grid.width) % grid.width;
   const key = Math.floor(row / pixelStep) + ":" + Math.floor(column / pixelStep);
   if (seen.has(key)) continue;
   const lon = (column + .5) / grid.width * 360 - 180;
   const lat = 90 - (row + .5) / grid.height * 180;
   const cell = { id: "impact-" + event.id + "-" + key.replace(":", "-"), longitude: lon, latitude: lat };
   if (distance({ longitude, latitude }, cell) > radiusKm) continue;
   seen.add(key);
   const elevationM = Number(grid.values[row * grid.width + column]);
   let coastalDistanceKm = elevationM < 0 ? 0 : Infinity;
   if (elevationM >= 0) {
    for (let ring = 1; ring <= 18 && coastalDistanceKm === Infinity; ring++) {
     for (let oy = -ring; oy <= ring; oy++) for (let ox = -ring; ox <= ring; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
      const nx = (column + ox + grid.width) % grid.width, ny = row + oy;
      if (ny < 0 || ny >= grid.height || Number(grid.values[ny * grid.width + nx]) >= 0) continue;
      const nlon = (nx + .5) / grid.width * 360 - 180, nlat = 90 - (ny + .5) / grid.height * 180;
      coastalDistanceKm = Math.min(coastalDistanceKm, distance({longitude:lon,latitude:lat},{longitude:nlon,latitude:nlat}));
     }
    }
    if (coastalDistanceKm === Infinity) coastalDistanceKm = 2000;
   }
   fineCells.push({
    ...cell, elevationM, coastalDistanceKm,
    regionId: "impact-zone-" + event.id,
    gridX: Math.floor(column / pixelStep), gridY: Math.floor(row / pixelStep), gridStep: pixelStep
   });
  }
 }
 if (!fineCells.length) return world;
 const untouched = world.currentCells.filter(cell => distance({ longitude, latitude }, cell) > radiusKm);
 const untouchedBase = world.baseCells.filter(cell => distance({ longitude, latitude }, cell) > radiusKm);
 let refined = createPhysicalWorld(fineCells);
 for (const previous of [...(world.events ?? [])].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
  refined = applyPhysicalEvent(refined, previous).world;
 }
 const next = clone(world);
 next.baseCells = [...untouchedBase, ...refined.baseCells];
 next.currentCells = [...untouched, ...refined.currentCells];
 next.revision = (Number(world.revision) || 0) + 1;
 return next;
}

export function buildPhysicalCellsFromTerrainGrid(grid,{step=12,maxCoastSearchCells=4,regionAt=null}={}){
 if(!grid?.values||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||!Number.isInteger(step)||step<1)throw TypeError("Grille de relief invalide.");
 const cols=Math.ceil(grid.width/step),rows=Math.ceil(grid.height/step),cells=[],elevationAt=(x,y)=>grid.values[clamp(y,0,grid.height-1)*grid.width+((x%grid.width)+grid.width)%grid.width];
 for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
  const px=Math.min(grid.width-1,gx*step+Math.floor(step/2)),py=Math.min(grid.height-1,gy*step+Math.floor(step/2));
  const longitude=(px+.5)/grid.width*360-180,latitude=90-(py+.5)/grid.height*180,elevationM=elevationAt(px,py);
  let coastalDistanceKm=elevationM<0?0:Infinity;
  if(elevationM>=0){
   for(let ring=1;ring<=maxCoastSearchCells&&coastalDistanceKm===Infinity;ring++){
    for(let oy=-ring;oy<=ring;oy++)for(let ox=-ring;ox<=ring;ox++){
     if(Math.max(Math.abs(ox),Math.abs(oy))!==ring)continue;
     const nx=gx*step+Math.floor(step/2)+ox*step,ny=gy*step+Math.floor(step/2)+oy*step;
     if(ny<0||ny>=grid.height||elevationAt(nx,ny)>=0)continue;
     const lon=(nx+.5)/grid.width*360-180,lat=90-(ny+.5)/grid.height*180;
     coastalDistanceKm=Math.min(coastalDistanceKm,distance({longitude,latitude},{longitude:lon,latitude:lat}));
    }
   }
   if(coastalDistanceKm===Infinity)coastalDistanceKm=maxCoastSearchCells*step/grid.width*360*111.32;
  }
  const regionId=typeof regionAt==="function"?regionAt({longitude,latitude,gx,gy}):"geo-"+gy+"-"+gx;
  cells.push({id:"cell-"+gy+"-"+gx,regionId,longitude,latitude,elevationM,coastalDistanceKm,gridX:gx,gridY:gy,gridStep:step});
 }
 return cells;
}
