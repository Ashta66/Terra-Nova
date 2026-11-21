const DEFAULT_TOLERANCE = 0.004;
const ROUND_DIGITS = 6;
const coordinateKey = point => Array.isArray(point) && point.length >= 2
  ? Number(point[0]).toFixed(ROUND_DIGITS) + "," + Number(point[1]).toFixed(ROUND_DIGITS)
  : "";

function collectPaths(geometry, paths = []) {
  if (!geometry) return paths;
  const addPolygon = polygon => { for (const ring of polygon ?? []) if (Array.isArray(ring)) paths.push(ring); };
  if (geometry.type === "Polygon") addPolygon(geometry.coordinates);
  else if (geometry.type === "MultiPolygon") for (const polygon of geometry.coordinates ?? []) addPolygon(polygon);
  else if (geometry.type === "LineString") paths.push(geometry.coordinates ?? []);
  else if (geometry.type === "MultiLineString") paths.push(...(geometry.coordinates ?? []));
  else if (geometry.type === "GeometryCollection") for (const child of geometry.geometries ?? []) collectPaths(child, paths);
  return paths;
}

function pointDistanceSquared(point, start, end, latitude) {
  const cos = Math.max(0.05, Math.cos(latitude * Math.PI / 180));
  const px = Number(point[0]) * cos, py = Number(point[1]);
  const sx = Number(start[0]) * cos, sy = Number(start[1]);
  const ex = Number(end[0]) * cos, ey = Number(end[1]);
  const dx = ex - sx, dy = ey - sy;
  if (!dx && !dy) return (px-sx)**2 + (py-sy)**2;
  const t = Math.max(0, Math.min(1, ((px-sx)*dx+(py-sy)*dy)/(dx*dx+dy*dy)));
  return (px-(sx+t*dx))**2 + (py-(sy+t*dy))**2;
}

function simplifyOpen(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points.slice();
  const meanLatitude = points.reduce((sum,p)=>sum+Number(p[1]||0),0)/points.length;
  const keep = new Uint8Array(points.length); keep[0]=1; keep[points.length-1]=1;
  const stack=[[0,points.length-1]], threshold=tolerance*tolerance;
  while(stack.length){
    const [first,last]=stack.pop();let farthest=-1,max=threshold;
    for(let i=first+1;i<last;i++){const d=pointDistanceSquared(points[i],points[first],points[last],meanLatitude);if(d>max){max=d;farthest=i;}}
    if(farthest>=0){keep[farthest]=1;stack.push([first,farthest],[farthest,last]);}
  }
  return points.filter((_,i)=>keep[i]);
}

function simplifyPath(path, tolerance, anchors) {
  if (!Array.isArray(path) || path.length <= 2 || tolerance <= 0) return path;
  const closed = path.length > 3 && coordinateKey(path[0]) === coordinateKey(path[path.length-1]);
  const points = closed ? path.slice(0,-1) : path.slice();
  if (points.length <= (closed?3:2)) return path;
  const indices=[];
  for(let i=0;i<points.length;i++)if(!closed&&(i===0||i===points.length-1)||anchors.has(coordinateKey(points[i])))indices.push(i);
  if(closed){
    if(indices.length===1){let far=0,dist=-1;for(let i=0;i<points.length;i++){const d=(Number(points[i][0])-Number(points[indices[0]][0]))**2+(Number(points[i][1])-Number(points[indices[0]][1]))**2;if(d>dist){dist=d;far=i;}}if(far!==indices[0])indices.push(far);}
    if(indices.length===0){let far=1,dist=-1;for(let i=1;i<points.length;i++){const d=(Number(points[i][0])-Number(points[0][0]))**2+(Number(points[i][1])-Number(points[0][1]))**2;if(d>dist){dist=d;far=i;}}indices.push(0,far);}
  }
  const sorted=[...new Set(indices)].sort((a,b)=>a-b);
  if(!sorted.length)return path;
  const result=[];
  if(!closed){
    for(let s=0;s<sorted.length-1;s++){const a=sorted[s],b=sorted[s+1],part=simplifyOpen(points.slice(a,b+1),tolerance);result.push(...(s?part.slice(1):part));}
  }else{
    for(let s=0;s<sorted.length;s++){const a=sorted[s],b=sorted[(s+1)%sorted.length];const segment=[];let i=a;while(true){segment.push(points[i]);if(i===b)break;i=(i+1)%points.length;}const part=simplifyOpen(segment,tolerance);result.push(...(s?part.slice(1):part));}
  }
  const unique=[];for(const point of result)if(!unique.length||coordinateKey(unique[unique.length-1])!==coordinateKey(point))unique.push(point);
  if(closed){if(unique.length<3)return path;if(coordinateKey(unique[0])!==coordinateKey(unique[unique.length-1]))unique.push(unique[0]);}
  else if(unique.length<2)return path;
  return unique.length<path.length?unique:path;
}

