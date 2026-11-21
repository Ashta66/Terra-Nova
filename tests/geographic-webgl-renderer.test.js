import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRibbonBuffer, createGeographicWebGLRenderer } from "../src/world/geographic-webgl-renderer.js";
import { buildGeographicLineMesh, buildGeographicPolygonMesh } from "../src/world/geographic-webgl.js";

function createMockGl() {
  let nextId = 0;
  const uploaded = [];
  const deleted = new Set();
  const gl = {
    canvas: { width: 0, height: 0 },
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, DYNAMIC_DRAW: 8,
    COLOR_BUFFER_BIT: 9, BLEND: 10, SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12,
    FLOAT: 13, TRIANGLES: 14, UNSIGNED_SHORT: 15, MAX_VERTEX_ATTRIBS: 0x8869,
    createShader: () => ({ id: ++nextId }),
    shaderSource() {}, compileShader() {}, getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({ id: ++nextId }), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getAttribLocation: () => 0, getUniformLocation: () => ({}),
    deleteProgram() {},
    createBuffer: () => ({ id: ++nextId }),
    deleteBuffer(buffer) { deleted.add(buffer); },
    bindBuffer() {},
    bufferData(_target, data) { uploaded.push(data.byteLength); },
    getParameter(parameter) { return parameter === this.MAX_VERTEX_ATTRIBS ? 16 : null; },
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {},
    useProgram() {}, uniform2f() {}, uniform1f() {}, uniform4fv() {},
    enableVertexAttribArray() {}, disableVertexAttribArray() {}, vertexAttribPointer() {}, drawArrays() {}, drawElements() {}
  };
  return { gl, uploaded, deleted };
}

function polygonFeature(offset = 0) {
  return {
    type: "Feature",
    properties: { id: offset },
    geometry: { type: "Polygon", coordinates: [[
      [offset, 0], [offset + 0.8, 0], [offset + 0.8, 0.8],
      [offset, 0.8], [offset, 0]
    ]] }
  };
}

test("le cache WebGL polygonal ne reconstruit que le bloc de features modifié", () => {
  const { gl, uploaded } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 65 }, (_, index) => polygonFeature(index));
  const viewport = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };

  const first = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  assert.equal(first.cacheHit, false);
  assert.equal(first.bufferUploads, 16, "les huit compartiments stables produisent chacun un buffer vertex et index");
  assert.equal(first.drawCalls, 8);
  const initialUploadBytes = first.uploadedBytes;
  assert.ok(initialUploadBytes > 0);

  const changed = features.slice();
  changed.push(polygonFeature(65));
  const second = renderer.renderLayers([{ key: "land", type: "polygons", features: changed }], 800, 400, viewport);
  assert.equal(second.cacheHit, false);
  assert.equal(second.bufferUploads, 2, "seul le compartiment contenant la feature modifiée doit être réuploadé");
  assert.equal(second.drawCalls, 8);
  assert.ok(second.uploadedBytes < initialUploadBytes);

  const third = renderer.renderLayers([{ key: "land", type: "polygons", features: changed.slice() }], 800, 400, viewport);
  assert.equal(third.cacheHit, true, "une nouvelle liste avec les mêmes références doit réutiliser les deux blocs");
  assert.equal(third.bufferUploads, 0);
  assert.equal(third.uploadedBytes, 0);
  assert.equal(uploaded.length, 18);
  renderer.dispose();
});

test("le renderer expose le budget mémoire GPU et libère les buffers à dispose", () => {
  const { gl, deleted } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = [polygonFeature(0)];
  const result = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(result.cacheBudgetBytes, 128 * 1024 * 1024);
  assert.ok(result.cachedGpuBytes > 0);
  renderer.dispose();
  assert.ok(deleted.size >= 2);
});


test("le renderer refuse un buffer polygonal WebGL invalide avant drawElements", () => {
  const { gl } = createMockGl();
  gl.isBuffer = () => false;
  const renderer = createGeographicWebGLRenderer(gl);
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }),
  /Cache WebGL géographique invalide/);
  renderer.dispose();
});


