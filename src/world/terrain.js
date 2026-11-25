const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const RELIEF_EXAGGERATION = 18;

// Palette bathymétrique enrichie : plateau, talus, bassins abyssaux et fosses
// gagnent une signature chromatique sans modifier les profondeurs ETOPO.
const SEA_COLOR_STOPS = [
  [-11000, [19, 35, 49]], [-8000, [20, 39, 53]], [-6000, [22, 44, 58]],
  [-4000, [24, 50, 64]], [-2500, [26, 55, 68]], [-1500, [29, 61, 72]],
  [-800, [32, 64, 76]], [-200, [39, 68, 82]], [-50, [48, 85, 91]], [0, [57, 96, 101]]
];
const LAND_COLOR_STOPS = [
  [0, [88, 108, 69]], [180, [98, 113, 70]], [400, [111, 119, 73]],
  [700, [124, 124, 76]], [1000, [132, 128, 77]], [1300, [141, 130, 84]],
  [1600, [149, 134, 96]], [2000, [157, 143, 122]], [2300, [169, 158, 140]],
  [2600, [180, 174, 160]], [2800, [187, 185, 174]], [3000, [194, 194, 186]],
  [3400, [213, 216, 210]], [4000, [236, 239, 238]], [5000, [250, 251, 252]]
];
const LANDFORM_TINTS = {
  mountains: [164, 153, 140], plateaus: [183, 158, 121],
  valleys: [91, 116, 80], plains: [137, 151, 103], hills: [163, 143, 113]
};
const MOUNTAIN_ELEVATION_TINT = [190, 181, 169];

// Signature climatique latitudinale volontairement prudente : faute de couche
// de précipitations/occupation des sols, elle ne prétend pas distinguer forêts,
// savanes et déserts à l'échelle locale.
const VEGETATION_ZONE_TINTS = {
  tropical: [76, 112, 62],
  subtropical: [151, 132, 83],
  temperate: [94, 124, 73],
  boreal: [72, 99, 72],
  tundra: [139, 133, 111],
  alpine: [153, 145, 132],
  nival: [190, 188, 180]
};

export function createTerrainGrid(buffer, width = 2160, height = 1080) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) throw new TypeError("Tampon binaire requis.");
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || bytes.byteLength !== width * height * 2) throw new RangeError("Dimensions ou taille du raster ETOPO invalides.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Int16Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  let min = Infinity, max = -Infinity;
  for (const value of values) { if (value < min) min = value; if (value > max) max = value; }
  const isEtopo10m = width === 2160 && height === 1080;
  const longitudeSpacingDegrees = isEtopo10m ? 1 / 6 : 360 / width;
  const latitudeSpacingDegrees = isEtopo10m ? 1 / 6 : 180 / height;
  return {
    width, height, values, min, max,
    // ETOPO 2022 décimé : coordonnées exactes des centres de pixels
    // déclarées dans data/terrain/etopo_global_10m.json. Les grilles
    // synthétiques utilisent, elles, des cellules régulières couvrant le monde.
    longitudeFirst: isEtopo10m ? -179.99166666666667 : -180 + longitudeSpacingDegrees / 2,
    latitudeFirst: isEtopo10m ? 89.84166666666667 : 90 - latitudeSpacingDegrees / 2,
    longitudeSpacingDegrees,
    latitudeSpacingDegrees,
    spacingDegrees: 1 / 6
  };
}

const snapTerrainFraction = value => {
  const nearest = Math.round(value * 1e12) / 1e12;
  return Math.abs(value - nearest) < 1e-12 ? nearest : value;
};

function terrainGridCoordinates(grid, longitude, latitude) {
  const fallbackSpacing = Number(grid.spacingDegrees) || (180 / grid.height);
  const longitudeSpacing = Number(grid.longitudeSpacingDegrees) || fallbackSpacing;
  const latitudeSpacing = Number(grid.latitudeSpacingDegrees) || fallbackSpacing;
  const longitudeFirst = Number.isFinite(grid.longitudeFirst) ? grid.longitudeFirst : -180 + longitudeSpacing / 2;
  const latitudeFirst = Number.isFinite(grid.latitudeFirst) ? grid.latitudeFirst : 90 - latitudeSpacing / 2;
  const longitudeDelta = longitude - longitudeFirst;
  // Éviter le modulo (et ses additions à 360°) dans le cas courant :
  // ces opérations ajoutent une erreur flottante inutile aux demi-cellules.
  const wrappedDelta = longitudeDelta >= 0 && longitudeDelta < 360
    ? longitudeDelta
    : ((longitudeDelta % 360) + 360) % 360;
  let x = wrappedDelta / longitudeSpacing;
  let y = clamp((latitudeFirst - latitude) / latitudeSpacing, 0, grid.height - 1);
  // Les centres de pixels calculés depuis des coordonnées décimales peuvent
  // tomber à quelques ulp d'un entier. Les recaler évite une interpolation
  // parasite entre deux échantillons qui devraient être exactement confondus.
  const nearestX = Math.round(x), nearestY = Math.round(y);
  if (Math.abs(x - nearestX) < 1e-10) x = nearestX;
  if (Math.abs(y - nearestY) < 1e-10) y = nearestY;
  return { x, y };
}

