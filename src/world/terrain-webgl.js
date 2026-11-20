const renderers = new WeakMap();

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_elevation;
uniform vec2 u_gridSize;
uniform vec2 u_viewCenter;
uniform float u_zoom;
varying vec2 v_uv;

float elevationAt(vec2 uv) {
  vec2 wrapped = vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0));
  vec2 pixel = wrapped * u_gridSize - 0.5;
  vec2 base = floor(pixel);
  vec2 f = fract(pixel);
  vec2 p00 = (base + 0.5) / u_gridSize;
  vec2 p10 = p00 + vec2(1.0 / u_gridSize.x, 0.0);
  vec2 p01 = p00 + vec2(0.0, 1.0 / u_gridSize.y);
  vec2 p11 = p00 + vec2(1.0 / u_gridSize.x, 1.0 / u_gridSize.y);
  p00.x = fract(p00.x); p10.x = fract(p10.x);
  p01.x = fract(p01.x); p11.x = fract(p11.x);
  vec4 sampleA = texture2D(u_elevation, p00);
  vec4 sampleB = texture2D(u_elevation, p10);
  vec4 sampleC = texture2D(u_elevation, p01);
  vec4 sampleD = texture2D(u_elevation, p11);
  float a = sampleA.r * 255.0 + sampleA.a * 65280.0;
  float b = sampleB.r * 255.0 + sampleB.a * 65280.0;
  float c = sampleC.r * 255.0 + sampleC.a * 65280.0;
  float d = sampleD.r * 255.0 + sampleD.a * 65280.0;
  a = mod(a + 32768.0, 65536.0) - 32768.0;
  b = mod(b + 32768.0, 65536.0) - 32768.0;
  c = mod(c + 32768.0, 65536.0) - 32768.0;
  d = mod(d + 32768.0, 65536.0) - 32768.0;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 ramp(float value, float low, float high, vec3 a, vec3 b) {
  float t = clamp((value - low) / (high - low), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return mix(a, b, t);
}

void main() {
  float longitude = u_viewCenter.x + (v_uv.x - 0.5) * 360.0 / u_zoom;
  float latitude = u_viewCenter.y + (v_uv.y - 0.5) * 180.0 / u_zoom;
  vec2 geo = vec2((longitude + 180.0) / 360.0, (90.0 - latitude) / 180.0);
  float e = elevationAt(geo);
  float dx = 1.0 / u_gridSize.x;
  float dy = 1.0 / u_gridSize.y;
  float west = elevationAt(geo - vec2(dx, 0.0));
  float east = elevationAt(geo + vec2(dx, 0.0));
  float north = elevationAt(geo - vec2(0.0, dy));
  float south = elevationAt(geo + vec2(0.0, dy));
  float cellWidth = 111320.0 * max(0.15, cos(radians(latitude))) * (360.0 / u_gridSize.x);
  float cellHeight = 111320.0 * (180.0 / u_gridSize.y);
  float slopeX = (east - west) / (2.0 * cellWidth);
  float slopeY = (north - south) / (2.0 * cellHeight);
  vec3 normal = normalize(vec3(-slopeX, -slopeY, 1.0));
  float azimuth = radians(315.0);
  float altitude = radians(45.0);
  vec3 light = normalize(vec3(cos(altitude) * sin(azimuth),
    cos(altitude) * cos(azimuth), sin(altitude)));
  float shade = clamp(1.0 + (dot(normal, light) - sin(altitude)) * 0.65, 0.72, 1.22);
  vec3 ocean = ramp(e, -11000.0, -4000.0, vec3(25.0,45.0,57.0)/255.0, vec3(27.0,50.0,62.0)/255.0);
  ocean = e > -4000.0 ? ramp(e, -4000.0, -1500.0, vec3(27.0,50.0,62.0)/255.0, vec3(30.0,57.0,68.0)/255.0) : ocean;
  ocean = e > -1500.0 ? ramp(e, -1500.0, -500.0, vec3(30.0,57.0,68.0)/255.0, vec3(36.0,68.0,77.0)/255.0) : ocean;
  ocean = e > -500.0 ? ramp(e, -500.0, -50.0, vec3(36.0,68.0,77.0)/255.0, vec3(46.0,80.0,87.0)/255.0) : ocean;
  ocean = e > -50.0 ? ramp(e, -50.0, 0.0, vec3(46.0,80.0,87.0)/255.0, vec3(55.0,91.0,96.0)/255.0) : ocean;
  vec3 lowland = ramp(e, 0.0, 250.0, vec3(105.0,126.0,88.0)/255.0, vec3(119.0,132.0,88.0)/255.0);
  lowland = e > 250.0 ? ramp(e, 250.0, 1000.0, vec3(119.0,132.0,88.0)/255.0, vec3(139.0,139.0,91.0)/255.0) : lowland;
  vec3 highland = ramp(e, 1000.0, 2500.0, vec3(139.0,139.0,91.0)/255.0, vec3(158.0,139.0,105.0)/255.0);
  highland = e > 2500.0 ? ramp(e, 2500.0, 4000.0, vec3(158.0,139.0,105.0)/255.0, vec3(179.0,165.0,143.0)/255.0) : highland;
  highland = e > 4000.0 ? ramp(e, 4000.0, 6500.0, vec3(179.0,165.0,143.0)/255.0, vec3(224.0,222.0,210.0)/255.0) : highland;
  vec3 color = e < 0.0 ? ocean : (e < 1000.0 ? lowland : highland);
  if (e >= 0.0) {
    float slope = length(vec2(slopeX, slopeY));
    float relativeHeight = e - (west + east + north + south) * 0.25;
    vec3 tint = vec3(0.0);
    float tintStrength = 0.0;
    if (e >= 1800.0 && slope >= 0.08) {
      tint = vec3(190.0,174.0,157.0) / 255.0;
      tintStrength = 0.075;
    } else if (e >= 700.0 && slope < 0.055) {
      tint = vec3(183.0,158.0,121.0) / 255.0;
      tintStrength = 0.065;
    } else if (relativeHeight <= -90.0 && e < 1800.0) {
      tint = vec3(91.0,116.0,80.0) / 255.0;
      tintStrength = 0.065;
    } else if (slope < 0.025 && e < 450.0) {
      tint = vec3(137.0,151.0,103.0) / 255.0;
      tintStrength = 0.065;
    } else if (slope >= 0.055 || e >= 1200.0) {
      tint = vec3(163.0,143.0,113.0) / 255.0;
      tintStrength = 0.065;
    }
    color = mix(color, tint, tintStrength);
  }
  gl_FragColor = vec4(color * (e < 0.0 ? 1.0 : shade), 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function encodeTerrainTexture(values) {
  if (!ArrayBuffer.isView(values)) throw new TypeError("Les altitudes doivent être un tableau typé.");
  const packed = new Uint8Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const value = values[i] & 0xffff;
    const offset = i * 2;
    packed[offset] = value & 255;
    packed[offset + 1] = value >>> 8;
  }
  return packed;
}

export function getTerrainTileGeoBounds(tile, tileStore) {
  if (!tile || !tileStore || !Number.isInteger(tile.level)
    || !Number.isInteger(tile.originX) || !Number.isInteger(tile.originY)
    || !Number.isInteger(tile.width) || !Number.isInteger(tile.height)
    || !Number.isInteger(tileStore.width) || !Number.isInteger(tileStore.height)) return null;
  const stride = 2 ** tile.level;
  const levelWidth = Math.ceil(tileStore.width / stride);
  const levelHeight = Math.ceil(tileStore.height / stride);
  return {
    west: -180 + tile.originX * 360 / levelWidth,
    east: -180 + (tile.originX + tile.width) * 360 / levelWidth,
    north: 90 - tile.originY * 180 / levelHeight,
    south: 90 - (tile.originY + tile.height) * 180 / levelHeight
  };
}

export function getTerrainTileScreenRects(tile, tileStore, viewport, width, height) {
  const bounds = getTerrainTileGeoBounds(tile, tileStore);
  const zoom = Number(viewport?.zoom);
  if (!bounds || !Number.isFinite(zoom) || zoom <= 0
    || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return [];
  const viewWest = Number(viewport.centerLongitude ?? 0) - 180 / zoom;
  const viewEast = Number(viewport.centerLongitude ?? 0) + 180 / zoom;
  const viewNorth = Number(viewport.centerLatitude ?? 0) + 90 / zoom;
  const viewSouth = Number(viewport.centerLatitude ?? 0) - 90 / zoom;
  const rects = [];
  for (const shift of [-360, 0, 360]) {
    const west = bounds.west + shift, east = bounds.east + shift;
    const overlapWest = Math.max(west, viewWest), overlapEast = Math.min(east, viewEast);
    const overlapNorth = Math.min(bounds.north, viewNorth), overlapSouth = Math.max(bounds.south, viewSouth);
    if (overlapEast <= overlapWest || overlapNorth <= overlapSouth) continue;
    rects.push({
      x: (overlapWest - viewWest) / (360 / zoom) * width,
      y: (viewNorth - overlapNorth) / (180 / zoom) * height,
      width: (overlapEast - overlapWest) / (360 / zoom) * width,
      height: (overlapNorth - overlapSouth) / (180 / zoom) * height,
      u0: (overlapWest - west) / (east - west),
      u1: (overlapEast - west) / (east - west),
      v0: (bounds.north - overlapNorth) / (bounds.north - bounds.south),
      v1: (bounds.north - overlapSouth) / (bounds.north - bounds.south),
      longitudeShift: shift
    });
  }
  return rects;
}

export function selectTerrainTileLevel(tileStore, viewport, renderWidth) {
  if (!tileStore || !Number.isFinite(tileStore.width) || !Number.isFinite(renderWidth)
    || renderWidth <= 0) return 0;
  const zoom = Math.max(0.0001, Number(viewport?.zoom ?? 1));
  const lod = Math.floor(Math.log2(tileStore.width / (renderWidth * zoom)));
  return Math.max(0, Math.min(4, Number.isFinite(lod) ? lod : 0));
}

export function collectTerrainViewportTiles(tileStore, viewport, width, height, level = 0) {
  if (!tileStore?.getTileAtLevel || !Number.isInteger(level) || level < 0 || level > 4
    || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return [];
  const stride = 2 ** level;
  const levelWidth = Math.ceil(tileStore.width / stride);
  const levelHeight = Math.ceil(tileStore.height / stride);
  const tileSize = tileStore.tileSize;
  if (!Number.isInteger(tileSize) || tileSize < 2) return [];
  const zoom = Math.max(0.0001, Number(viewport?.zoom ?? 1));
  const centerLongitude = Number(viewport?.centerLongitude ?? 0);
  const centerLatitude = Number(viewport?.centerLatitude ?? 0);
  const west = centerLongitude - 180 / zoom;
  const east = centerLongitude + 180 / zoom;
  const north = Math.min(90, centerLatitude + 90 / zoom);
  const south = Math.max(-90, centerLatitude - 90 / zoom);
  const yStart = Math.max(0, Math.floor((90 - north) / 180 * levelHeight / tileSize));
  const yEnd = Math.min(Math.ceil(levelHeight / tileSize) - 1,
    Math.floor((90 - south) / 180 * levelHeight / tileSize));
  const xSet = new Set();
  const columns = Math.ceil(levelWidth / tileSize);
  for (const shift of [-360, 0, 360]) {
    const start = Math.floor((west - shift + 180) / 360 * levelWidth / tileSize);
    const end = Math.floor((east - shift + 180) / 360 * levelWidth / tileSize);
    for (let x = start; x <= end; x++) xSet.add(((x % columns) + columns) % columns);
  }
  const result = [];
  for (const y of Array.from({ length: Math.max(0, yEnd - yStart + 1) }, (_, i) => yStart + i)) {
    for (const x of xSet) {
      const tile = tileStore.getTileAtLevel(level, x, y);
      if (!tile) continue;
      const rects = getTerrainTileScreenRects(tile, tileStore, viewport, width, height);
      if (rects.length) result.push({ tile, rects });
    }
  }
  return result;
}

export function collectTerrainPredictiveTiles(tileStore, viewport, width, height, level = 0, limit = 8) {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const zoom = Math.max(0.0001, Number(viewport?.zoom ?? 1));
  const expandedViewport = {
    ...viewport,
    zoom: Math.max(0.0001, zoom * 0.72)
  };
  const visible = collectTerrainViewportTiles(tileStore, viewport, width, height, level);
  const visibleIds = new Set(visible.map(({ tile }) => `${tile.level}/${tile.x}/${tile.y}`));
  const candidates = collectTerrainViewportTiles(tileStore, expandedViewport, width, height, level)
    .filter(({ tile }) => !visibleIds.has(`${tile.level}/${tile.x}/${tile.y}`))
    .map(item => {
      const bounds = getTerrainTileGeoBounds(item.tile, tileStore);
      const longitude = (bounds.west + bounds.east) * 0.5;
      const latitude = (bounds.north + bounds.south) * 0.5;
      const dx = Math.abs((((longitude - Number(viewport?.centerLongitude ?? 0) + 540) % 360) + 360) % 360 - 180);
      const dy = Math.abs(latitude - Number(viewport?.centerLatitude ?? 0));
      return { ...item, distance: dx + dy * 2 };
    });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, limit).map(({ tile, rects }) => ({ tile, rects }));
}

export function buildTerrainTileTexture(tile, tileStore) {
  if (!tile || !tileStore?.getTileAtLevel || !Number.isInteger(tile.level)
    || !Number.isInteger(tile.x) || !Number.isInteger(tile.y)
    || !Number.isInteger(tile.width) || !Number.isInteger(tile.height)
    || tile.width < 1 || tile.height < 1
    || !Number.isInteger(tileStore.width) || !Number.isInteger(tileStore.height)
    || !Number.isInteger(tileStore.tileSize) || tileStore.tileSize < 2) return null;
  const stride = 2 ** tile.level;
  const levelWidth = Math.ceil(tileStore.width / stride);
  const levelHeight = Math.ceil(tileStore.height / stride);
  const columns = Math.ceil(levelWidth / tileStore.tileSize);
  const rows = Math.ceil(levelHeight / tileStore.tileSize);
  const width = tile.width + 2;
  const height = tile.height + 2;
  const values = new Int16Array(width * height);
  for (let y = -1; y <= tile.height; y++) {
    const sourceY = Math.max(0, Math.min(levelHeight - 1, tile.originY + y));
    const tileY = Math.floor(sourceY / tileStore.tileSize);
    for (let x = -1; x <= tile.width; x++) {
      const sourceX = ((tile.originX + x) % levelWidth + levelWidth) % levelWidth;
      const tileX = Math.floor(sourceX / tileStore.tileSize);
      const neighbor = tileStore.getTileAtLevel(tile.level, tileX, tileY);
      if (!neighbor) return null;
      const localX = sourceX - neighbor.originX;
      const localY = sourceY - neighbor.originY;
      values[(y + 1) * width + x + 1] = neighbor.values[localY * neighbor.width + localX];
    }
  }
  return {
    width, height, values,
    level: tile.level, tileX: tile.x, tileY: tile.y,
    originX: tile.originX, originY: tile.originY,
    sourceWidth: tileStore.width, sourceHeight: tileStore.height,
    stride, revision: tileStore.revision ?? 0
  };
}

export function createTerrainWebGLTileCache(gl, options = {}) {
  if (!gl || typeof gl.createTexture !== "function" || typeof gl.deleteTexture !== "function") return null;
  const maxTiles = Number.isInteger(options.maxTiles) && options.maxTiles > 0 ? options.maxTiles : 128;
  const maxBytes = Number.isSafeInteger(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : 64 * 1024 * 1024;
  const entries = new Map();
  let byteLength = 0;
  let hits = 0, misses = 0, uploads = 0, uploadedBytes = 0;
  let buildMs = 0, uploadMs = 0, evictions = 0;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const keyFor = (tile, store) => `${tile.level}/${tile.x}/${tile.y}@${store.revision ?? 0}`;

  function evict(protectedKeys = new Set()) {
    for (const [key, entry] of entries) {
      if (entries.size <= maxTiles && byteLength <= maxBytes) break;
      if (protectedKeys.has(key)) continue;
      gl.deleteTexture(entry.texture);
      entries.delete(key);
      byteLength -= entry.byteLength;
      evictions++;
    }
  }

  function get(tile, store, protectedKeys = new Set()) {
    if (!tile || !store) return null;
    const key = keyFor(tile, store);
    const cached = entries.get(key);
    if (cached) {
      hits++;
      entries.delete(key);
      entries.set(key, cached);
      return cached;
    }
    misses++;
    const tilePrefix = `${tile.level}/${tile.x}/${tile.y}@`;
    for (const [oldKey, oldEntry] of entries) {
      if (!oldKey.startsWith(tilePrefix)) continue;
      gl.deleteTexture(oldEntry.texture);
      entries.delete(oldKey);
      byteLength -= oldEntry.byteLength;
    }
    const buildStarted = now();
    const data = buildTerrainTileTexture(tile, store);
    if (!data) return null;
    const packed = encodeTerrainTexture(data.values);
    buildMs += now() - buildStarted;
    const bytes = packed.byteLength;
    const maxTextureSize = gl.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? Infinity;
    if (data.width > maxTextureSize || data.height > maxTextureSize || bytes > maxBytes) return null;
    const texture = gl.createTexture();
    if (!texture) return null;
    const uploadStarted = now();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, data.width, data.height, 0,
      gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, packed);
    uploadMs += now() - uploadStarted;
    uploads++;
    uploadedBytes += bytes;
    const entry = { key, texture, width: data.width, height: data.height,
      byteLength: bytes, level: tile.level, x: tile.x, y: tile.y, revision: store.revision ?? 0 };
    entries.set(key, entry);
    byteLength += bytes;
    evict(new Set([...protectedKeys, key]));
    return entries.has(key) ? entry : null;
  }

  function clear() {
    for (const entry of entries.values()) gl.deleteTexture(entry.texture);
    entries.clear();
    byteLength = 0;
  }

  return {
    get,
    clear,
    evict,
    get size() { return entries.size; },
    get memoryBytes() { return byteLength; },
    get stats() { return { tileCount: entries.size, byteLength, maxTiles, maxBytes,
      overBudget: entries.size > maxTiles || byteLength > maxBytes,
      hits, misses, uploads, uploadedBytes, buildMs, uploadMs, evictions }; }
  };
}

export function createTerrainWebGLTileAtlas(gl, store, options = {}) {
 if(!gl||typeof gl.texSubImage2D!=="function"||!Number.isInteger(store?.tileSize))return null;
 const cell=store.tileSize+2, max=gl.getParameter?.(gl.MAX_TEXTURE_SIZE)??0;
 const side=Math.min(options.slotsPerSide??8,Math.floor(max/cell));
 if(side<1)return null;
 const atlasWidth=side*cell,atlasHeight=side*cell,texture=gl.createTexture();
 if(!texture)return null;
 gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE_ALPHA,atlasWidth,atlasHeight,0,gl.LUMINANCE_ALPHA,gl.UNSIGNED_BYTE,null);
 const entries=new Map(),free=[];
 for(let y=0;y<side;y++)for(let x=0;x<side;x++)free.push({slotX:x,slotY:y});
 let hits=0,misses=0,uploads=0,uploadedBytes=0,buildMs=0,uploadMs=0,evictions=0;
 const pending=new Map();let pumpScheduled=false,disposed=false;
 const now=()=>globalThis.performance?.now?.()??Date.now(),key=t=>`${t.level}/${t.x}/${t.y}@${store.revision??0}`;
 function release(k,e){entries.delete(k);free.push({slotX:e.slotX,slotY:e.slotY});evictions++;}
 function evict(protectedKeys=new Set()){for(const [k,e] of entries){if(free.length)break;if(!protectedKeys.has(k))release(k,e);}}
 function get(tile,protectedKeys=new Set()){
  if(!tile)return null;const k=key(tile),hit=entries.get(k);
  if(hit){hits++;entries.delete(k);entries.set(k,hit);return hit;}misses++;
  const prefix=`${tile.level}/${tile.x}/${tile.y}@`;
  for(const [old,e] of entries)if(old.startsWith(prefix))release(old,e);
  if(!free.length)evict(protectedKeys);if(!free.length)return null;
  const started=now(),data=buildTerrainTileTexture(tile,store);if(!data||data.width>cell||data.height>cell)return null;
  const packed=encodeTerrainTexture(data.values);buildMs+=now()-started;const slot=free.pop(),uploadStart=now();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texSubImage2D(gl.TEXTURE_2D,0,slot.slotX*cell,slot.slotY*cell,data.width,data.height,gl.LUMINANCE_ALPHA,gl.UNSIGNED_BYTE,packed);
  uploadMs+=now()-uploadStart;uploads++;uploadedBytes+=packed.byteLength;
  const entry={key:k,...slot,width:data.width,height:data.height,byteLength:packed.byteLength,level:tile.level,x:tile.x,y:tile.y,revision:store.revision??0,texture};
  entries.set(k,entry);return entry;
 }
 function pump(deadline){pumpScheduled=false;if(disposed||!pending.size)return;if(deadline&&!deadline.didTimeout&&deadline.timeRemaining()<4){schedulePump();return;}const [k,item]=pending.entries().next().value;pending.delete(k);if(!entries.has(k))get(item.tile,item.protectedKeys);schedulePump();}
 function schedulePump(){if(pumpScheduled||disposed||!pending.size)return;pumpScheduled=true;if(typeof globalThis.requestIdleCallback==="function")globalThis.requestIdleCallback(deadline=>pump(deadline),{timeout:500});else if(typeof globalThis.setTimeout==="function")globalThis.setTimeout(()=>pump(),16);else pump();}
 function enqueue(tile,protectedKeys=new Set()){if(!tile||disposed)return false;const k=key(tile);if(entries.has(k)){const e=entries.get(k);entries.delete(k);entries.set(k,e);return false;}if(!pending.has(k))pending.set(k,{tile,protectedKeys:new Set(protectedKeys)});schedulePump();return true;}
 function clear(){pending.clear();entries.clear();free.length=0;for(let y=0;y<side;y++)for(let x=0;x<side;x++)free.push({slotX:x,slotY:y});gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE_ALPHA,atlasWidth,atlasHeight,0,gl.LUMINANCE_ALPHA,gl.UNSIGNED_BYTE,null);}
 function dispose(){disposed=true;pending.clear();entries.clear();gl.deleteTexture?.(texture);}
 return {texture,cellSize:cell,atlasWidth,atlasHeight,capacity:side*side,get,enqueue,evict,clear,dispose,get size(){return entries.size;},get pendingCount(){return pending.size;},get memoryBytes(){return atlasWidth*atlasHeight*2;},get stats(){return {tileCount:entries.size,pendingCount:pending.size,byteLength:atlasWidth*atlasHeight*2,maxTiles:side*side,maxBytes:atlasWidth*atlasHeight*2,overBudget:false,hits,misses,uploads,uploadedBytes,buildMs,uploadMs,evictions,atlasWidth,atlasHeight,capacity:side*side};}};
}

export function buildTerrainTileAtlasBatchVertices(items,entries,width,height,atlas){
 if(!Array.isArray(items)||!entries||!atlas||width<=0||height<=0)return new Float32Array();
 const out=[],push=(x,y,u,v,e,t)=>out.push(x/width*2-1,1-y/height*2,
  (e.slotX*atlas.cellSize+1+u*t.width)/atlas.atlasWidth,(e.slotY*atlas.cellSize+1+v*t.height)/atlas.atlasHeight,
  1/atlas.atlasWidth,1/atlas.atlasHeight,1/(t.width+2),1/(t.height+2),
  (e.slotX*atlas.cellSize)/atlas.atlasWidth,(e.slotY*atlas.cellSize)/atlas.atlasHeight,
  (e.slotX*atlas.cellSize+t.width+1)/atlas.atlasWidth,(e.slotY*atlas.cellSize+t.height+1)/atlas.atlasHeight);
 for(const {tile,rects} of items){
  const entry=entries.get(`${tile.level}/${tile.x}/${tile.y}@${tile.revision??0}`)??Array.from(entries.values()).find(e=>e.level===tile.level&&e.x===tile.x&&e.y===tile.y);
  if(!entry)continue;
  for(const r of rects??[]){
   if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)continue;
   const l=Math.max(0,r.x),t=Math.max(0,r.y),right=Math.min(width,r.x+r.width),bottom=Math.min(height,r.y+r.height);
   if(right<=l||bottom<=t)continue;
   const ax=(l-r.x)/r.width,bx=(right-r.x)/r.width,ay=(t-r.y)/r.height,by=(bottom-r.y)/r.height;
   const u0=r.u0+(r.u1-r.u0)*ax,u1=r.u0+(r.u1-r.u0)*bx,v0=r.v0+(r.v1-r.v0)*ay,v1=r.v0+(r.v1-r.v0)*by;
   push(l,t,u0,v0,entry,tile);push(l,bottom,u0,v1,entry,tile);push(right,t,u1,v0,entry,tile);
   push(right,t,u1,v0,entry,tile);push(l,bottom,u0,v1,entry,tile);push(right,bottom,u1,v1,entry,tile);
  }
 }
 return new Float32Array(out);
}