test("les jonctions partagées ne créent qu'un raccord par sommet exact", () => {
  const { gl } = createMockGl();
  const group = new Float32Array([
    0, 0, 1, 0,
    1, 0, 1, 1
  ]);
  const result = buildRibbonBuffer([group], gl);
  assert.equal(result.vertexCount, 120, "deux rubans (12 sommets) et trois disques de jonction (108 sommets)");
  result.lineBuffer && gl.deleteBuffer(result.lineBuffer);
});

test("les segments disjoints conservent leurs quatre extrémités", () => {
  const { gl } = createMockGl();
  const group = new Float32Array([
    0, 0, 1, 0,
    2, 0, 3, 0
  ]);
  const result = buildRibbonBuffer([group], gl);
  assert.equal(result.vertexCount, 156, "deux rubans et quatre disques indépendants");
  gl.deleteBuffer(result.lineBuffer);
});

test("deux extrémités distinctes proches ne sont pas fusionnées par arrondi", () => {
  const { gl } = createMockGl();
  const group = new Float32Array([
    0, 0, 1.000001, 0,
    1.000004, 0, 2, 0
  ]);
  const result = buildRibbonBuffer([group], gl);
  assert.equal(result.vertexCount, 156, "les quatre coordonnées exactes doivent garder leurs propres disques");
  gl.deleteBuffer(result.lineBuffer);
});

test("des groupes de lignes distincts ne fusionnent pas leurs extrémités", () => {
  const { gl } = createMockGl();
  const first = new Float32Array([0, 0, 1, 0]);
  const second = new Float32Array([1, 0, 2, 0]);
  const result = buildRibbonBuffer([first, second], gl);
  assert.equal(result.vertexCount, 156, "chaque groupe conserve ses deux extrémités");
  gl.deleteBuffer(result.lineBuffer);
});


test("les raccords circulaires transmettent au shader des offsets écran unitaires", () => {
  const { gl } = createMockGl();
  const result = buildRibbonBuffer([new Float32Array([10, 20, 30, 40])], gl);
  const stride = 8;
  assert.equal(result.vertexCount, 78);
  const joins = result.positions.slice(6 * stride);
  assert.equal(joins.length / stride, 72, "deux extrémités reçoivent chacune un disque de 12 triangles");
  for (let index = 0; index < joins.length; index += stride) {
    const x = joins[index], y = joins[index + 1];
    const otherX = joins[index + 2], otherY = joins[index + 3];
    const offsetX = joins[index + 5], offsetY = joins[index + 6];
    assert.equal(joins[index + 7], 1, "les sommets du disque doivent activer le chemin de raccord du shader");
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(Number.isFinite(otherX) && Number.isFinite(otherY));
    if (offsetX !== 0 || offsetY !== 0) {
      assert.ok(Math.abs(Math.hypot(offsetX, offsetY) - 1) < 1e-6,
        "le contour du disque doit fournir un offset radial de longueur unitaire");
    }
  }
  assert.deepEqual(Array.from(joins.slice(0, 4)), [10, 20, 10, 20]);
  assert.deepEqual(Array.from(joins.slice(36 * stride, 36 * stride + 4)), [30, 40, 30, 40]);
  gl.deleteBuffer(result.lineBuffer);
});