export function terrainSnowElevationForPixel(grid, longitude, latitude, pixelWidthDegrees, pixelHeightDegrees = pixelWidthDegrees) {
  const centerElevation = sampleElevation(grid, longitude, latitude);
  if (centerElevation === null || centerElevation < 0
    || !Number.isFinite(pixelWidthDegrees) || pixelWidthDegrees <= 0
    || !Number.isFinite(pixelHeightDegrees) || pixelHeightDegrees <= 0) return centerElevation;

  // Les calottes permanentes ont une signature géographique distincte des pics :
  // elles couvrent de grandes surfaces et leur altitude est souvent inférieure
  // au seuil hypsométrique de la neige alpine.
  const normalizedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const onGreenlandIceSheet = latitude >= 60 && latitude <= 84
    && normalizedLongitude >= -75 && normalizedLongitude <= -10
    && centerElevation >= 1500;
  const onAntarcticIceSheet = latitude <= -70 && centerElevation >= 1500;
  if (onGreenlandIceSheet || onAntarcticIceSheet) return Math.max(centerElevation, 5000);

  // La neige des sommets est renforcée uniquement lorsqu'un pic élevé
  // est présent dans l'emprise du pixel et dépasse nettement son altitude centrale.
  const peakThreshold = 4000;
  const prominenceThreshold = 800;
  const longitudeSpacing = Number(grid.longitudeSpacingDegrees) || Number(grid.spacingDegrees) || 180 / grid.height;
  const latitudeSpacing = Number(grid.latitudeSpacingDegrees) || Number(grid.spacingDegrees) || 180 / grid.height;
  const longitudeFirst = Number.isFinite(grid.longitudeFirst) ? grid.longitudeFirst : -180 + longitudeSpacing / 2;
  const latitudeFirst = Number.isFinite(grid.latitudeFirst) ? grid.latitudeFirst : 90 - latitudeSpacing / 2;
  const west = longitude - pixelWidthDegrees / 2;
  const east = longitude + pixelWidthDegrees / 2;
  const north = Math.min(90, latitude + pixelHeightDegrees / 2);
  const south = Math.max(-90, latitude - pixelHeightDegrees / 2);
  const epsilon = 1e-9;
  const firstColumn = Math.ceil((west - longitudeFirst) / longitudeSpacing - epsilon);
  const lastColumn = Math.floor((east - longitudeFirst) / longitudeSpacing + epsilon);
  const firstRow = Math.max(0, Math.ceil((latitudeFirst - north) / latitudeSpacing - epsilon));
  const lastRow = Math.min(grid.height - 1, Math.floor((latitudeFirst - south) / latitudeSpacing + epsilon));
  let peakElevation = centerElevation;

  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const wrappedColumn = ((column % grid.width) + grid.width) % grid.width;
      const value = grid.values[row * grid.width + wrappedColumn];
      if (Number.isFinite(value) && value > peakElevation) peakElevation = value;
    }
  }

  return peakElevation >= peakThreshold && peakElevation - centerElevation >= prominenceThreshold
    ? peakElevation
    : centerElevation;
}

export function sampleElevation(grid, longitude, latitude) {
  if (!grid?.values || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const { x, y } = terrainGridCoordinates(grid, longitude, latitude);
  const rawX = Math.floor(x), x0 = ((rawX % grid.width) + grid.width) % grid.width, x1 = (x0 + 1) % grid.width;
  const y0 = Math.floor(y), y1 = Math.min(grid.height - 1, y0 + 1), fx = x - rawX, fy = y - y0;
  // Stabiliser les fractions proches des valeurs simples (0, 1/2, 1).
  // Les coordonnées ETOPO décimales peuvent sinon décaler une demi-cellule
  // de quelques ULP et produire une altitude artificiellement imprécise.
  const sampleX = snapTerrainFraction(fx), sampleY = snapTerrainFraction(fy);
  const row0 = y0 * grid.width, row1 = y1 * grid.width;
  const v00 = grid.values[row0 + x0], v10 = grid.values[row0 + x1];
  const v01 = grid.values[row1 + x0], v11 = grid.values[row1 + x1];
  const a = v00 + (v10 - v00) * sampleX;
  const b = v01 + (v11 - v01) * sampleX;
  return a + (b - a) * sampleY;
}

function interpolateStops(value, stops) {
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [low, a] = stops[i - 1], [high, b] = stops[i];
      const t = clamp((value - low) / (high - low), 0, 1);
      const smooth = t * t * (3 - 2 * t);
      return [
        Math.round(a[0] + (b[0] - a[0]) * smooth),
        Math.round(a[1] + (b[1] - a[1]) * smooth),
        Math.round(a[2] + (b[2] - a[2]) * smooth)
      ];
    }
  }
  const last = stops[stops.length - 1][1];
  return [last[0], last[1], last[2]];
}