export function prepareTerrainTextureGrid(grid, maxTextureSize) {
  if (!grid?.values || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)
    || grid.width < 2 || grid.height < 2 || grid.values.length < grid.width * grid.height
    || !Number.isInteger(maxTextureSize) || maxTextureSize < 2) return null;
  const scale = Math.min(1, maxTextureSize / grid.width, maxTextureSize / grid.height);
  if (scale >= 1) return grid;
  const width = Math.max(2, Math.floor((grid.width - 1) * scale) + 1);
  const height = Math.max(2, Math.floor((grid.height - 1) * scale) + 1);
  const values = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(grid.height - 1, Math.round(y * (grid.height - 1) / (height - 1)));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(grid.width - 1, Math.round(x * (grid.width - 1) / (width - 1)));
      values[y * width + x] = grid.values[sourceY * grid.width + sourceX];
    }
  }
  return { width, height, values, sourceWidth: grid.width, sourceHeight: grid.height };
}

function createRenderer(grid) {
  if (!grid?.values || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) return null;
  const candidates = [];
  if (typeof OffscreenCanvas !== "undefined") candidates.push(new OffscreenCanvas(1, 1));
  if (typeof document !== "undefined") candidates.push(document.createElement("canvas"));
  let canvas = null, gl = null;
  for (const candidate of candidates) {
    const context = candidate.getContext?.("webgl", {
      alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true
    });
    if (context) {
      canvas = candidate;
      gl = context;
      break;
    }
  }
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const textureGrid = prepareTerrainTextureGrid(grid, gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (!textureGrid) return null;
  const uploadStartedAt = globalThis.performance?.now?.() ?? Date.now();
  const packed = encodeTerrainTexture(textureGrid.values);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // ETOPO est une texture NPOT : WebGL 1 impose CLAMP_TO_EDGE.
  // Le shader applique lui-même le wrapping longitudinal via fract().
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, textureGrid.width, textureGrid.height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, packed);
  const textureUploadMs = (globalThis.performance?.now?.() ?? Date.now()) - uploadStartedAt;
  const timerExtension = gl.getExtension("EXT_disjoint_timer_query");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_elevation"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_gridSize"), textureGrid.width, textureGrid.height);
  const renderer = {
    canvas, gl, program, grid, texture, textureGrid, timerExtension,
    textureUploadMs, textureBytes: packed.byteLength,
    pendingQueries: [], lastGpuMs: null, lastSubmitMs: 0,
    contextLost: false
  };
  canvas.addEventListener?.("webglcontextlost", event => {
    event.preventDefault?.();
    renderer.contextLost = true;
  });
  canvas.addEventListener?.("webglcontextrestored", () => {
    renderer.contextLost = true;
    renderers.delete(grid);
  });
  return renderer;
}