function simplifyGeometry(geometry,tolerance,anchors){
  if(!geometry)return geometry;
  if(geometry.type==="Polygon")return {...geometry,coordinates:geometry.coordinates.map(ring=>simplifyPath(ring,tolerance,anchors))};
  if(geometry.type==="MultiPolygon")return {...geometry,coordinates:geometry.coordinates.map(polygon=>polygon.map(ring=>simplifyPath(ring,tolerance,anchors)))};
  if(geometry.type==="LineString")return {...geometry,coordinates:simplifyPath(geometry.coordinates,tolerance,anchors)};
  if(geometry.type==="MultiLineString")return {...geometry,coordinates:geometry.coordinates.map(line=>simplifyPath(line,tolerance,anchors))};
  if(geometry.type==="GeometryCollection")return {...geometry,geometries:geometry.geometries.map(child=>simplifyGeometry(child,tolerance,anchors))};
  return geometry;
}

/**
 * Pré-généralise une collection GeoJSON avant l'index spatial et la projection.
 * Les sommets partagés entre entités sont conservés comme points d'ancrage :
 * les frontières communes restent ainsi alignées des deux côtés.
 */
export function simplifyGeoJsonCollection(collection, tolerance = DEFAULT_TOLERANCE) {
  if(!collection?.features||!Number.isFinite(tolerance)||tolerance<=0)return collection;
  const paths=collection.features.flatMap(feature=>collectPaths(feature?.geometry,[]));
  const occurrences=new Map();
  for(const path of paths){const keys=new Set(path.map(coordinateKey).filter(Boolean));for(const key of keys)occurrences.set(key,(occurrences.get(key)??0)+1);}
  const sharedAnchors=new Set([...occurrences].filter(([,count])=>count>1).map(([key])=>key));
  let originalVertices=0,simplifiedVertices=0,changedFeatures=0;
  const features=collection.features.map(feature=>{
    if(!feature?.geometry)return feature;
    const before=collectPaths(feature.geometry,[]).reduce((n,path)=>n+path.length,0);originalVertices+=before;
    const geometry=simplifyGeometry(feature.geometry,tolerance,sharedAnchors);
    const after=collectPaths(geometry,[]).reduce((n,path)=>n+path.length,0);simplifiedVertices+=after;
    if(after<before)changedFeatures++;
    if(after===before)return feature;
    const {bbox,...rest}=feature;return {...rest,geometry};
  });
  return {...collection,features,geometryStats:{originalVertices,simplifiedVertices,removedVertices:originalVertices-simplifiedVertices,changedFeatures,tolerance}};
}


/**
 * Cache paresseusement plusieurs versions généralisées d'une même collection.
 * Les géométries sont calculées une seule fois par niveau de zoom puis réutilisées
 * pendant les pans et les rendus suivants. Le niveau de base est déjà généralisé
 * au chargement et sert de repli lorsque le zoom dépasse les seuils configurés.
 */
