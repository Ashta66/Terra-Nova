const DEFAULT_TOLERANCE = 0.004;
const ROUND_DIGITS = 6;
function sumValues(values) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
const coordinateKey = point => Array.isArray(point) && point.length >= 2
  ? Number(point[0]).toFixed(ROUND_DIGITS) + "," + Number(point[1]).toFixed(ROUND_DIGITS)
  : "";

function countGeometryVertices(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    let total = 0;
    for (const ring of geometry.coordinates ?? []) if (Array.isArray(ring)) total += ring.length;
    return total;
  }
  if (geometry.type === "MultiPolygon") {
    let total = 0;
    for (const polygon of geometry.coordinates ?? []) {
      for (const ring of polygon ?? []) if (Array.isArray(ring)) total += ring.length;
    }
    return total;
  }
  if (geometry.type === "LineString") return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
  if (geometry.type === "MultiLineString") {
    let total = 0;
    for (const line of geometry.coordinates ?? []) if (Array.isArray(line)) total += line.length;
    return total;
  }
  if (geometry.type === "GeometryCollection") {
    let total = 0;
    for (const child of geometry.geometries ?? []) total += countGeometryVertices(child);
    return total;
  }
  return 0;
}

function forEachGeometryPath(geometry, visitPath) {
  if (!geometry) return;
  const visitPolygon = polygon => {
    for (const ring of polygon ?? []) if (Array.isArray(ring)) visitPath(ring);
  };
  if (geometry.type === "Polygon") visitPolygon(geometry.coordinates);
  else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates ?? []) visitPolygon(polygon);
  } else if (geometry.type === "LineString") visitPath(geometry.coordinates ?? []);
  else if (geometry.type === "MultiLineString") {
    for (const line of geometry.coordinates ?? []) visitPath(line);
  } else if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) forEachGeometryPath(child, visitPath);
  }
}

function pointDistanceSquared(point, start, end, cos) {
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
  let latitudeSum = 0;
  for (let i = 0; i < points.length; i++) latitudeSum += Number(points[i][1] || 0);
  const cosLatitude = Math.max(0.05, Math.cos((latitudeSum / points.length) * Math.PI / 180));
  const keep = new Uint8Array(points.length); keep[0]=1; keep[points.length-1]=1;
  // Une pile plate évite deux petits tableaux par subdivision Ramer-Douglas-Peucker.
  // Chaque entrée est une paire [début, fin], stockée dans un buffer borné.
  const stack = new Int32Array(points.length * 2);
  let stackLength = 2;
  stack[0] = 0;
  stack[1] = points.length - 1;
  const threshold=tolerance*tolerance;
  while(stackLength){
    const last=stack[--stackLength], first=stack[--stackLength];
    let farthest=-1,max=threshold;
    for(let i=first+1;i<last;i++){const d=pointDistanceSquared(points[i],points[first],points[last],cosLatitude);if(d>max){max=d;farthest=i;}}
    if(farthest>=0){
      keep[farthest]=1;
      stack[stackLength++]=first; stack[stackLength++]=farthest;
      stack[stackLength++]=farthest; stack[stackLength++]=last;
    }
  }
  const result = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}

