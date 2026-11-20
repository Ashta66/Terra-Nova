const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function createTerrainGrid(buffer, width = 2160, height = 1080) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) throw new TypeError("Tampon binaire requis.");
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || bytes.byteLength !== width * height * 2) throw new RangeError("Dimensions ou taille du raster ETOPO invalides.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Int16Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  let min = Infinity, max = -Infinity;
  for (const value of values) { if (value < min) min = value; if (value > max) max = value; }
  return { width, height, values, min, max };
}

export function sampleElevation(grid, longitude, latitude) {
  if (!grid?.values || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const lon = ((longitude + 180) % 360 + 360) % 360;
  const x = lon / 360 * grid.width - 0.5;
  const y = clamp((90 - latitude) / 180 * grid.height - 0.5, 0, grid.height - 1);
  const rawX = Math.floor(x), x0 = ((rawX % grid.width) + grid.width) % grid.width, x1 = (x0 + 1) % grid.width;
  const y0 = Math.floor(y), y1 = Math.min(grid.height - 1, y0 + 1), fx = x - rawX, fy = y - y0;
  const at = (column, row) => grid.values[row * grid.width + column];
  const a = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const b = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return a * (1 - fy) + b * fy;
}

function interpolateStops(value, stops) {
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [low, a] = stops[i - 1], [high, b] = stops[i];
      const t = clamp((value - low) / (high - low), 0, 1);
      const smooth = t * t * (3 - 2 * t);
      return a.map((channel, index) => Math.round(channel + (b[index] - channel) * smooth));
    }
  }
  return [...stops.at(-1)[1]];
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
  if (elevation >= 1800 && slope >= 0.08) return "mountains";
  if (elevation >= 700 && slope < 0.055) return "plateaus";
  if (relativeHeight <= -90 && elevation < 1800) return "valleys";
  if (slope < 0.025 && elevation < 450) return "plains";
  if (slope >= 0.055 || elevation >= 1200) return "hills";
  return "lowlands";
}

function applyLandformTint(color, landform) {
  const tints = {
    mountains: [190, 174, 157],
    plateaus: [183, 158, 121],
    valleys: [91, 116, 80],
    plains: [137, 151, 103],
    hills: [163, 143, 113]
  };
  const tint = tints[landform];
  if (!tint) return color;
  const strength = landform === "mountains" ? 0.04 : 0.035;
  return color.map((channel, index) => Math.round(channel * (1 - strength) + tint[index] * strength));
}

export function terrainColorForElevation(elevation, shade = 1, landform = "lowlands") {
  if (elevation < 0) {
    // Mer volontairement sobre : grandes masses bathymétriques, sans ombrage
    // local des fosses/dorsales qui surchargerait la lecture stratégique.
    const sea = interpolateStops(elevation, [
      [-11000, [25, 45, 57]],
      [-4000, [27, 50, 62]],
      [-1500, [30, 57, 68]],
      [-500, [36, 68, 77]],
      [-50, [46, 80, 87]],
      [0, [55, 91, 96]]
    ]);
    const restrainedShade = clamp(1 + (shade - 1) * 0.12, 0.98, 1.02);
    return sea.map(channel => Math.round(clamp(channel * restrainedShade, 0, 255)));
  }

  const land = interpolateStops(elevation, [
    [0, [105, 126, 88]],
    [250, [119, 132, 88]],
    [1000, [139, 139, 91]],
    [2500, [158, 139, 105]],
    [4000, [179, 165, 143]],
    [6500, [224, 222, 210]]
  ]);
  return applyLandformTint(land.map(channel => Math.round(clamp(channel * shade, 0, 255))), landform);
}

export function calculateHillshade(west, east, north, south, latitude, cellSizeDegrees = 1 / 6) {
  if (![west, east, north, south, latitude, cellSizeDegrees].every(Number.isFinite) || cellSizeDegrees <= 0) return 1;
  const metersPerDegree = 111320;
  const cellWidth = metersPerDegree * Math.max(0.15, Math.cos(latitude * Math.PI / 180)) * cellSizeDegrees;
  const cellHeight = metersPerDegree * cellSizeDegrees;
  const slopeEast = (east - west) / (2 * cellWidth);
  const slopeNorth = (north - south) / (2 * cellHeight);
  const normalLength = Math.hypot(slopeEast, slopeNorth, 1);
  const normalEast = -slopeEast / normalLength;
  const normalNorth = -slopeNorth / normalLength;
  const normalUp = 1 / normalLength;
  const azimuth = 315 * Math.PI / 180;
  const altitude = 45 * Math.PI / 180;
  const lightEast = Math.cos(altitude) * Math.sin(azimuth);
  const lightNorth = Math.cos(altitude) * Math.cos(azimuth);
  const lightUp = Math.sin(altitude);
  const illumination = normalEast * lightEast + normalNorth * lightNorth + normalUp * lightUp;
  return clamp(1 + (illumination - lightUp) * 0.45, 0.84, 1.16);
}