export function createGeoJsonLodSet(baseCollection, levels = [], baseTolerance = 0, options = {}) {
  const normalizedLevels = [...new Map(levels
    .filter(level => Number.isFinite(level?.maxZoom) && Number.isFinite(level?.tolerance) && level.tolerance > 0)
    .map(level => ({ maxZoom: level.maxZoom, tolerance: level.tolerance }))
    .sort((a, b) => a.maxZoom - b.maxZoom)
    .map(level => [level.maxZoom, level])).values()];
  const cache = new Map();
  const generationSamples = [];
  const pending = new Map();
  let generatedLevels = 0;
  let removedVertices = 0;

  function getForZoom(zoom = 1) {
    if (!baseCollection?.features) return baseCollection;
    const level = normalizedLevels.find(item => Number(zoom) <= item.maxZoom);
    if (!level || level.tolerance <= baseTolerance) return baseCollection;
    if (cache.has(level.tolerance)) return cache.get(level.tolerance);
    if (pending.has(level.tolerance)) return baseCollection;
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const generalized = simplifyGeoJsonCollection(baseCollection, level.tolerance);
    const durationMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    cache.set(level.tolerance, generalized);
    generationSamples.push(durationMs);
    generatedLevels += 1;
    removedVertices += generalized?.geometryStats?.removedVertices ?? 0;
    return generalized;
  }

  function getAdjacentZoom(zoom = 1, direction = 1) {
    if (!normalizedLevels.length) return null;
    const current = Number(zoom);
    if (!Number.isFinite(current)) return null;
    if (direction >= 0) {
      const activeIndex = normalizedLevels.findIndex(level => current <= level.maxZoom);
      if (activeIndex < 0) return null;
      const active = normalizedLevels[activeIndex];
      if (active.tolerance <= baseTolerance) return null;
      return active.maxZoom + 0.001;
    }
    const previous = [...normalizedLevels].reverse().find(level => level.maxZoom < current && level.tolerance > baseTolerance);
    return previous ? previous.maxZoom : null;
  }

  function prepareAdjacent(zoom = 1, direction = 1) {
    const targetZoom = getAdjacentZoom(zoom, direction);
    if (targetZoom === null) return false;
    const before = generatedLevels;
    getForZoom(targetZoom);
    return generatedLevels > before;
  }

  function prepareAdjacentAsync(zoom = 1, direction = 1) {
    const targetZoom = getAdjacentZoom(zoom, direction);
    if (targetZoom === null || !baseCollection?.features) return Promise.resolve(false);
    const level = normalizedLevels.find(item => targetZoom <= item.maxZoom);
    if (!level || level.tolerance <= baseTolerance || cache.has(level.tolerance)) return Promise.resolve(false);
    if (pending.has(level.tolerance)) return pending.get(level.tolerance);
    if (typeof options.createWorker !== "function") return Promise.resolve(prepareAdjacent(zoom, direction));
    let worker;
    try { worker = options.createWorker(); } catch { worker = null; }
    if (!worker) return Promise.resolve(prepareAdjacent(zoom, direction));
    const promise = new Promise(resolve => {
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      let settled = false;
      const finish = (result, fallback = false) => {
        if (settled) return;
        settled = true;
        worker.terminate?.();
        pending.delete(level.tolerance);
        if (result) {
          cache.set(level.tolerance, result);
          generationSamples.push(Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt));
          generatedLevels += 1;
          removedVertices += result?.geometryStats?.removedVertices ?? 0;
          resolve(true);
        } else if (fallback) {
          resolve(prepareAdjacent(zoom, direction));
        } else {
          resolve(false);
        }
      };
      worker.onmessage = event => finish(event?.data?.result ?? null, false);
      worker.onerror = () => finish(null, true);
      try {
        worker.postMessage({ collection: baseCollection, tolerance: level.tolerance });
      } catch {
        finish(null, true);
      }
    });
    pending.set(level.tolerance, promise);
    return promise;
  }

  return {
    getForZoom,
    prepareAdjacent,
    prepareAdjacentAsync,
    getAdjacentZoom,
    getStats() {
      return {
        generatedLevels,
        cachedLevels: cache.size,
        configuredLevels: normalizedLevels.length,
        generationTimeMs: generationSamples.reduce((sum, value) => sum + value, 0),
        lastGenerationMs: generationSamples.at(-1) ?? 0,
        removedVertices,
        cachedTolerances: [...cache.keys()]
      };
    }
  };
}
