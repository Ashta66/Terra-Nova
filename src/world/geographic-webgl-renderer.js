import { createGeographicMeshCache, buildGeographicLineMesh } from "./geographic-webgl.js";

const VERTEX_SHADER = `
attribute vec2 a_coordinate;
attribute float a_longitude_anchor;
uniform vec2 u_center;
uniform float u_zoom;
void main() {
  float anchor = a_longitude_anchor;
  anchor += 360.0 * floor((u_center.x - anchor) / 360.0 + 0.5);
  float longitude = a_coordinate.x + (anchor - a_longitude_anchor);
  float x = (longitude - u_center.x) * u_zoom / 180.0;
  float y = (a_coordinate.y - u_center.y) * u_zoom / 90.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
`;

const LINE_VERTEX_SHADER = `
attribute vec2 a_coordinate;
attribute vec2 a_other;
attribute float a_side;
attribute vec2 a_join_offset;
attribute float a_is_join;
attribute float a_longitude_anchor;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_viewport;
uniform float u_line_width;
void main() {
  float anchor = a_longitude_anchor;
  anchor += 360.0 * floor((u_center.x - anchor) / 360.0 + 0.5);
  float longitudeShift = anchor - a_longitude_anchor;
  float longitude = a_coordinate.x + longitudeShift;
  float otherLongitude = a_other.x + longitudeShift;
  vec2 point = vec2((longitude - u_center.x) * u_zoom / 180.0,
                    (a_coordinate.y - u_center.y) * u_zoom / 90.0);
  vec2 other = vec2((otherLongitude - u_center.x) * u_zoom / 180.0,
                    (a_other.y - u_center.y) * u_zoom / 90.0);
  vec2 direction = (other - point) * (u_viewport * 0.5);
  vec2 normal = vec2(-direction.y, direction.x) / max(length(direction), 0.0001);
  vec2 segmentOffset = normal * a_side;
  vec2 offset = mix(segmentOffset, a_join_offset, step(0.5, a_is_join)) * (u_line_width / u_viewport);
  gl_Position = vec4(point + offset, 0.0, 1.0);
}`;

const LINE_FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
  return shader;
}

function makeBatch() { return { positions: [], anchors: [], indices: [], features: 0 }; }

const MAX_CACHED_LAYERS = 12;
const MAX_CACHED_GPU_BYTES = 128 * 1024 * 1024;
const POLYGON_FEATURE_BUCKETS = 8;

const now = () => globalThis.performance?.now?.() ?? Date.now();

function hasSupportedLineCoordinates(mesh) {
  if (!mesh?.supported) return false;
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 2) {
    if (positions[index] < -180 || positions[index] > 180) return false;
  }
  return true;
}

function getBoundaryPaths(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : null;
  if (!polygons?.length) return null;
  const paths = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) return null;
      const first = ring[0], last = ring[ring.length - 1];
      const isClosed = Array.isArray(first) && Array.isArray(last)
        && Number(first[0]) === Number(last[0]) && Number(first[1]) === Number(last[1]);
      paths.push(isClosed ? ring : [...ring, first]);
    }
  }
  return paths;
}