function pollGpuQueries(renderer) {
  const { gl, timerExtension: ext, pendingQueries } = renderer;
  if (!ext) return;
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  if (disjoint) renderer.lastGpuMs = null;
  for (let i = pendingQueries.length - 1; i >= 0; i--) {
    const query = pendingQueries[i];
    if (!ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT)) continue;
    if (!disjoint) renderer.lastGpuMs = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT) / 1e6;
    ext.deleteQueryEXT(query);
    pendingQueries.splice(i, 1);
  }
}

export function getTerrainWebGLStats(grid) {
  const renderer = grid && renderers.get(grid);
  if (!renderer || renderer.contextLost || renderer.gl.isContextLost?.()) return null;
  return {
    textureUploadMs: renderer.textureUploadMs,
    textureBytes: renderer.textureBytes,
    textureWidth: renderer.textureGrid.width,
    textureHeight: renderer.textureGrid.height,
    sourceWidth: renderer.grid.width,
    sourceHeight: renderer.grid.height,
    drawSubmitMs: renderer.lastSubmitMs,
    gpuMs: renderer.lastGpuMs,
    timerQueriesSupported: Boolean(renderer.timerExtension)
  };
}

export function resizeTerrainWebGLSurface(canvas, width, height) {
  if (!canvas || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return false;
  let changed = false;
  if (canvas.width !== width) { canvas.width = width; changed = true; }
  if (canvas.height !== height) { canvas.height = height; changed = true; }
  return changed;
}

export function renderTerrainWebGL(grid, width, height, viewport = {}) {
  if (!grid?.values || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  let renderer = renderers.get(grid);
  if (!renderer) {
    renderer = createRenderer(grid);
    if (!renderer) return null;
    renderers.set(grid, renderer);
  }
  if (renderer.contextLost || renderer.gl.isContextLost?.()) {
    renderers.delete(grid);
    return null;
  }
  const { canvas, gl, program } = renderer;
  pollGpuQueries(renderer);
  resizeTerrainWebGLSurface(canvas, width, height);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewCenter"),
    Number(viewport.centerLongitude ?? 0), Number(viewport.centerLatitude ?? 0));
  gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), Math.max(0.0001, Number(viewport.zoom ?? 1)));
  const ext = renderer.timerExtension;
  let query = null;
  if (ext && renderer.pendingQueries.length < 4) {
    try {
      query = ext.createQueryEXT();
      ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query);
    } catch {
      if (query) ext.deleteQueryEXT(query);
      query = null;
    }
  }
  const submitStartedAt = globalThis.performance?.now?.() ?? Date.now();
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  renderer.lastSubmitMs = (globalThis.performance?.now?.() ?? Date.now()) - submitStartedAt;
  if (query) {
    try {
      ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
      renderer.pendingQueries.push(query);
    } catch {
      ext.deleteQueryEXT(query);
    }
  }
  if (gl.isContextLost?.()) {
    renderer.contextLost = true;
    renderers.delete(grid);
    return null;
  }
  return canvas;
}