test("le maillage élimine les sommets distincts en double précision mais identiques en Float32", () => {
  const mesh = buildGeographicLineMesh({
    geometry: { type: "LineString", coordinates: [[10, 20], [10 + 1e-7, 20], [11, 20]] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(mesh.positions.length, 4, "le sommet arrondi au même Float32 que le premier ne doit pas créer de segment nul");
  assert.deepEqual(Array.from(mesh.positions), [10, 20, 11, 20]);
});


test("le maillage polygonal ne produit pas de triangles dégénérés après conversion Float32", () => {
  const mesh = buildGeographicPolygonMesh({
    geometry: {
      type: "Polygon",
      coordinates: [[
        [10, 20], [10 + 1e-7, 20], [11, 20],
        [11, 21], [10, 21], [10, 20]
      ]]
    }
  });
  assert.equal(mesh.supported, true);
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] * 2;
    const b = mesh.indices[index + 1] * 2;
    const c = mesh.indices[index + 2] * 2;
    const ax = mesh.positions[a], ay = mesh.positions[a + 1];
    const bx = mesh.positions[b], by = mesh.positions[b + 1];
    const cx = mesh.positions[c], cy = mesh.positions[c + 1];
    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    assert.notEqual(area2, 0, "un triangle ne doit pas s'effondrer en Float32");
  }
});


function polygonAreaFromCoordinates(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const next = (index + 1) % ring.length;
    area += ring[index][0] * ring[next][1] - ring[next][0] * ring[index][1];
  }
  return Math.abs(area) * 0.5;
}

function polygonMeshTriangleArea(mesh) {
  let area = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] * 2;
    const b = mesh.indices[index + 1] * 2;
    const c = mesh.indices[index + 2] * 2;
    const ax = mesh.positions[a], ay = mesh.positions[a + 1];
    const bx = mesh.positions[b], by = mesh.positions[b + 1];
    const cx = mesh.positions[c], cy = mesh.positions[c + 1];
    area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * 0.5;
  }
  return area;
}

test("la triangulation concave couvre exactement la surface du polygone", () => {
  const ring = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [ring] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(polygonMeshTriangleArea(mesh), polygonAreaFromCoordinates(ring.slice(0, -1)));
});

test("la triangulation conserve la surface avec plusieurs sommets colinéaires", () => {
  const ring = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 2], [0, 2], [0, 0]];
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [ring] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(polygonMeshTriangleArea(mesh), polygonAreaFromCoordinates(ring.slice(0, -1)));
});

test("la triangulation conserve la surface lorsque l'anneau est inversé", () => {
  const ring = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
  const reversedRing = [...ring.slice(0, -1)].reverse();
  reversedRing.push(reversedRing[0]);
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [reversedRing] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(polygonMeshTriangleArea(mesh), polygonAreaFromCoordinates(reversedRing.slice(0, -1)));
});


test("la triangulation concave complexe conserve la surface et des indices valides", () => {
  const ring = [
    [-8, -5], [-3, -5], [-3, -2], [-1, -2], [-1, -4],
    [2, -4], [2, -1], [6, -1], [6, 2], [3, 2],
    [3, 5], [0, 5], [0, 2], [-2, 2], [-2, 4],
    [-5, 4], [-5, 1], [-8, 1], [-8, -5]
  ];
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [ring] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(mesh.indices.length / 3, ring.length - 3,
    "un anneau simple de n sommets doit produire n-2 triangles");
  for (const index of mesh.indices) {
    assert.ok(index >= 0 && index < mesh.vertexCount, "chaque indice doit référencer un sommet existant");
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] * 2;
    const b = mesh.indices[index + 1] * 2;
    const c = mesh.indices[index + 2] * 2;
    const area2 = (mesh.positions[b] - mesh.positions[a]) * (mesh.positions[c + 1] - mesh.positions[a + 1])
      - (mesh.positions[b + 1] - mesh.positions[a + 1]) * (mesh.positions[c] - mesh.positions[a]);
    assert.ok(area2 > 0, "chaque triangle doit avoir une aire strictement positive et une orientation cohérente");
  }
  const quantizedRing = ring.slice(0, -1).map(([x, y]) => [Math.fround(x), Math.fround(y)]);
  assert.ok(Math.abs(polygonMeshTriangleArea(mesh) - polygonAreaFromCoordinates(quantizedRing)) < 1e-5);
});