export function buildRibbonBuffer(segmentGroups, gl, message = "Impossible de créer le buffer de lignes.") {
  let segmentCount = 0;
  const endpointGroups = [];
  for (const group of segmentGroups ?? []) {
    if (!group || group.length < 4) continue;
    const endpoints = new Map();
    for (let index = 0; index + 3 < group.length; index += 4) {
      segmentCount++;
      const ax = group[index], ay = group[index + 1];
      const bx = group[index + 2], by = group[index + 3];
      // Les coordonnées proviennent déjà du maillage Float32 : deux sommets
      // raccordés partagent la même valeur. Ne pas arrondir ici, car deux
      // extrémités distinctes très proches doivent garder chacune leur cap.
      endpoints.set(`${ax},${ay}`, [ax, ay]);
      endpoints.set(`${bx},${by}`, [bx, by]);
    }
    endpointGroups.push(endpoints);
  }
  if (!segmentCount) {
    return { lineBuffer: null, vertexCount: 0, drawnFeatures: 0, skippedFeatures: 0, positions: new Float32Array() };
  }

  const joinVertexCount = endpointGroups.reduce((sum, endpoints) => sum + endpoints.size * 36, 0);
  const data = new Float32Array((segmentCount * 6 + joinVertexCount) * 9);
  let cursor = 0;
  let currentLongitudeAnchor = 0;
  const appendVertex = (ax, ay, bx, by, side, joinX = 0, joinY = 0, isJoin = 0) => {
    data[cursor++] = ax; data[cursor++] = ay;
    data[cursor++] = bx; data[cursor++] = by;
    data[cursor++] = side;
    data[cursor++] = joinX; data[cursor++] = joinY;
    data[cursor++] = isJoin;
    data[cursor++] = currentLongitudeAnchor;
  };
  const steps = 12;
  const appendDisk = (x, y) => {
    for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
      const a = stepIndex * Math.PI * 2 / steps;
      const b = (stepIndex + 1) * Math.PI * 2 / steps;
      appendVertex(x, y, x, y, 0, 0, 0, 1);
      appendVertex(x, y, x, y, 0, Math.cos(a), Math.sin(a), 1);
      appendVertex(x, y, x, y, 0, Math.cos(b), Math.sin(b), 1);
    }
  };

  let groupIndex = 0;
  for (const group of segmentGroups ?? []) {
    if (!group || group.length < 4) continue;
    currentLongitudeAnchor = group[0];
    for (let index = 0; index + 3 < group.length; index += 4) {
      const ax = group[index], ay = group[index + 1];
      const bx = group[index + 2], by = group[index + 3];
      appendVertex(ax, ay, bx, by, -1);
      appendVertex(ax, ay, bx, by, 1);
      appendVertex(bx, by, ax, ay, -1);
      appendVertex(bx, by, ax, ay, -1);
      appendVertex(ax, ay, bx, by, 1);
      appendVertex(bx, by, ax, ay, 1);
    }
    for (const [x, y] of endpointGroups[groupIndex++].values()) appendDisk(x, y);
  }

  const lineBuffer = gl.createBuffer();
  if (!lineBuffer) throw new Error(message);
  const uploadStartedAt = now();
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
  } catch (error) {
    gl.deleteBuffer(lineBuffer);
    throw error;
  }
  return { lineBuffer, vertexCount: cursor / 9, drawnFeatures: 0, skippedFeatures: 0,
    positions: data, bufferUploadMs: Math.max(0, now() - uploadStartedAt) };
}

function buildLineBatch(features, gl) {
  const geometryStartedAt = now();
  const segmentGroups = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const geometry = feature?.geometry;
    const lines = geometry?.type === "LineString" ? [geometry.coordinates]
      : geometry?.type === "MultiLineString" ? geometry.coordinates : null;
    if (!lines?.length) { skippedFeatures++; continue; }
    const featureGroups = [];
    let valid = true;
    for (const coordinates of lines) {
      const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates } });
      if (!hasSupportedLineCoordinates(mesh)) { valid = false; break; }
      featureGroups.push(mesh.positions);
    }
    if (!valid || !featureGroups.length) { skippedFeatures++; continue; }
    segmentGroups.push(...featureGroups);
    drawnFeatures++;
  }
  const geometryBuildMs = Math.max(0, now() - geometryStartedAt);
  return { ...buildRibbonBuffer(segmentGroups, gl, "Impossible de créer le buffer de lignes géographiques."),
    drawnFeatures, skippedFeatures, geometryBuildMs };
}