export function classifyLandform(elevation, west, east, north, south, latitude, cellSizeDegrees = 1 / 6) {
  if (![elevation, west, east, north, south, latitude, cellSizeDegrees].every(Number.isFinite) || cellSizeDegrees <= 0) return "lowlands";
  if (elevation < 0) return "ocean";
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = (east - west) / (2 * cellWidth);
  const slopeNorth = (north - south) / (2 * cellHeight);
  const slope = Math.hypot(slopeEast, slopeNorth);
  const neighbourMean = (west + east + north + south) / 4;
  const relativeHeight = elevation - neighbourMean;

  // Classes heuristiques dérivées du MNT : elles décrivent la forme locale,
  // pas une cartographie géomorphologique scientifique indépendante.
  // Les chaînes de moyenne altitude sont reconnues par leur pente et leur
  // altitude combinées ; le seuil évite de classer chaque colline en montagne.
  if (elevation >= 1100 && slope >= 0.06) return "mountains";
  if (elevation >= 700 && slope < 0.065) return "plateaus";
  if (relativeHeight <= -90 && elevation < 1800) return "valleys";
  if (slope < 0.025 && elevation < 450) return "plains";
  if (slope >= 0.055 || elevation >= 1200) return "hills";
  return "lowlands";
}

export function classifyVegetationZone(elevation, latitude) {
  if (!Number.isFinite(elevation) || !Number.isFinite(latitude) || elevation < 0 || Math.abs(latitude) > 90) return "none";
  const absoluteLatitude = Math.abs(latitude);
  if (elevation >= 4600 || (absoluteLatitude >= 78 && elevation >= 900)) return "nival";
  if (elevation >= 3000) return "alpine";
  if (absoluteLatitude >= 66) return "tundra";
  if (absoluteLatitude >= 52) return "boreal";
  if (absoluteLatitude >= 35) return "temperate";
  if (absoluteLatitude >= 23.5) return "subtropical";
  return "tropical";
}

export function applyVegetationZoneTint(color, zone) {
  const tint = VEGETATION_ZONE_TINTS[zone];
  if (!tint || !Array.isArray(color) || color.length < 3) return color;
  const strength = ({
    tropical: 0.085, subtropical: 0.065, temperate: 0.078,
    boreal: 0.082, tundra: 0.06, alpine: 0.04, nival: 0.035
  })[zone] ?? 0.055;
  const inverse = 1 - strength;
  return [
    Math.round(color[0] * inverse + tint[0] * strength),
    Math.round(color[1] * inverse + tint[1] * strength),
    Math.round(color[2] * inverse + tint[2] * strength)
  ];
}

export function applyLandformTint(color, landform, elevation = 0) {
  const tint = LANDFORM_TINTS[landform];
  if (!tint || !Array.isArray(color) || color.length < 3) return color;
  // Les montagnes gagnent une matière minérale progressivement plus marquée
  // avec l'altitude, sans transformer les sommets en aplats blancs.
  const mountainStrength = landform === "mountains"
    ? 0.09 + clamp((Number(elevation) - 1100) / 3900, 0, 1) * 0.10
    : 0;
  // Renforcer les signatures de terrain sans créer de frontières artificielles :
  // le mélange reste continu et ne touche ni l'altitude ni la classification.
  const strength = mountainStrength || ({
    plateaus: 0.085, valleys: 0.07, plains: 0.045, hills: 0.09
  }[landform] ?? 0.045);
  const target = landform === "mountains" && elevation >= 2800
    ? MOUNTAIN_ELEVATION_TINT : tint;
  const inverse = 1 - strength;
  return [
    Math.round(color[0] * inverse + target[0] * strength),
    Math.round(color[1] * inverse + target[1] * strength),
    Math.round(color[2] * inverse + target[2] * strength)
  ];
}


function terrainDebugElevationColor(elevation) {
  const value = elevation < 0
    ? 128 + clamp(elevation / 11000, -1, 0) * 128
    : 128 + clamp(elevation / 6734, 0, 1) * 127;
  const channel = Math.round(value);
  return [channel, channel, channel];
}

export function terrainColorForElevation(elevation, shade = 1, landform = "lowlands", latitude = 0) {
  if (elevation < 0) {
    // Mer volontairement sobre : grandes masses bathymétriques, sans ombrage
    // local des fosses/dorsales qui surchargerait la lecture stratégique.
    const sea = interpolateStops(elevation, SEA_COLOR_STOPS);
    const restrainedShade = clamp(1 + (shade - 1) * 0.12, 0.98, 1.02);
    return [
      Math.round(clamp(sea[0] * restrainedShade, 0, 255)),
      Math.round(clamp(sea[1] * restrainedShade, 0, 255)),
      Math.round(clamp(sea[2] * restrainedShade, 0, 255))
    ];
  }

  const land = interpolateStops(elevation, LAND_COLOR_STOPS);
  const landformColor = applyLandformTint([
    Math.round(clamp(land[0] * shade, 0, 255)),
    Math.round(clamp(land[1] * shade, 0, 255)),
    Math.round(clamp(land[2] * shade, 0, 255))
  ], landform, elevation);
  return applyVegetationZoneTint(landformColor, classifyVegetationZone(elevation, latitude));
}