export function getTerrainWebGLShaders() {
  return { vertex: VERTEX_SHADER, fragment: FRAGMENT_SHADER, tileFragment: TILE_FRAGMENT_SHADER };
}


const tileRenderers = new WeakMap();
const TILE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_atlasUv;
attribute vec2 a_atlasStep;
attribute vec2 a_tileStep;
attribute vec4 a_atlasBounds;
varying vec4 v_atlasBounds;
varying vec2 v_atlasUv;
varying vec2 v_atlasStep;
varying vec2 v_tileStep;
void main(){v_atlasUv=a_atlasUv;v_atlasStep=a_atlasStep;v_tileStep=a_tileStep;v_atlasBounds=a_atlasBounds;gl_Position=vec4(a_position,0.0,1.0);}
`;


const TILE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_elevation;
uniform float u_opacity;
varying vec2 v_atlasUv;
varying vec2 v_atlasStep;
varying vec2 v_tileStep;
varying vec4 v_atlasBounds;
float elevationAt(vec2 uv){vec2 p=clamp(uv,v_atlasBounds.xy,v_atlasBounds.zw);vec4 s=texture2D(u_elevation,p);float n=s.r*255.0+s.a*65280.0;return mod(n+32768.0,65536.0)-32768.0;}
vec3 ramp(float v,float lo,float hi,vec3 a,vec3 b){float t=clamp((v-lo)/(hi-lo),0.0,1.0);t=t*t*(3.0-2.0*t);return mix(a,b,t);}
void main(){
 float e=elevationAt(v_atlasUv);
 float w=elevationAt(v_atlasUv-vec2(v_atlasStep.x,0.0)), east=elevationAt(v_atlasUv+vec2(v_atlasStep.x,0.0));
 float n=elevationAt(v_atlasUv-vec2(0.0,v_atlasStep.y)), south=elevationAt(v_atlasUv+vec2(0.0,v_atlasStep.y));
 float sx=(east-w)/max(1.0,222640.0*v_tileStep.x),sy=(n-south)/max(1.0,222640.0*v_tileStep.y);
 vec3 normal=normalize(vec3(-sx,-sy,1.0)),light=normalize(vec3(-0.5,0.5,0.70710678));
 float shade=clamp(1.0+(dot(normal,light)-0.70710678)*0.65,0.72,1.22);
 vec3 ocean=ramp(e,-11000.0,-50.0,vec3(25.0,45.0,57.0)/255.0,vec3(46.0,80.0,87.0)/255.0);
 vec3 low=ramp(e,0.0,1000.0,vec3(105.0,126.0,88.0)/255.0,vec3(139.0,139.0,91.0)/255.0);
 vec3 high=ramp(e,1000.0,6500.0,vec3(139.0,139.0,91.0)/255.0,vec3(224.0,222.0,210.0)/255.0);
 vec3 color=e<0.0?ocean:(e<1000.0?low:high);
 gl_FragColor=vec4(color*(e<0.0?1.0:shade),u_opacity);
}`;