function buildBoundaryLineBatch(features, gl) {
  const geometryStartedAt = now();
  const segmentGroups = [];
  let drawnFeatures = 0, skippedFeatures = 0;
  for (const feature of features) {
    const paths = getBoundaryPaths(feature);
    if (!paths?.length) { skippedFeatures++; continue; }
    const featureGroups = [];
    let valid = true;
    for (const coordinates of paths) {
      const mesh = buildGeographicLineMesh({ geometry: { type: "LineString", coordinates } });
      if (!hasSupportedLineCoordinates(mesh)) { valid = false; break; }
      featureGroups.push(mesh.positions);
    }
    if (!valid || !featureGroups.length) { skippedFeatures++; continue; }
    segmentGroups.push(...featureGroups);
    drawnFeatures++;
  }
  const geometryBuildMs = Math.max(0, now() - geometryStartedAt);
  return { ...buildRibbonBuffer(segmentGroups, gl, "Impossible de créer le buffer des contours géographiques."),
    drawnFeatures, skippedFeatures, geometryBuildMs };
}

export function isSupportedGeographicBoundary(feature) {
  const paths = getBoundaryPaths(feature);
  return Boolean(paths?.length) && paths.every(coordinates =>
    hasSupportedLineCoordinates(buildGeographicLineMesh({ geometry: { type: "LineString", coordinates } }))
  );
}

function appendMesh(batch, mesh) {
  const offset = batch.positions.length / 2;
  if (offset + mesh.vertexCount > 65535) return false;
  for (const value of mesh.positions) batch.positions.push(value);
  for (const anchor of mesh.anchors) batch.anchors.push(anchor);
  for (const index of mesh.indices) batch.indices.push(offset + index);
  batch.features++;
  return true;
}