export function calculateHillshade(west, east, north, south, latitude, cellSizeDegrees = 1 / 6, exaggeration = RELIEF_EXAGGERATION) {
  if (![west, east, north, south, latitude, cellSizeDegrees, exaggeration].every(Number.isFinite) || cellSizeDegrees <= 0 || exaggeration < 0) return 1;
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = exaggeration * (east - west) / (2 * cellWidth);
  const slopeNorth = exaggeration * (north - south) / (2 * cellHeight);
  const normalLength = Math.hypot(slopeEast, slopeNorth, 1);
  const normalEast = -slopeEast / normalLength;
  const normalNorth = -slopeNorth / normalLength;
  const normalUp = 1 / normalLength;
  // Éclairage cohérent dominé par le nord-ouest : les versants est-ouest
  // gardent un contraste perceptible au lieu d'être annulés par quatre sources.
  const lights = [
    { azimuth: 315, altitude: 35, weight: 0.8 },
    { azimuth: 45, altitude: 55, weight: 0.2 }
  ];
  let lit = 0, flat = 0;
  for (const light of lights) {
    const az = light.azimuth * Math.PI / 180;
    const alt = light.altitude * Math.PI / 180;
    const eastLight = Math.cos(alt) * Math.sin(az);
    const northLight = Math.cos(alt) * Math.cos(az);
    const upLight = Math.sin(alt);
    lit += Math.max(0, normalEast * eastLight + normalNorth * northLight + normalUp * upLight) * light.weight;
    flat += upLight * light.weight;
  }
  const steepness = Math.min(1, Math.hypot(slopeEast, slopeNorth));
  return clamp(1 + (lit - flat) * 1.35 - steepness * 0.10, 0.52, 1.48);
}

export function visibleTileRevisionSignature(viewport = {}, revisions = {}) {
  const zoom = Math.max(1, Number(viewport.zoom ?? 1));
  const centerLon = Number(viewport.centerLongitude ?? 0);
  const centerLat = Number(viewport.centerLatitude ?? 0);
  const lonSpan = Math.min(360, 360 / zoom);
  const latSpan = Math.min(180, 180 / zoom);
  const west = centerLon - lonSpan / 2, east = centerLon + lonSpan / 2;
  const south = Math.max(-90, centerLat - latSpan / 2);
  const north = Math.min(90, centerLat + latSpan / 2);
  const xStart = Math.floor((west + 180) / 10);
  const xEnd = Math.floor((east + 180) / 10);
  const yStart = Math.max(0, Math.floor((south + 90) / 10));
  const yEnd = Math.min(17, Math.floor((north + 90) / 10));
  const entries = [];
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const wrappedX = ((x % 36) + 36) % 36;
      const key = wrappedX + ":" + y;
      entries.push(key + "=" + Number(revisions[key] ?? 0));
    }
  }
  return entries.sort().join(",");
}