test("la triangulation reste valide sur un anneau concave de 128 sommets", () => {
  const ring = [];
  const count = 128;
  for (let index = 0; index < count; index++) {
    const angle = index * Math.PI * 2 / count;
    const radius = index % 2 === 0 ? 20 : 13;
    ring.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  ring.push(ring[0]);
  const mesh = buildGeographicPolygonMesh({
    geometry: { type: "Polygon", coordinates: [ring] }
  });
  assert.equal(mesh.supported, true);
  assert.equal(mesh.vertexCount, count);
  assert.equal(mesh.indices.length / 3, count - 2);
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index] * 2;
    const b = mesh.indices[index + 1] * 2;
    const c = mesh.indices[index + 2] * 2;
    const area2 = (mesh.positions[b] - mesh.positions[a]) * (mesh.positions[c + 1] - mesh.positions[a + 1])
      - (mesh.positions[b + 1] - mesh.positions[a + 1]) * (mesh.positions[c] - mesh.positions[a]);
    assert.ok(Number.isFinite(area2) && area2 > 0, "aucun triangle ne doit être dégénéré ou inversé");
  }
  const quantizedRing = ring.slice(0, -1).map(([x, y]) => [Math.fround(x), Math.fround(y)]);
  assert.ok(Math.abs(polygonMeshTriangleArea(mesh) - polygonAreaFromCoordinates(quantizedRing)) < 1e-3);
});



test("les maillages Natural Earth conservent l'aire de chaque polygone pris en charge", () => {
  const collection = JSON.parse(readFileSync(new URL("../data/ne_110m_land.geojson", import.meta.url), "utf8"));
  let checkedFeatures = 0;
  let checkedPolygons = 0;
  for (const feature of collection.features) {
    const mesh = buildGeographicPolygonMesh(feature);
    if (!mesh.supported) continue;
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let expectedArea = 0;
    for (const polygon of polygons) {
      const ring = polygon[0].slice(0, -1).map(([x, y]) => [Math.fround(x), Math.fround(y)]);
      expectedArea += polygonAreaFromCoordinates(ring);
      checkedPolygons++;
    }
    const actualArea = polygonMeshTriangleArea(mesh);
    const tolerance = Math.max(1e-5, expectedArea * 1e-6);
    assert.ok(Math.abs(actualArea - expectedArea) <= tolerance,
      `la surface triangulée doit correspondre à la surface du contour (écart ${Math.abs(actualArea - expectedArea)}, attendu ${expectedArea}, obtenu ${actualArea})`);
    checkedFeatures++;
  }
  assert.equal(checkedFeatures, 125);
  assert.ok(checkedPolygons >= checkedFeatures);
});

test("les géométries réelles Natural Earth produisent des maillages polygonaux valides", () => {
  const collection = JSON.parse(readFileSync(new URL("../data/ne_110m_land.geojson", import.meta.url), "utf8"));
  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.features.length, 127);

  const reasons = new Map();
  let supportedFeatures = 0;
  let triangleCount = 0;
  for (const feature of collection.features) {
    const mesh = buildGeographicPolygonMesh(feature);
    if (!mesh.supported) {
      reasons.set(mesh.reason, (reasons.get(mesh.reason) ?? 0) + 1);
      continue;
    }
    supportedFeatures++;
    triangleCount += mesh.triangleCount;
    assert.equal(mesh.indices.length % 3, 0);
    assert.equal(mesh.positions.length, mesh.vertexCount * 2);
    for (const index of mesh.indices) {
      assert.ok(index < mesh.vertexCount, "chaque indice doit rester dans les limites du maillage");
    }
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const a = mesh.indices[index] * 2;
      const b = mesh.indices[index + 1] * 2;
      const c = mesh.indices[index + 2] * 2;
      const area2 = (mesh.positions[b] - mesh.positions[a]) * (mesh.positions[c + 1] - mesh.positions[a + 1])
        - (mesh.positions[b + 1] - mesh.positions[a + 1]) * (mesh.positions[c] - mesh.positions[a]);
      assert.ok(Number.isFinite(area2) && area2 > 0,
        "les triangles des données réelles doivent être finis, non dégénérés et orientés");
    }
  }

  assert.equal(supportedFeatures, 125);
  assert.equal(triangleCount, 2849);
  assert.deepEqual(Object.fromEntries(reasons), {
    "antimeridian-requires-canvas": 1,
    "polygon-holes-require-canvas": 1
  });
});