function createTileRenderer(tileStore) {
  const candidates=[];
  if(typeof OffscreenCanvas!=="undefined") candidates.push(new OffscreenCanvas(1,1));
  if(typeof document!=="undefined") candidates.push(document.createElement("canvas"));
  let canvas=null,gl=null;
  for(const candidate of candidates) {
    const context=candidate.getContext?.("webgl",{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    if(context){canvas=candidate;gl=context;break;}
  }
  if(!gl) return null;
  const vertex=compileShader(gl,gl.VERTEX_SHADER,TILE_VERTEX_SHADER);
  const fragment=compileShader(gl,gl.FRAGMENT_SHADER,TILE_FRAGMENT_SHADER);
  if(!vertex||!fragment) return null;
  const program=gl.createProgram();
  gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) return null;
  const buffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);
  const position=gl.getAttribLocation(program,"a_position"),atlasUv=gl.getAttribLocation(program,"a_atlasUv");
  const atlasStep=gl.getAttribLocation(program,"a_atlasStep"),tileStep=gl.getAttribLocation(program,"a_tileStep"),atlasBounds=gl.getAttribLocation(program,"a_atlasBounds");
  gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,48,0);
  gl.enableVertexAttribArray(atlasUv);gl.vertexAttribPointer(atlasUv,2,gl.FLOAT,false,48,8);
  gl.enableVertexAttribArray(atlasStep);gl.vertexAttribPointer(atlasStep,2,gl.FLOAT,false,48,16);
  gl.enableVertexAttribArray(tileStep);gl.vertexAttribPointer(tileStep,2,gl.FLOAT,false,48,24);
  gl.enableVertexAttribArray(atlasBounds);gl.vertexAttribPointer(atlasBounds,4,gl.FLOAT,false,48,32);
  gl.uniform1i(gl.getUniformLocation(program,"u_elevation"),0);
  const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const cache=createTerrainWebGLTileAtlas(gl,tileStore,{slotsPerSide:8});
  if(!cache)return null;
  const renderer={canvas,gl,program,buffer,position,atlasUv,atlasStep,tileStep,atlasBounds,cache,maxTextureSize,contextLost:false,lastSubmitMs:0,revision:tileStore.revision??0,lastDrawCalls:0,lastVisibleTiles:0,lastLevel:null,lastPreloadedTiles:0,lastPreloadAt:0,transitionFromLevel:null,transitionStartedAt:0,transitionProgress:1};
  canvas.addEventListener?.("webglcontextlost",event=>{event.preventDefault?.();renderer.contextLost=true;});
  canvas.addEventListener?.("webglcontextrestored",()=>{renderer.contextLost=true;tileRenderers.delete(tileStore);});
  return renderer;
}