const hillshadeGridCache = new WeakMap();
export function isTerrainHillshadePrepared(grid) {
 return hillshadeGridCache.get(grid) instanceof Uint8Array;
}
export function prepareTerrainHillshade(grid) {
 if(!grid?.values)return Promise.resolve(false);
 const existing=hillshadeGridCache.get(grid);if(existing)return existing;
 if(typeof Worker==="undefined")return Promise.resolve(false);
 const task=new Promise(resolve=>{let worker;try{
  worker=new Worker(new URL("./terrain-worker.js",import.meta.url),{type:"module"});
  const values=grid.values.slice();
  worker.onmessage=event=>{if(event.data?.ok&&event.data.width===grid.width&&event.data.height===grid.height){hillshadeGridCache.set(grid,event.data.shades);resolve(true);}else resolve(false);worker.terminate();};
  worker.onerror=()=>{worker.terminate();resolve(false);};
  worker.postMessage({width:grid.width,height:grid.height,values:values.buffer},[values.buffer]);
 }catch{worker?.terminate?.();resolve(false);}});
 hillshadeGridCache.set(grid,task);return task;
}
function samplePreparedHillshade(grid,longitude,latitude){
 const shades=hillshadeGridCache.get(grid);if(!(shades instanceof Uint8Array))return null;
 const {x,y}=terrainGridCoordinates(grid,longitude,latitude);
 const rawX=Math.floor(x),x0=((rawX%grid.width)+grid.width)%grid.width,x1=(x0+1)%grid.width,y0=Math.floor(y),y1=Math.min(grid.height-1,y0+1),fx=x-rawX,fy=y-y0;
 const row0=y0*grid.width,row1=y1*grid.width;
 const a=(shades[row0+x0]/255)*(1-fx)+(shades[row0+x1]/255)*fx;
 const b=(shades[row1+x0]/255)*(1-fx)+(shades[row1+x1]/255)*fx;
 return .48+(a*(1-fy)+b*fy)*1.04;
}
const physicalLookupCache = new WeakMap();
function physicalLookup(world) {
 if(!world?.currentCells)return null;
 const old=physicalLookupCache.get(world);if(old?.revision===world.revision)return old.lookup;
 const levels=new Map();for(const c of world.currentCells)if(Number.isInteger(c.gridX)&&Number.isInteger(c.gridY)){const step=Number(c.gridStep)||12;if(!levels.has(step))levels.set(step,new Map());levels.get(step).set(c.gridY+":"+c.gridX,c);}
 const lookup={levels,steps:[...levels.keys()].sort((a,b)=>a-b)};physicalLookupCache.set(world,{revision:world.revision,lookup});return lookup;
}
function mixPhysicalField(c00,c10,c01,c11,key,fx,fy){
 const a=(Number(c00?.[key])||0)*(1-fx)+(Number(c10?.[key])||0)*fx;
 const b=(Number(c01?.[key])||0)*(1-fx)+(Number(c11?.[key])||0)*fx;
 return a*(1-fy)+b*fy;
}
export function samplePhysicalElevation(grid,lon,lat,lookup){
 const base=sampleElevation(grid,lon,lat);if(!lookup||base===null)return base;
 const {x,y}=terrainGridCoordinates(grid,lon,lat);
 if(!(lookup.levels instanceof Map)){const c=lookup.get(Math.floor(y/12)+":"+Math.floor(x/12));if(!c)return base;if(c.inundated)return -Math.max(.1,Number(c.waterDepthM)||.1);return base+(Number(c.elevationDeltaM)||0);}
 for(const step of lookup.steps??[...lookup.levels.keys()].sort((a,b)=>a-b)){
  const level=lookup.levels.get(step);if(!level)continue;
  const gx=x/step-.5,gy=y/step-.5,x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,nx=Math.ceil(grid.width/step);
  const row0=Math.max(0,y0),row1=Math.max(0,y0+1);
  const col0=((x0%nx)+nx)%nx,col1=((x0+1)%nx+nx)%nx;
  const c00=level.get(row0+":"+col0),c10=level.get(row0+":"+col1);
  const c01=level.get(row1+":"+col0),c11=level.get(row1+":"+col1);
  if(!c00&&!c10&&!c01&&!c11)continue;
  const flood=mixPhysicalField(c00,c10,c01,c11,"tsunamiWaterDepthM",fx,fy);
  if(flood>.01)return -Math.max(.1,flood);
  return base+mixPhysicalField(c00,c10,c01,c11,"elevationDeltaM",fx,fy);
 }
 return base;
}

export function terrainTileSizeForZoom(zoom = 1, quality = 1) {
 const level=Math.max(1,Number(zoom)||1),qualityScale=clamp(Number(quality)||1,.25,1);
 // À petite échelle, 32 px suffisent ; les niveaux régionaux utilisent 64/96 px.
 const base=level<2.5?32:level<8?64:96;
 return Math.max(24,Math.min(128,Math.round(base*qualityScale)));
}