const physicalLookupCache = new WeakMap();
function physicalLookup(world) {
 if(!world?.currentCells)return null;
 const old=physicalLookupCache.get(world);if(old?.revision===world.revision)return old.lookup;
 const levels=new Map();for(const c of world.currentCells)if(Number.isInteger(c.gridX)&&Number.isInteger(c.gridY)){const step=Number(c.gridStep)||12;if(!levels.has(step))levels.set(step,new Map());levels.get(step).set(c.gridY+":"+c.gridX,c);}
 const lookup={levels,steps:[...levels.keys()].sort((a,b)=>a-b)};physicalLookupCache.set(world,{revision:world.revision,lookup});return lookup;
}
export function samplePhysicalElevation(grid,lon,lat,lookup){
 const base=sampleElevation(grid,lon,lat);if(!lookup||base===null)return base;
 const x=(((lon+180)%360+360)%360)/360*grid.width,y=clamp((90-lat)/180*grid.height,0,grid.height-1);
 if(!(lookup.levels instanceof Map)){const c=lookup.get(Math.floor(y/12)+":"+Math.floor(x/12));if(!c)return base;if(c.inundated)return -Math.max(.1,Number(c.waterDepthM)||.1);return base+(Number(c.elevationDeltaM)||0);}
 for(const step of lookup.steps??[...lookup.levels.keys()].sort((a,b)=>a-b)){
  const level=lookup.levels.get(step);if(!level)continue;
  const gx=x/step-.5,gy=y/step-.5,x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,nx=Math.ceil(grid.width/step);
  const at=(ix,iy)=>level.get(Math.max(0,iy)+":"+(((ix%nx)+nx)%nx));
  const c00=at(x0,y0),c10=at(x0+1,y0),c01=at(x0,y0+1),c11=at(x0+1,y0+1);
  if(!c00&&!c10&&!c01&&!c11)continue;
  const mix=k=>{const a=(Number(c00?.[k])||0)*(1-fx)+(Number(c10?.[k])||0)*fx,b=(Number(c01?.[k])||0)*(1-fx)+(Number(c11?.[k])||0)*fx;return a*(1-fy)+b*fy;};
  const flood=mix("tsunamiWaterDepthM");if(flood>.01)return -Math.max(.1,flood);
  return base+mix("elevationDeltaM");
 }
 return base;
}

const terrainSurfaceCache = new WeakMap();
const TERRAIN_SURFACES_PER_GRID = 6;

export function drawTerrainRaster(context, width, height, grid, viewport = {}, quality = 1, landOnly = false, physicalWorld = null, changedOnly = false) {
  if (!context?.createImageData || !context?.putImageData || !grid?.values) return false;
  // Relief volontairement plus doux : résolution d'affichage plafonnée à 512 × 256.
  // Les grandes formes restent visibles, tandis que les micro-variations sont atténuées.
  const qualityScale = clamp(Number(quality) || 1, 0.25, 1);
  const scale = Math.min(1, (512 * qualityScale) / width, (256 * qualityScale) / height);
  const renderWidth = Math.max(1, Math.round(width * scale));
  const renderHeight = Math.max(1, Math.round(height * scale));
  const zoomKey = Number(viewport.zoom ?? 1).toFixed(4);
  const centerXKey = ((((Number(viewport.centerLongitude ?? 0) + 180) % 360 + 360) % 360) - 180).toFixed(4);
  const centerYKey = Number(viewport.centerLatitude ?? 0).toFixed(4);
  const cacheKey = [renderWidth, renderHeight, zoomKey, centerXKey, centerYKey, qualityScale, landOnly ? "land" : "full", String(changedOnly), physicalWorld?.revision ?? 0].join(":");
  let cachedSurfaces = terrainSurfaceCache.get(grid);
  if (!cachedSurfaces) {
    cachedSurfaces = new Map();
    terrainSurfaceCache.set(grid, cachedSurfaces);
  }
  const cachedSurface = cachedSurfaces.get(cacheKey);
  if (cachedSurface && context.drawImage) {
    context.save?.();
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
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
        shade = calculateHillshade(west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const landform = classifyLandform(e, west ?? e, east ?? e, north ?? e, south ?? e, lat, dx);
        const color = terrainColorForElevation(e, shade, landform);
        const i = (py * renderWidth + px) * 4;
        pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
        continue;
      }
      const color = terrainColorForElevation(e, shade, "ocean"), i = (py * renderWidth + px) * 4;
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