function simplifyPath(path, tolerance, anchors) {
  if (!Array.isArray(path) || path.length <= 2 || tolerance <= 0) return path;
  const firstKey = coordinateKey(path[0]);
  const lastKey = coordinateKey(path[path.length - 1]);
  const closed = path.length > 3 && firstKey === lastKey;
  const points = closed ? path.slice(0,-1) : path.slice();
  if (points.length <= (closed?3:2)) return path;
  const indices=[];
  for (let i = 0; i < points.length; i++) {
    if ((!closed && (i === 0 || i === points.length - 1))
      || anchors.has(coordinateKey(points[i]))) indices.push(i);
  }
  if(closed){
    if(indices.length===1){let far=0,dist=-1;for(let i=0;i<points.length;i++){const d=(Number(points[i][0])-Number(points[indices[0]][0]))**2+(Number(points[i][1])-Number(points[indices[0]][1]))**2;if(d>dist){dist=d;far=i;}}if(far!==indices[0])indices.push(far);}
    if(indices.length===0){let far=1,dist=-1;for(let i=1;i<points.length;i++){const d=(Number(points[i][0])-Number(points[0][0]))**2+(Number(points[i][1])-Number(points[0][1]))**2;if(d>dist){dist=d;far=i;}}indices.push(0,far);}
  }
  indices.sort((a, b) => a - b);
  let writeIndex = 0;
  for (let i = 0; i < indices.length; i++) {
    if (i === 0 || indices[i] !== indices[i - 1]) indices[writeIndex++] = indices[i];
  }
  indices.length = writeIndex;
  const sorted = indices;
  if (!sorted.length) return path;
  const result=[];
  if(!closed){
    for (let s = 0; s < sorted.length - 1; s++) {
      const a = sorted[s], b = sorted[s + 1];
      const part = simplifyOpen(points.slice(a, b + 1), tolerance);
      for (let i = s ? 1 : 0; i < part.length; i++) result.push(part[i]);
    }
  }else{
    for (let s = 0; s < sorted.length; s++) {
      const a = sorted[s], b = sorted[(s + 1) % sorted.length];
      const segment = [];
      let i = a;
      while (true) {
        segment.push(points[i]);
        if (i === b) break;
        i = (i + 1) % points.length;
      }
      const part = simplifyOpen(segment, tolerance);
      for (let j = s ? 1 : 0; j < part.length; j++) result.push(part[j]);
    }
  }
  const unique = [];
  let previousKey = null;
  for (const point of result) {
    const key = coordinateKey(point);
    if (!unique.length || key !== previousKey) {
      unique.push(point);
      previousKey = key;
    }
  }
  if (closed) {
    if (unique.length < 3) return path;
    if (coordinateKey(unique[0]) !== previousKey) unique.push(unique[0]);
  }
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
/** Collecte les sommets communs à plusieurs couches GeoJSON avant leur LOD indépendant. */
export function collectSharedGeometryAnchors(collections = []) {
  const occurrences = new Map();
  const countPathOccurrences = path => {
    const seenInPath = new Set();
    for (const point of path) {
      const key = coordinateKey(point);
      if (!key || seenInPath.has(key)) continue;
      seenInPath.add(key);
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
  };
  for (const collection of collections) {
    for (const feature of collection?.features ?? []) {
      forEachGeometryPath(feature?.geometry, countPathOccurrences);
    }
  }
  const anchors = new Set();
  for (const [key, count] of occurrences) if (count > 1) anchors.add(key);
  return anchors;
}

export function simplifyGeoJsonCollection(collection, tolerance = DEFAULT_TOLERANCE, externalAnchors = null) {
  if(!collection?.features||!Number.isFinite(tolerance)||tolerance<=0)return collection;
  // Compte les occurrences au fil du parcours : ne conserve pas un second
  // tableau contenant toutes les références de chemins de la collection.
  const occurrences = new Map();
  const countPathOccurrences = path => {
    const seenInPath = new Set();
    for (const point of path) {
      const key = coordinateKey(point);
      if (!key || seenInPath.has(key)) continue;
      seenInPath.add(key);
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
  };
  for (const feature of collection.features) {
    forEachGeometryPath(feature?.geometry, countPathOccurrences);
  }
  const sharedAnchors = new Set(externalAnchors ?? []);
  for (const [key, count] of occurrences) if (count > 1) sharedAnchors.add(key);
  let originalVertices=0,simplifiedVertices=0,changedFeatures=0;
  const features=collection.features.map(feature=>{
    if(!feature?.geometry)return feature;
    const before=countGeometryVertices(feature.geometry);
    originalVertices+=before;
    const geometry=simplifyGeometry(feature.geometry,tolerance,sharedAnchors);
    const after=countGeometryVertices(geometry);
    simplifiedVertices+=after;
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
  const normalizedLevels = [];
  for (const level of levels) {
    if (!Number.isFinite(level?.maxZoom) || !Number.isFinite(level?.tolerance) || level.tolerance <= 0) continue;
    normalizedLevels.push({ maxZoom: level.maxZoom, tolerance: level.tolerance });
  }
  normalizedLevels.sort((a, b) => a.maxZoom - b.maxZoom);
  let normalizedCount = 0;
  for (const level of normalizedLevels) {
    if (normalizedCount && normalizedLevels[normalizedCount - 1].maxZoom === level.maxZoom) {
      normalizedLevels[normalizedCount - 1] = level;
    } else {
      normalizedLevels[normalizedCount++] = level;
    }
  }
  normalizedLevels.length = normalizedCount;
  const sharedAnchors = options.sharedAnchors instanceof Set
    ? options.sharedAnchors : new Set(options.sharedAnchors ?? []);
  const cache = new Map();
  const generationSamples = [];
  const pending = new Map();
  const workerJobs = new Map();
  let generatedLevels = 0;
  let removedVertices = 0;
  let worker = null;
  let workerInitializationSent = false;
  let workerCollectionTransfers = 0;
  let workerJobsCompleted = 0;
  let workerCreationAttempts = 0;
  let workerCreationFailures = 0;
  let workerRuntimeFailures = 0;
  let workerSyncFallbackJobs = 0;
  let workerFailed = false;
  let disposed = false;
  let nextWorkerRequestId = 1;

  const now = () => globalThis.performance?.now?.() ?? Date.now();

  function recordResult(tolerance, result, durationMs) {
    cache.set(tolerance, result);
    generationSamples.push(Math.max(0, durationMs));
    generatedLevels += 1;
    removedVertices += result?.geometryStats?.removedVertices ?? 0;
  }

  function getLevelForZoom(zoom = 1) {
    const value = Number(zoom);
    if (!Number.isFinite(value) || !normalizedLevels.length) return null;
    let low = 0, high = normalizedLevels.length - 1, candidate = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (value <= normalizedLevels[middle].maxZoom) {
        candidate = middle;
        high = middle - 1;
      } else low = middle + 1;
    }
    if (candidate < 0) return null;
    const level = normalizedLevels[candidate];
    return level.tolerance > baseTolerance ? level : null;
  }

  function getForZoom(zoom = 1) {
    if (!baseCollection?.features) return baseCollection;
    const level = getLevelForZoom(zoom);
    if (!level) return baseCollection;
    if (cache.has(level.tolerance)) return cache.get(level.tolerance);
    // Lorsque le Worker est configuré, ne jamais lancer une simplification lourde
    // pendant le rendu. Le niveau de base reste affiché jusqu'à la réponse du Worker.
    if (typeof options.createWorker === "function" && !workerFailed) return baseCollection;
    const startedAt = now();
    const generalized = simplifyGeoJsonCollection(baseCollection, level.tolerance, sharedAnchors);
    recordResult(level.tolerance, generalized, now() - startedAt);
    return generalized;
  }

  function getAdjacentZoom(zoom = 1, direction = 1) {
    if (!normalizedLevels.length) return null;
    const current = Number(zoom);
    if (!Number.isFinite(current)) return null;
    if (direction >= 0) {
      const active = getLevelForZoom(current);
      return active ? active.maxZoom + 0.001 : null;
    }
    let low = 0, high = normalizedLevels.length - 1, candidate = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (normalizedLevels[middle].maxZoom < current) {
        candidate = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    for (let index = candidate; index >= 0; index--) {
      if (normalizedLevels[index].tolerance > baseTolerance) return normalizedLevels[index].maxZoom;
    }
    return null;
  }

  function prepareAdjacent(zoom = 1, direction = 1) {
    const targetZoom = getAdjacentZoom(zoom, direction);
    if (targetZoom === null) return false;
    const before = generatedLevels;
    getForZoom(targetZoom);
    return generatedLevels > before;
  }

  function settleWorkerJob(requestId, result, failed = false) {
    const job = workerJobs.get(requestId);
    if (!job) return;
    workerJobs.delete(requestId);
    pending.delete(job.tolerance);
    if (result) {
      workerJobsCompleted += 1;
      recordResult(job.tolerance, result, now() - job.startedAt);
      job.resolve(true);
    } else {
      if (failed && job.fallback) workerSyncFallbackJobs += 1;
      job.resolve(failed ? (job.fallback?.() ?? false) : false);
    }
  }

  function failWorker() {
    if (workerFailed || disposed) return;
    workerRuntimeFailures += 1;
    workerFailed = true;
    try { worker?.terminate?.(); } catch { /* arrêt du worker best-effort */ }
    worker = null;
    for (const requestId of [...workerJobs.keys()]) settleWorkerJob(requestId, null, true);
  }

  function getWorker() {
    if (disposed || worker || workerFailed || typeof options.createWorker !== "function") return worker;
    workerCreationAttempts += 1;
    try { worker = options.createWorker(); } catch { worker = null; }
    if (!worker) {
      workerCreationFailures += 1;
      return null;
    }
    worker.onmessage = event => {
      const data = event?.data ?? {};
      if (data.type === "ready") return;
      if (data.requestId === undefined) return;
      if (data.error) {
        failWorker();
        return;
      }
      settleWorkerJob(data.requestId, data.result ?? null, false);
    };
    worker.onerror = failWorker;
    return worker;
  }

  function prepareLevelAsync(level, fallback) {
    if (disposed || !level || cache.has(level.tolerance)) return Promise.resolve(false);
    if (pending.has(level.tolerance)) return pending.get(level.tolerance);
    const activeWorker = getWorker();
    if (!activeWorker) {
      workerSyncFallbackJobs += 1;
      return Promise.resolve(fallback());
    }
    const requestId = nextWorkerRequestId++;
    let resolveJob;
    const promise = new Promise(resolve => { resolveJob = resolve; });
    workerJobs.set(requestId, { tolerance: level.tolerance, startedAt: now(), resolve: resolveJob, fallback });
    pending.set(level.tolerance, promise);
    try {
      // La collection est clonée une seule fois ; les niveaux suivants réutilisent
      // la copie conservée dans le Worker.
      if (!workerInitializationSent) {
        activeWorker.postMessage({ type: "init", collection: baseCollection, sharedAnchors: [...sharedAnchors] });
        workerInitializationSent = true;
        workerCollectionTransfers += 1;
      }
      activeWorker.postMessage({ type: "simplify", requestId, tolerance: level.tolerance });
    } catch {
      failWorker();
    }
    return promise;
  }

  function prepareZoomAsync(zoom = 1) {
    if (disposed) return Promise.resolve(false);
    const level = getLevelForZoom(zoom);
    if (!level || !baseCollection?.features || cache.has(level.tolerance)) return Promise.resolve(false);
    return prepareLevelAsync(level, () => {
      const startedAt = now();
      recordResult(level.tolerance, simplifyGeoJsonCollection(baseCollection, level.tolerance, sharedAnchors), now() - startedAt);
      return true;
    });
  }

  function prepareAdjacentAsync(zoom = 1, direction = 1) {
    if (disposed) return Promise.resolve(false);
    const targetZoom = getAdjacentZoom(zoom, direction);
    if (targetZoom === null || !baseCollection?.features) return Promise.resolve(false);
    let level = null;
    for (let index = 0; index < normalizedLevels.length; index++) {
      if (targetZoom <= normalizedLevels[index].maxZoom) {
        level = normalizedLevels[index];
        break;
      }
    }
    return prepareLevelAsync(level, () => prepareAdjacent(zoom, direction));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    try { worker?.terminate?.(); } catch { /* arrêt du worker best-effort */ }
    worker = null;
    for (const job of workerJobs.values()) job.resolve(false);
    workerJobs.clear();
    pending.clear();
  }

  return {
    getForZoom,
    prepareAdjacent,
    prepareAdjacentAsync,
    prepareZoomAsync,
    getAdjacentZoom,
    dispose,
    getStats() {
      return {
        generatedLevels,
        cachedLevels: cache.size,
        configuredLevels: normalizedLevels.length,
        generationTimeMs: sumValues(generationSamples),
        lastGenerationMs: generationSamples.at(-1) ?? 0,
        removedVertices,
        cachedTolerances: [...cache.keys()],
        workerCollectionTransfers,
        workerJobsCompleted,
        workerCreationAttempts,
        workerCreationFailures,
        workerRuntimeFailures,
        workerSyncFallbackJobs,
        workerActive: Boolean(worker && !workerFailed)
      };
    }
  };
}