/** Rendu GPU des remplissages polygonaux; Canvas conserve les contours et les géométries complexes. */
export function createGeographicWebGLRenderer(gl) {
  if (!gl || typeof gl.createShader !== "function" || typeof gl.drawElements !== "function") {
    throw new TypeError("Contexte WebGL requis.");
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); return null; }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return null;
  }
  const positionLocation = gl.getAttribLocation(program, "a_coordinate");
  const longitudeAnchorLocation = gl.getAttribLocation(program, "a_longitude_anchor");
  const centerLocation = gl.getUniformLocation(program, "u_center");
  const zoomLocation = gl.getUniformLocation(program, "u_zoom");
  const colorLocation = gl.getUniformLocation(program, "u_color");
  const lineVertex = compile(gl, gl.VERTEX_SHADER, LINE_VERTEX_SHADER);
  const lineFragment = compile(gl, gl.FRAGMENT_SHADER, LINE_FRAGMENT_SHADER);
  if (!lineVertex || !lineFragment) {
    if (lineVertex) gl.deleteShader(lineVertex);
    if (lineFragment) gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  const lineProgram = gl.createProgram();
  if (!lineProgram) {
    gl.deleteShader(lineVertex); gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(lineProgram, lineVertex);
  gl.attachShader(lineProgram, lineFragment);
  gl.linkProgram(lineProgram);
  if (!gl.getProgramParameter(lineProgram, gl.LINK_STATUS)) {
    gl.deleteProgram(lineProgram); gl.deleteShader(lineVertex); gl.deleteShader(lineFragment);
    gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    return null;
  }
  const lineCoordinateLocation = gl.getAttribLocation(lineProgram, "a_coordinate");
  const lineOtherLocation = gl.getAttribLocation(lineProgram, "a_other");
  const lineSideLocation = gl.getAttribLocation(lineProgram, "a_side");
  const lineJoinOffsetLocation = gl.getAttribLocation(lineProgram, "a_join_offset");
  const lineIsJoinLocation = gl.getAttribLocation(lineProgram, "a_is_join");
  const lineLongitudeAnchorLocation = gl.getAttribLocation(lineProgram, "a_longitude_anchor");
  const lineCenterLocation = gl.getUniformLocation(lineProgram, "u_center");
  const lineZoomLocation = gl.getUniformLocation(lineProgram, "u_zoom");
  const lineViewportLocation = gl.getUniformLocation(lineProgram, "u_viewport");
  const lineWidthLocation = gl.getUniformLocation(lineProgram, "u_line_width");
  const lineColorLocation = gl.getUniformLocation(lineProgram, "u_color");
  const meshCache = createGeographicMeshCache();
  const featureIds = new WeakMap();
  const lineSupportCache = new WeakMap();
  const boundarySupportCache = new WeakMap();
  let nextFeatureId = 1;
  const layerCaches = new Map();
  let disposed = false;

  function featureId(feature) {
    if (!feature || typeof feature !== "object") return 0;
    let id = featureIds.get(feature);
    if (!id) { id = nextFeatureId++; featureIds.set(feature, id); }
    return id;
  }

  function releaseBatches(batches) {
    for (const batch of batches ?? []) {
      if (batch.vertexBuffer) gl.deleteBuffer(batch.vertexBuffer);
      if (batch.anchorBuffer) gl.deleteBuffer(batch.anchorBuffer);
      if (batch.elementBuffer) gl.deleteBuffer(batch.elementBuffer);
      if (batch.lineBuffer) gl.deleteBuffer(batch.lineBuffer);
    }
  }

  function buildBatches(features) {
    const geometryStartedAt = now();
    const batches = [makeBatch()];
    let drawnFeatures = 0;
    let skippedFeatures = 0;
    for (const feature of features) {
      const mesh = meshCache.get(feature);
      if (!mesh?.supported) { skippedFeatures++; continue; }
      let batch = batches[batches.length - 1];
      if (batch.positions.length / 2 + mesh.vertexCount > 65535) {
        batch = makeBatch();
        batches.push(batch);
      }
      if (!appendMesh(batch, mesh)) { skippedFeatures++; continue; }
      drawnFeatures++;
    }
    const geometryBuildMs = Math.max(0, now() - geometryStartedAt);
    const gpuBatches = [];
    const uploadStartedAt = now();
    try {
      for (const batch of batches) {
        if (!batch.indices.length) continue;
        const positions = new Float32Array(batch.positions);
        const anchors = new Float32Array(batch.anchors);
        const indices = new Uint16Array(batch.indices);
        let vertexBuffer = null, anchorBuffer = null, elementBuffer = null;
        try {
          vertexBuffer = gl.createBuffer();
          anchorBuffer = gl.createBuffer();
          elementBuffer = gl.createBuffer();
          if (!vertexBuffer || !anchorBuffer || !elementBuffer) {
            throw new Error("Impossible de créer les buffers géographiques.");
          }
        } catch (error) {
          if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
          if (anchorBuffer) gl.deleteBuffer(anchorBuffer);
          if (elementBuffer) gl.deleteBuffer(elementBuffer);
          throw error;
        }
        const gpuBatch = { positions, anchors, indices, vertexBuffer, anchorBuffer, elementBuffer, triangles: indices.length / 3 };
        gpuBatches.push(gpuBatch);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, anchorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, anchors, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW ?? gl.DYNAMIC_DRAW);
      }
    } catch (error) {
      releaseBatches(gpuBatches);
      throw error;
    }
    return { batches: gpuBatches, drawnFeatures, skippedFeatures, geometryBuildMs,
      bufferUploadMs: Math.max(0, now() - uploadStartedAt) };
  }

  function sameFeatureRefs(a = [], b = []) {
    return a.length === b.length && a.every((feature, index) => feature === b[index]);
  }

  function buildIncrementalPolygonLayer(features, previous) {
    const previousChunks = previous?.chunks instanceof Map ? previous.chunks : new Map();
    const grouped = new Map();
    for (const feature of features) {
      const bucket = featureId(feature) % POLYGON_FEATURE_BUCKETS;
      if (!grouped.has(bucket)) grouped.set(bucket, []);
      grouped.get(bucket).push(feature);
    }
    const chunks = new Map(), newlyBuiltBatches = [];
    let drawnFeatures = 0, skippedFeatures = 0;
    let geometryBuildMs = 0, bufferUploadMs = 0, uploadedBytes = 0, bufferUploads = 0;
    let cacheBuildMs = 0, reusedChunks = 0;
    try {
      for (const [bucket, featureRefs] of grouped) {
        featureRefs.sort((a, b) => featureId(a) - featureId(b));
        const oldChunk = previousChunks.get(bucket);
        let chunk;
        if (oldChunk && sameFeatureRefs(oldChunk.featureRefs, featureRefs)) {
          chunk = oldChunk;
          reusedChunks++;
        } else {
          const startedAt = now();
          const built = buildBatches(featureRefs);
          newlyBuiltBatches.push(...built.batches);
          cacheBuildMs += Math.max(0, now() - startedAt);
          geometryBuildMs += built.geometryBuildMs;
          bufferUploadMs += built.bufferUploadMs;
          const bytes = built.batches.reduce((sum, batch) =>
            sum + batch.positions.byteLength + batch.anchors.byteLength + batch.indices.byteLength, 0);
          const uploads = built.batches.length * 3;
          uploadedBytes += bytes;
          bufferUploads += uploads;
          chunk = { bucket, featureRefs, ...built, uploadedBytes: bytes, bufferUploads: uploads };
        }
        drawnFeatures += chunk.drawnFeatures;
        skippedFeatures += chunk.skippedFeatures;
        chunks.set(bucket, chunk);
      }
    } catch (error) {
      releaseBatches(newlyBuiltBatches);
      throw error;
    }
    // Publication is atomic: only after every changed chunk built successfully
    // may replaced or removed buffers from the previous cache be released.
    for (const [bucket, oldChunk] of previousChunks) {
      if (chunks.get(bucket) !== oldChunk) releaseBatches(oldChunk.batches);
    }
    const batches = [...chunks.values()].flatMap(chunk => chunk.batches);
    return {
      type: "polygons", featuresRef: features, featureRefs: [...features], chunks, batches,
      drawnFeatures, skippedFeatures, geometryBuildMs, bufferUploadMs, cacheBuildMs,
      uploadedBytes, bufferUploads,
      cacheHit: chunks.size === previousChunks.size && reusedChunks === chunks.size
    };
  }

  function getRetainedGpuBytes() {
    let total = 0;
    for (const cached of layerCaches.values()) {
      if (cached.type === "polygons") {
        for (const batch of cached.batches ?? []) total += batch.positions.byteLength + batch.anchors.byteLength + batch.indices.byteLength;
      } else {
        total += cached.positions?.byteLength ?? 0;
      }
    }
    return total;
  }

  function evictGpuCache(activeKeys) {
    let retainedBytes = getRetainedGpuBytes();
    let evictedLayers = 0;
    while (retainedBytes > MAX_CACHED_GPU_BYTES) {
      const oldestKey = [...layerCaches.keys()].find(key => !activeKeys.has(key));
      if (oldestKey === undefined) break;
      const oldest = layerCaches.get(oldestKey);
      releaseBatches(oldest?.batches);
      if (oldest?.lineBuffer) gl.deleteBuffer(oldest.lineBuffer);
      layerCaches.delete(oldestKey);
      evictedLayers++;
      retainedBytes = getRetainedGpuBytes();
    }
    return { retainedBytes, evictedLayers };
  }

  function renderLayers(layers, width, height, viewport = {}) {
    const renderStartedAt = now();
    const empty = { drawnFeatures: 0, skippedFeatures: 0, drawCalls: 0, triangles: 0,
      cacheHit: false, bufferUploads: 0, uploadedBytes: 0, cacheBuildMs: 0,
      geometryBuildMs: 0, bufferUploadMs: 0, drawSubmitMs: 0, totalMs: 0,
      cachedGpuBytes: 0, layers: {} };
    if (disposed) return empty;
    const zoom = Number(viewport.zoom ?? 1);
    const centerLongitude = Number(viewport.centerLongitude ?? 0);
    const centerLatitude = Number(viewport.centerLatitude ?? 0);
    if (![width, height, zoom, centerLongitude, centerLatitude].every(Number.isFinite)
      || width <= 0 || height <= 0 || zoom <= 0) return empty;
    const layerList = layers ?? [];
    const seenKeys = new Set();
    const prepared = [];
    let drawnFeatures = 0, skippedFeatures = 0, drawCalls = 0, triangles = 0;
    let bufferUploads = 0, uploadedBytes = 0, allCacheHits = layerList.length > 0;
    for (let index = 0; index < layerList.length; index++) {
      const layer = layerList[index] ?? {};
      const key = String(layer.key ?? index);
      if (seenKeys.has(key)) throw new Error("Chaque couche WebGL doit avoir une clé unique.");
      seenKeys.add(key);
      const features = layer.features ?? [];
      const type = layer.type === "lines" || layer.type === "boundaries" ? layer.type : "polygons";
      let cached = layerCaches.get(key);
      let cacheHit = false;
      let cacheBuildMs = 0;
      if (type === "polygons") {
        const next = buildIncrementalPolygonLayer(features, cached?.type === type ? cached : null);
        cacheHit = next.cacheHit;
        cacheBuildMs = next.cacheBuildMs;
        cached = next;
        layerCaches.set(key, cached);
      } else {
        const sameFeatures = Boolean(cached && cached.type === type && (
          cached.featuresRef === features
          || (cached.featureRefs.length === features.length
            && cached.featureRefs.every((feature, featureIndex) => feature === features[featureIndex]))
        ));
        cacheHit = sameFeatures;
        if (!cacheHit) {
          const buildStartedAt = now();
          const next = type === "lines" ? buildLineBatch(features, gl) : buildBoundaryLineBatch(features, gl);
          cacheBuildMs = Math.max(0, now() - buildStartedAt);
          releaseBatches(cached?.batches);
          if (cached?.lineBuffer) gl.deleteBuffer(cached.lineBuffer);
          cached = { type, featuresRef: features, featureRefs: [...features], ...next };
          layerCaches.set(key, cached);
        }
      }
      allCacheHits = allCacheHits && cacheHit;
      const layerDrawCalls = type !== "polygons" ? (cached.vertexCount ? 1 : 0) : cached.batches.length;
      const layerTriangles = type !== "polygons"
        ? Math.floor((cached.vertexCount ?? 0) / 3)
        : cached.batches.reduce((sum, batch) => sum + batch.triangles, 0);
      const layerBytes = type === "polygons" ? (cached.uploadedBytes ?? 0)
        : cacheHit ? 0 : (cached.positions?.byteLength ?? 0);
      const layerUploads = type === "polygons" ? (cached.bufferUploads ?? 0)
        : cacheHit ? 0 : (cached.lineBuffer ? 1 : 0);
      prepared.push({ key, type, color: layer.color ?? [0.32, 0.39, 0.31, 1], lineWidth: Number(layer.lineWidth ?? (key === "rivers" ? 0.7 : 0.55)), cached });
      drawnFeatures += cached.drawnFeatures;
      skippedFeatures += cached.skippedFeatures;
      drawCalls += layerDrawCalls;
      triangles += layerTriangles;
      bufferUploads += layerUploads;
      uploadedBytes += layerBytes;
      empty.cacheBuildMs += cacheBuildMs;
      if (!cacheHit) {
        empty.geometryBuildMs += cached.geometryBuildMs ?? 0;
        empty.bufferUploadMs += cached.bufferUploadMs ?? 0;
      }
      empty.cachedGpuBytes += type === "polygons"
        ? (cached.batches ?? []).reduce((sum, batch) => sum + (batch.positions?.byteLength ?? 0)
          + (batch.anchors?.byteLength ?? 0) + (batch.indices?.byteLength ?? 0), 0)
        : (cached.positions?.byteLength ?? 0);
      empty.layers[key] = { type, drawnFeatures: cached.drawnFeatures, skippedFeatures: cached.skippedFeatures,
        drawCalls: layerDrawCalls, triangles: layerTriangles, vertices: cached.vertexCount ?? 0,
        cacheHit, cacheBuildMs, geometryBuildMs: cacheHit ? 0 : (cached.geometryBuildMs ?? 0),
        bufferUploadMs: cacheHit ? 0 : (cached.bufferUploadMs ?? 0),
        bufferUploads: layerUploads, uploadedBytes: layerBytes };
    }
    // Plusieurs appels renderLayers composent des familles différentes dans le
    // même canvas (terres, détails, frontières). Ne pas invalider les familles
    // absentes de cet appel : elles seront réutilisées au prochain passage.
    // Le LRU borne explicitement la mémoire GPU et évince les couches les moins
    // récemment utilisées plutôt que de tout reconstruire à chaque famille.
    for (const layer of prepared) {
      layerCaches.delete(layer.key);
      layerCaches.set(layer.key, layer.cached);
    }
    while (layerCaches.size > MAX_CACHED_LAYERS) {
      const oldestKey = [...layerCaches.keys()].find(key => !seenKeys.has(key));
      if (oldestKey === undefined) break;
      const oldest = layerCaches.get(oldestKey);
      releaseBatches(oldest?.batches);
      if (oldest?.lineBuffer) gl.deleteBuffer(oldest.lineBuffer);
      layerCaches.delete(oldestKey);
    }
    if (gl.canvas && (gl.canvas.width !== Math.round(width) || gl.canvas.height !== Math.round(height))) {
      gl.canvas.width = Math.round(width);
      gl.canvas.height = Math.round(height);
    }
    gl.viewport(0, 0, Math.round(width), Math.round(height));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const drawStartedAt = now();
    gl.useProgram(program);
    gl.uniform2f(centerLocation, centerLongitude, centerLatitude);
    gl.uniform1f(zoomLocation, zoom);
    const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const resetVertexAttribArrays = (activeLocations) => {
      const active = new Set(activeLocations.filter(location => Number.isInteger(location) && location >= 0));
      for (let location = 0; location < maxVertexAttribs; location++) {
        if (!active.has(location)) gl.disableVertexAttribArray(location);
      }
    };

    for (const layer of prepared) {
      const layerDrawStartedAt = now();
      if (layer.type === "lines" || layer.type === "boundaries") {
        if (!layer.cached.lineBuffer || !layer.cached.vertexCount) {
          empty.layers[layer.key].drawSubmitMs = 0;
          continue;
        }
        gl.useProgram(lineProgram);
        gl.uniform2f(lineCenterLocation, centerLongitude, centerLatitude);
        gl.uniform1f(lineZoomLocation, zoom);
        gl.uniform2f(lineViewportLocation, Math.round(width), Math.round(height));
        gl.uniform1f(lineWidthLocation, Math.max(0.25, Number.isFinite(layer.lineWidth) ? layer.lineWidth : 0.55));
        gl.uniform4fv(lineColorLocation, layer.color);
        // Les attributs sont globaux au contexte WebGL, pas propres au programme.
        // Désactive ceux laissés par un autre programme avant de configurer les rubans.
        resetVertexAttribArrays([
          lineCoordinateLocation, lineOtherLocation, lineSideLocation,
          lineJoinOffsetLocation, lineIsJoinLocation, lineLongitudeAnchorLocation
        ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.cached.lineBuffer);
        gl.enableVertexAttribArray(lineCoordinateLocation);
        gl.vertexAttribPointer(lineCoordinateLocation, 2, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(lineOtherLocation);
        gl.vertexAttribPointer(lineOtherLocation, 2, gl.FLOAT, false, 36, 8);
        gl.enableVertexAttribArray(lineSideLocation);
        gl.vertexAttribPointer(lineSideLocation, 1, gl.FLOAT, false, 36, 16);
        gl.enableVertexAttribArray(lineJoinOffsetLocation);
        gl.vertexAttribPointer(lineJoinOffsetLocation, 2, gl.FLOAT, false, 36, 20);
        gl.enableVertexAttribArray(lineIsJoinLocation);
        gl.vertexAttribPointer(lineIsJoinLocation, 1, gl.FLOAT, false, 36, 28);
        gl.enableVertexAttribArray(lineLongitudeAnchorLocation);
        gl.vertexAttribPointer(lineLongitudeAnchorLocation, 1, gl.FLOAT, false, 36, 32);
        gl.drawArrays(gl.TRIANGLES, 0, layer.cached.vertexCount);
      } else {
        gl.useProgram(program);
        gl.uniform4fv(colorLocation, layer.color);
        // Les attributs activés par le programme des lignes peuvent référencer
        // des buffers déjà libérés. Ne conserver que l'attribut polygonal requis.
        resetVertexAttribArrays([positionLocation, longitudeAnchorLocation]);
        for (const batch of layer.cached.batches) {
          // Un buffer supprimé (par éviction ou perte de contexte) laisse l'attribut
          // actif sans source valide et provoque INVALID_OPERATION à drawElements.
          // Le renderer appelant peut alors basculer proprement sur Canvas.
          if (typeof gl.isBuffer === "function"
            && (!gl.isBuffer(batch.vertexBuffer) || !gl.isBuffer(batch.anchorBuffer)
              || !gl.isBuffer(batch.elementBuffer))) {
            throw new Error("Cache WebGL géographique invalide : buffer polygonal indisponible.");
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);
          gl.enableVertexAttribArray(positionLocation);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, batch.anchorBuffer);
          gl.enableVertexAttribArray(longitudeAnchorLocation);
          gl.vertexAttribPointer(longitudeAnchorLocation, 1, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.elementBuffer);
          gl.drawElements(gl.TRIANGLES, batch.indices.length, gl.UNSIGNED_SHORT, 0);
        }
      }
      empty.layers[layer.key].drawSubmitMs = Math.max(0, now() - layerDrawStartedAt);
    }
    empty.drawSubmitMs = Math.max(0, now() - drawStartedAt);
    empty.totalMs = Math.max(0, now() - renderStartedAt);
    const memory = evictGpuCache(new Set(prepared.map(layer => layer.key)));
    empty.cachedGpuBytes = memory.retainedBytes;
    return { drawnFeatures, skippedFeatures, drawCalls, triangles, cacheHit: allCacheHits,
      bufferUploads, uploadedBytes, cacheBuildMs: empty.cacheBuildMs,
      geometryBuildMs: empty.geometryBuildMs, bufferUploadMs: empty.bufferUploadMs,
      cachedGpuBytes: empty.cachedGpuBytes, cacheBudgetBytes: MAX_CACHED_GPU_BYTES,
      cacheEvictedLayers: memory.evictedLayers, drawSubmitMs: empty.drawSubmitMs,
      totalMs: empty.totalMs, layers: empty.layers };
  }

  function render(features, width, height, viewport = {}, color = [0.32, 0.39, 0.31, 1]) {
    return renderLayers([{ key: "default", features, color }], width, height, viewport);
  }

  function clearLayerCache() {
    for (const cached of layerCaches.values()) {
      releaseBatches(cached.batches);
      if (cached.lineBuffer) gl.deleteBuffer(cached.lineBuffer);
    }
    layerCaches.clear();
  }

  return {
    canvas: gl.canvas ?? null,
    supports(feature) { return Boolean(meshCache.get(feature)?.supported); },
    supportsBoundary(feature) {
      if (!feature || typeof feature !== "object") return false;
      const cached = boundarySupportCache.get(feature);
      if (cached !== undefined) return cached;
      const supported = isSupportedGeographicBoundary(feature);
      boundarySupportCache.set(feature, supported);
      return supported;
    },
    supportsLine(feature) {
      if (!feature || typeof feature !== "object") return false;
      const cached = lineSupportCache.get(feature);
      if (cached !== undefined) return cached;
      const supported = hasSupportedLineCoordinates(buildGeographicLineMesh(feature));
      lineSupportCache.set(feature, supported);
      return supported;
    },
    render,
    renderLayers,
    clearLayerCache,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearLayerCache();
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(lineProgram);
      gl.deleteShader(lineVertex);
      gl.deleteShader(lineFragment);
    }
  };
}