const terrainTileCache = new WeakMap();
const TERRAIN_TILE_CACHE_LIMIT = 1600;
const TERRAIN_TILE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
function drawTerrainTileRaster(context,width,height,grid,viewport,quality,landOnly,physicalWorld,changedOnly,hillshadeOnly){
 const zoom=Math.max(1,Number(viewport.zoom??1)),cx=Number(viewport.centerLongitude??0),cy=Number(viewport.centerLatitude??0);
 const tileSize=terrainTileSizeForZoom(zoom,quality);
 const pixelDegrees=10/tileSize;
 const dx=360/grid.width,dy=180/grid.height,hasPhysicalChanges=Number(physicalWorld?.revision??0)>0,physical=hasPhysicalChanges?physicalLookup(physicalWorld):null;
 let cache=terrainTileCache.get(grid);if(!cache){cache=new Map();terrainTileCache.set(grid,cache);}
 const revisions=physicalWorld?.tileRevisions;
 let hasLocalRevisions=false;
 if(revisions){for(const key in revisions){if(Object.hasOwn(revisions,key)){hasLocalRevisions=true;break;}}}
 const disablePrecomputed=globalThis.__TERRA_DISABLE_PRECOMPUTED_HILLSHADE===true;
 const disableSmoothing=globalThis.__TERRA_DISABLE_TERRAIN_SMOOTHING===true;
 const debugElevation=globalThis.__TERRA_DEBUG_TERRAIN_ELEVATION===true;
 const precomputed=hillshadeGridCache.get(grid) instanceof Uint8Array && !disablePrecomputed;
 let drawn=false;
 for(let ty=0;ty<18;ty++){
  const north=90-ty*10,south=north-10,screenY=height/2-(north-cy)*height*zoom/180,destH=10*height*zoom/180;
  if(screenY+destH<0||screenY>height)continue;
  for(let tx=0;tx<36;tx++){
   const west=-180+tx*10,center=west+5,shift=360*Math.round((cx-center)/360),screenX=width/2+(west+shift-cx)*width*zoom/360,destW=10*width*zoom/360;
   if(screenX+destW<0||screenX>width)continue;
   const tileKey=tx+":"+ty,revision=hasLocalRevisions?Number(revisions[tileKey]??0):Number(physicalWorld?.revision??0);
    const key=tileKey+"|"+tileSize+"|"+revision+"|"+(landOnly?"land":"full")+"|"+(changedOnly?"changed":"all")+"|"+(hillshadeOnly?"shade":"color")+"|"+(precomputed?"worker":"sync")+"|"+(disablePrecomputed?"no-precomputed":"prepared")+"|"+(disableSmoothing?"nearest":"smooth")+"|"+(debugElevation?"elevation-debug":"styled");
   let surface=cache.get(key);
   if(!surface){
    surface=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(tileSize,tileSize):document.createElement("canvas");
    surface.width=tileSize;surface.height=tileSize;
    const tileContext=surface.getContext("2d"),image=tileContext.createImageData(tileSize,tileSize),pixels=image.data;
    for(let py=0;py<tileSize;py++){
     const lat=north-(py+.5)/tileSize*10;
     for(let px=0;px<tileSize;px++){
      const lon=west+(px+.5)/tileSize*10,base=sampleElevation(grid,lon,lat),e=hasPhysicalChanges?samplePhysicalElevation(grid,lon,lat,physical):base,snowElevation=zoom<2.5?terrainSnowElevationForPixel(grid,lon,lat,pixelDegrees):e,index=(py*tileSize+px)*4;
      const changedCoast=changedOnly&&base!==null&&((base>=0)!==(e>=0));
      if((changedOnly&&!changedCoast)||(landOnly&&e<0)){pixels[index+3]=0;continue;}
      let color;
      if(e>=0){
       // Avant la fin du pré-calcul Worker, afficher un relief hypsométrique simple
       // plutôt que bloquer le thread principal avec des millions de hillshades.
       if(precomputed){
        const w=hasPhysicalChanges?samplePhysicalElevation(grid,lon-dx,lat,physical):sampleElevation(grid,lon-dx,lat);
        const east=hasPhysicalChanges?samplePhysicalElevation(grid,lon+dx,lat,physical):sampleElevation(grid,lon+dx,lat);
        const n=hasPhysicalChanges?samplePhysicalElevation(grid,lon,lat+dy,physical):sampleElevation(grid,lon,lat+dy);
        const southE=hasPhysicalChanges?samplePhysicalElevation(grid,lon,lat-dy,physical):sampleElevation(grid,lon,lat-dy);
        const shade=samplePreparedHillshade(grid,lon,lat)??1;
        if(hillshadeOnly){const relief=clamp((shade-.48)/1.04,0,1),gray=Math.round(28+relief*214);color=[gray,gray,gray];}
        else { const baseShade=1+(shade-1)*0.35; color=terrainColorForElevation(snowElevation,baseShade,classifyLandform(e,w??e,east??e,n??e,southE??e,lat,dx),lat); }
       }else{
        const w=hasPhysicalChanges?samplePhysicalElevation(grid,lon-dx,lat,physical):sampleElevation(grid,lon-dx,lat);
        const east=hasPhysicalChanges?samplePhysicalElevation(grid,lon+dx,lat,physical):sampleElevation(grid,lon+dx,lat);
        const n=hasPhysicalChanges?samplePhysicalElevation(grid,lon,lat+dy,physical):sampleElevation(grid,lon,lat+dy);
        const southE=hasPhysicalChanges?samplePhysicalElevation(grid,lon,lat-dy,physical):sampleElevation(grid,lon,lat-dy);
        const shade=calculateHillshade(w??e,east??e,n??e,southE??e,lat,dx);
        if(hillshadeOnly){const relief=clamp((shade-.48)/1.04,0,1),gray=Math.round(28+relief*214);color=[gray,gray,gray];}
        else {const baseShade=1+(shade-1)*0.35;color=terrainColorForElevation(snowElevation,baseShade,classifyLandform(e,w??e,east??e,n??e,southE??e,lat,dx),lat);}
       }
      }else color=terrainColorForElevation(e,1,"ocean");
      if(debugElevation) color=terrainDebugElevationColor(e);
      pixels[index]=color[0];pixels[index+1]=color[1];pixels[index+2]=color[2];pixels[index+3]=255;
     }
    }
    tileContext.putImageData(image,0,0);
    const surfaceBytes=tileSize*tileSize*4;
    cache.set(key,surface);
    cache.bytes=(cache.bytes??0)+surfaceBytes;
    while(cache.size>TERRAIN_TILE_CACHE_LIMIT||cache.bytes>TERRAIN_TILE_CACHE_MAX_BYTES){
     const oldestKey=cache.keys().next().value,oldest=cache.get(oldestKey);
     cache.delete(oldestKey);
     cache.bytes-=Math.max(0,(oldest?.width??0)*(oldest?.height??0)*4);
    }
   }else{cache.delete(key);cache.set(key,surface);}
   context.save?.();
   context.imageSmoothingEnabled = !disableSmoothing;
   context.drawImage(surface,screenX,screenY,destW,destH);
   context.restore?.();drawn=true;
  }
 }
 return drawn;
}