export function buildTerrainTileBatchVertices(rects, width, height) {
  if (!Array.isArray(rects) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return new Float32Array();
  const vertices = [];
  const push = (x, y, u, v) => vertices.push(x / width * 2 - 1, 1 - y / height * 2, u, v);
  for (const rect of rects) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
      || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
      || rect.width <= 0 || rect.height <= 0) continue;
    const left = Math.max(0, rect.x), top = Math.max(0, rect.y);
    const right = Math.min(width, rect.x + rect.width), bottom = Math.min(height, rect.y + rect.height);
    if (right <= left || bottom <= top) continue;
    const tx0 = (left - rect.x) / rect.width, tx1 = (right - rect.x) / rect.width;
    const ty0 = (top - rect.y) / rect.height, ty1 = (bottom - rect.y) / rect.height;
    const u0 = rect.u0 + (rect.u1 - rect.u0) * tx0;
    const u1 = rect.u0 + (rect.u1 - rect.u0) * tx1;
    const v0 = rect.v0 + (rect.v1 - rect.v0) * ty0;
    const v1 = rect.v0 + (rect.v1 - rect.v0) * ty1;
    push(left,top,u0,v0); push(left,bottom,u0,v1); push(right,top,u1,v0);
    push(right,top,u1,v0); push(left,bottom,u0,v1); push(right,bottom,u1,v1);
  }
  return new Float32Array(vertices);
}