// Diagnostic ponctuel : analyse les pixels du canvas de relief réellement rendu.
let lastTerrainDiagnosticCanvas = null;
if (typeof window !== "undefined") {
  window.getTerrainCanvasDiagnostics = () => {
    const canvas = window.__TERRA_TERRAIN_DIAGNOSTIC_CANVAS ?? lastTerrainDiagnosticCanvas;
    if (!canvas) return { error: "Canvas de relief non capturé : attendre un rendu de la carte." };
    const context = canvas.getContext?.("2d", { willReadFrequently: true });
    if (!context) return { error: "Contexte 2D du canvas indisponible." };
    const { width, height } = canvas;
    let image;
    try { image = context.getImageData(0, 0, width, height).data; }
    catch (error) { return { error: "Lecture des pixels impossible : " + error.message }; }
    const rowMeans = [], rowStdDevs = [], rowAlpha = [];
    const columnMeans = [];
    for (let y = 0; y < height; y++) {
      let sum = 0, sum2 = 0, alpha = 0, count = 0;
      const step = Math.max(1, Math.floor(width / 512));
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const a = image[i + 3] / 255;
        const v = (image[i] * .2126 + image[i + 1] * .7152 + image[i + 2] * .0722) * a;
        sum += v; sum2 += v * v; alpha += a; count++;
      }
      const mean = count ? sum / count : 0;
      rowMeans.push(Number(mean.toFixed(2)));
      rowStdDevs.push(Number(Math.sqrt(Math.max(0, sum2 / Math.max(1,count) - mean * mean)).toFixed(2)));
      rowAlpha.push(Number((alpha / Math.max(1,count)).toFixed(3)));
    }
    const colStep = Math.max(1, Math.floor(height / 256));
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 512))) {
      let sum = 0, count = 0;
      for (let y = 0; y < height; y += colStep) {
        const i = (y * width + x) * 4;
        sum += (image[i] * .2126 + image[i + 1] * .7152 + image[i + 2] * .0722) * image[i + 3] / 255;
        count++;
      }
      columnMeans.push(Number((sum / Math.max(1,count)).toFixed(2)));
    }
    const jumps = values => values.slice(1).map((v,i)=>({index:i+1,delta:Number((v-values[i]).toFixed(2))}))
      .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,20);
    return {
      width, height, rowMeans, rowStdDevs, rowAlpha,
      largestRowJumps: jumps(rowMeans),
      columnMeans,
      largestColumnJumps: jumps(columnMeans),
      sampledAt: new Date().toISOString()
    };
  };
}

const terrainSurfaceCache = new WeakMap();
const TERRAIN_SURFACES_PER_GRID = 6;