export function getTerrainTileTransitionOpacity(progress) {
  const value = Number(progress);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function renderTerrainWebGLTiles(tileStore,width,height,viewport={}) {
  if(!tileStore?.getTileAtLevel||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1) return null;
  let renderer=tileRenderers.get(tileStore);
  if(!renderer){renderer=createTileRenderer(tileStore);if(!renderer)return null;tileRenderers.set(tileStore,renderer);}
  const {canvas,gl,program,cache}=renderer;
  if(renderer.contextLost||gl.isContextLost?.()){tileRenderers.delete(tileStore);return null;}
  const revision=tileStore.revision??0;
  if(renderer.revision!==revision) {
    cache.clear();
    renderer.revision=revision;
    renderer.transitionFromLevel=null;
  }
  resizeTerrainWebGLSurface(canvas,width,height);
  gl.viewport(0,0,width,height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
  const level=selectTerrainTileLevel(tileStore,viewport,width);
  const now=globalThis.performance?.now?.()??Date.now();
  if(renderer.lastLevel!==level) {
    if(renderer.lastLevel!==null && renderer.lastLevel!==undefined && renderer.lastLevel!==level) {
      renderer.transitionFromLevel=renderer.lastLevel;
      renderer.transitionStartedAt=now;
    } else {
      renderer.transitionFromLevel=null;
    }
    renderer.lastLevel=level;
  }
  const transitionFrom=renderer.transitionFromLevel;
  const transitionProgress=transitionFrom===null?1:getTerrainTileTransitionOpacity((now-renderer.transitionStartedAt)/220);
  if(transitionProgress>=1) renderer.transitionFromLevel=null;
  renderer.transitionProgress=transitionProgress;
  const visible=collectTerrainViewportTiles(tileStore,viewport,width,height,level);
  const previousVisible=transitionFrom!==null&&transitionProgress<1
    ?collectTerrainViewportTiles(tileStore,viewport,width,height,transitionFrom):[];
  renderer.lastVisibleTiles=visible.length;
  renderer.lastDrawCalls=0;
  const revisionSuffix=tileStore.revision??0;
  const protectedKeys=new Set([...visible,...previousVisible].map(({tile})=>`${tile.level}/${tile.x}/${tile.y}@${revisionSuffix}`));
  cache.evict(protectedKeys);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const opacityLocation=gl.getUniformLocation(program,"u_opacity");
  const started=globalThis.performance?.now?.()??Date.now();
  const drawLevel=(items,opacity)=>{
    if(!items.length||opacity<=0)return;
    gl.uniform1f(opacityLocation,opacity);gl.bindTexture(gl.TEXTURE_2D,cache.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER,renderer.buffer);
    gl.vertexAttribPointer(renderer.position,2,gl.FLOAT,false,48,0);
    gl.vertexAttribPointer(renderer.atlasUv,2,gl.FLOAT,false,48,8);
    gl.vertexAttribPointer(renderer.atlasStep,2,gl.FLOAT,false,48,16);
    gl.vertexAttribPointer(renderer.tileStep,2,gl.FLOAT,false,48,24);
    gl.vertexAttribPointer(renderer.atlasBounds,4,gl.FLOAT,false,48,32);
    const entries=new Map();
    for(const {tile} of items){const entry=cache.get(tile,protectedKeys);if(entry)entries.set(entry.key,entry);}
    const vertices=buildTerrainTileAtlasBatchVertices(items,entries,width,height,cache);
    if(!vertices.length)return;
    gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/12);renderer.lastDrawCalls++;
  };
  if(previousVisible.length)drawLevel(previousVisible,1);
  drawLevel(visible,previousVisible.length?transitionProgress:1);
  const drawFinishedAt=globalThis.performance?.now?.()??Date.now();
  renderer.lastSubmitMs=drawFinishedAt-started;
  renderer.lastPreloadedTiles=0;
  if(drawFinishedAt-renderer.lastPreloadAt>=120) {
    renderer.lastPreloadAt=drawFinishedAt;
    const predictive=collectTerrainPredictiveTiles(tileStore,viewport,width,height,level,8);
    for(const {tile} of predictive) {
      if(cache.enqueue(tile,protectedKeys)) renderer.lastPreloadedTiles++;
    }
  }
  gl.disable(gl.BLEND);
  gl.viewport(0,0,width,height);
  if(gl.isContextLost?.()){renderer.contextLost=true;tileRenderers.delete(tileStore);return null;}
  return canvas;
}

export function getTerrainWebGLTileStats(tileStore) {
  const renderer=tileStore&&tileRenderers.get(tileStore);
  if(!renderer||renderer.contextLost||renderer.gl.isContextLost?.()) return null;
  return {...renderer.cache.stats,drawSubmitMs:renderer.lastSubmitMs,drawCalls:renderer.lastDrawCalls,visibleTiles:renderer.lastVisibleTiles,preloadedTiles:renderer.lastPreloadedTiles,lod:renderer.lastLevel,transitionProgress:renderer.transitionProgress,transitionFromLevel:renderer.transitionFromLevel,maxTextureSize:renderer.maxTextureSize};
}