export function drawTerrainRaster(context, width, height, grid, viewport = {}, quality = 1, landOnly = false, physicalWorld = null, changedOnly = false, hillshadeOnly = false) {
  if (typeof window !== "undefined" && context?.canvas) lastTerrainDiagnosticCanvas = context.canvas;
  if (!context?.createImageData || !context?.putImageData || !grid?.values) return false;
  if (globalThis.__TERRA_DISABLE_TERRAIN_RASTER_TILES !== true
    && typeof context.drawImage === "function" && (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined")) {
    return drawTerrainTileRaster(context,width,height,grid,viewport,quality,landOnly,physicalWorld,changedOnly,hillshadeOnly);
  }
  // Raster compact : l'ombrage multidirectionnel donne le détail, pas une haute résolution brute.
  const qualityScale = clamp(Number(quality) || 1, 0.25, 1);
  const scale = Math.min(1, (1024 * qualityScale) / width, (512 * qualityScale) / height);
  const renderWidth = Math.max(1, Math.round(width * scale));
  const renderHeight = Math.max(1, Math.round(height * scale));
  const zoomKey = Number(viewport.zoom ?? 1).toFixed(4);
  const centerXKey = ((((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360) - 180).toFixed(4);
  const centerYKey = Number(viewport.centerLatitude ?? 0).toFixed(4);
  const cacheKey = [renderWidth, renderHeight, zoomKey, centerXKey, centerYKey, qualityScale, landOnly ? "land" : "full", String(changedOnly), hillshadeOnly ? "hillshade" : "color", (hillshadeGridCache.get(grid) instanceof Uint8Array && globalThis.__TERRA_DISABLE_PRECOMPUTED_HILLSHADE !== true) ? "precomputed" : "on-demand", globalThis.__TERRA_DISABLE_PRECOMPUTED_HILLSHADE===true ? "no-precomputed" : "prepared", globalThis.__TERRA_DISABLE_TERRAIN_SMOOTHING===true?"nearest":"smooth",globalThis.__TERRA_DEBUG_TERRAIN_ELEVATION===true?"elevation-debug":"styled", visibleTileRevisionSignature(viewport, physicalWorld?.tileRevisions ?? {})].join(":");
  let cachedSurfaces = terrainSurfaceCache.get(grid);
  if (!cachedSurfaces) {
    cachedSurfaces = new Map();
    terrainSurfaceCache.set(grid, cachedSurfaces);
  }
  const cachedSurface = cachedSurfaces.get(cacheKey);
  if (cachedSurface && context.drawImage) {
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = globalThis.__TERRA_DISABLE_TERRAIN_SMOOTHING !== true;
    context.drawImage(cachedSurface, 0, 0, context.canvas?.width ?? width, context.canvas?.height ?? height);
    context.restore?.();
    return true;
  }
  let renderContext = context;
  let surface = null;
  if (context.drawImage && typeof OffscreenCanvas !== "undefined") {
    surface = new OffscreenCanvas(renderWidth, renderHeight);
    renderContext = surface.getContext("2d");
  } else if (context.drawImage && typeof document !== "undefined") {
    surface = document.createElement("canvas");
    surface.width = renderWidth;
    surface.height = renderHeight;
    renderContext = surface.getContext("2d");
  }
  if (!renderContext?.createImageData || !renderContext?.putImageData) return false;
  const image = renderContext.createImageData(renderWidth, renderHeight), pixels = image.data;
  const zoom = Number(viewport.zoom ?? 1), cx = Number(viewport.centerLongitude ?? 0), cy = Number(viewport.centerLatitude ?? 0), physical = physicalLookup(physicalWorld);
  const dx = 360 / grid.width, dy = 180 / grid.height;
  const pixelWidthDegrees = 360 / (zoom * renderWidth), pixelHeightDegrees = 180 / (zoom * renderHeight);
  for (let py = 0; py < renderHeight; py++) {
    const lat = cy - ((py + 0.5) / renderHeight - 0.5) * 180 / zoom;
    for (let px = 0; px < renderWidth; px++) {
      const lon = cx + ((px + 0.5) / renderWidth - 0.5) * 360 / zoom;
      const e = samplePhysicalElevation(grid, lon, lat, physical);
      const baseElevation = sampleElevation(grid,lon,lat);
      const changedCoast = changedOnly && baseElevation !== null && ((baseElevation >= 0) !== (e >= 0));
      if(changedOnly && !changedCoast) { const i=(py*renderWidth+px)*4;pixels[i+3]=0;continue; }
      // Les océans n'effectuent pas les quatre échantillonnages voisins :
      // leur palette reste calme et évite de dessiner chaque fosse/dorsale.
      let shade = 1;
      if (e >= 0) {
        const west = samplePhysicalElevation(grid, lon - dx, lat, physical), east = samplePhysicalElevation(grid, lon + dx, lat, physical);
        const north = samplePhysicalElevation(grid, lon, lat + dy, physical), south = samplePhysicalElevation(grid, lon, lat - dy, physical);
        shade = samplePreparedHillshade(grid, lon, lat) ?? calculateHillshade(west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const landform = classifyLandform(e, west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const relief = clamp((shade - 0.48) / (1.52 - 0.48), 0, 1);
        const gray = Math.round(28 + relief * 214);
        const baseShade = 1 + (shade - 1) * 0.35;
        const snowElevation = zoom < 2.5 ? terrainSnowElevationForPixel(grid, lon, lat, pixelWidthDegrees, pixelHeightDegrees) : e;
        const color = globalThis.__TERRA_DEBUG_TERRAIN_ELEVATION===true ? terrainDebugElevationColor(e) : (hillshadeOnly ? [gray, gray, gray] : terrainColorForElevation(snowElevation, baseShade, landform, lat));
        const i = (py * renderWidth + px) * 4;
        pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
        continue;
      }
      const color = globalThis.__TERRA_DEBUG_TERRAIN_ELEVATION===true ? terrainDebugElevationColor(e) : terrainColorForElevation(e, shade, "ocean"), i = (py * renderWidth + px) * 4;
      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = (landOnly && !changedOnly) ? 0 : 255;
    }
  }
  renderContext.putImageData(image, 0, 0);
  if (surface && typeof context.drawImage === "function") {
    cachedSurfaces.set(cacheKey, surface);
    while (cachedSurfaces.size > TERRAIN_SURFACES_PER_GRID) cachedSurfaces.delete(cachedSurfaces.keys().next().value);
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(surface, 0, 0, context.canvas?.width ?? width, context.canvas?.height ?? height);
    context.restore?.();
  } else if (renderContext === context) {
    // Fallback DOM-less pour les tests et les contextes Canvas minimaux.
  } else {
    return false;
  }
  return true;
}
