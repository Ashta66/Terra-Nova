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
    getProgramParameter: () => true, getAttribLocation: (_program, name) => ({ a_coordinate: 0, a_longitude_anchor: 1, a_other: 2, a_side: 3, a_join_offset: 4, a_is_join: 5 }[name] ?? 0), getUniformLocation: () => ({}),
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

test("les segments d'un même tracé partagent un ancrage longitudinal", () => {
  const { gl } = createMockGl();
  const firstPath = new Float32Array([
    179, 0, 181, 1,
    181, 1, 182, 2
  ]);
  const secondPath = new Float32Array([-179, 0, -178, 1]);
  const result = buildRibbonBuffer([firstPath, secondPath], gl);
  const stride = 9;
  assert.equal(result.positions.length % stride, 0, "chaque sommet transporte huit attributs de ligne et son ancrage");
  const vertexCount = result.positions.length / stride;
  assert.equal(vertexCount, 198, "le premier chemin produit 120 sommets et le second 78");
  for (let index = 0; index < vertexCount; index++) {
    const anchor = result.positions[index * stride + 8];
    if (index < 120) assert.equal(anchor, 179, "tous les sommets du premier tracé doivent garder son ancrage");
    else assert.equal(anchor, -179, "le second tracé doit conserver son propre ancrage");
  }
  gl.deleteBuffer(result.lineBuffer);
});

test("le cache WebGL polygonal ne reconstruit que le bloc de features modifié", () => {
  const { gl, uploaded } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 65 }, (_, index) => polygonFeature(index));
  const viewport = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };

  const first = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  assert.equal(first.cacheHit, false);
  assert.equal(first.bufferUploads, 24, "les huit compartiments stables produisent chacun trois buffers : positions, ancrages et indices");
  assert.equal(first.drawCalls, 8);
  const initialUploadBytes = first.uploadedBytes;
  assert.ok(initialUploadBytes > 0);

  const changed = features.slice();
  changed.push(polygonFeature(65));
  const second = renderer.renderLayers([{ key: "land", type: "polygons", features: changed }], 800, 400, viewport);
  assert.equal(second.cacheHit, false);
  assert.equal(second.bufferUploads, 3, "seul le compartiment contenant la feature modifiée doit être réuploadé");
  assert.equal(second.drawCalls, 8);
  assert.ok(second.uploadedBytes < initialUploadBytes);

  const third = renderer.renderLayers([{ key: "land", type: "polygons", features: changed.slice() }], 800, 400, viewport);
  assert.equal(third.cacheHit, true, "une nouvelle liste avec les mêmes références doit réutiliser les deux blocs");
  assert.equal(third.bufferUploads, 0);
  assert.equal(third.uploadedBytes, 0);
  assert.equal(uploaded.length, 27);
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
  const stride = 9;
  assert.equal(result.vertexCount, 78);
  const joins = result.positions.slice(6 * stride);
  assert.equal(joins.length / stride, 72, "deux extrémités reçoivent chacune un disque de 12 triangles");
  for (let index = 0; index < joins.length; index += stride) {
    const x = joins[index], y = joins[index + 1];
    const otherX = joins[index + 2], otherY = joins[index + 3];
    const offsetX = joins[index + 5], offsetY = joins[index + 6];
    assert.equal(joins[index + 7], 1, "les sommets du disque doivent activer le chemin de raccord du shader");
    assert.equal(joins[index + 8], 10, "les raccords doivent conserver l’ancrage du tracé");
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
  assert.equal(mesh.anchors.length, mesh.vertexCount);
  assert.ok(mesh.anchors.every(anchor => anchor === 10), "chaque sommet du polygone partage le même ancrage longitudinal");
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


test("un polygone traversant l'antiméridien est explicitement délégué au rendu Canvas", () => {
  const mesh = buildGeographicPolygonMesh({
    geometry: {
      type: "Polygon",
      coordinates: [[[179, -10], [-179, -10], [-179, 10], [179, 10], [179, -10]]]
    }
  });
  assert.equal(mesh.supported, false);
  assert.equal(mesh.reason, "antimeridian-requires-canvas");
});

test("une ligne traversant l'antiméridien conserve le chemin court après déroulage", () => {
  const mesh = buildGeographicLineMesh({
    geometry: { type: "LineString", coordinates: [[179, 0], [-179, 1]] }
  });
  assert.equal(mesh.supported, true);
  assert.deepEqual(Array.from(mesh.positions), [179, 0, 181, 1]);
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

test("les trois buffers d'un lot sont libérés si un transfert échoue au milieu", () => {
  const { gl, deleted } = createMockGl();
  const original = gl.bufferData;
  let calls = 0;
  gl.bufferData = (...args) => {
    calls++;
    if (calls === 2) throw new Error("buffer upload");
    return original(...args);
  };
  const renderer = createGeographicWebGLRenderer(gl);
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /buffer upload/);
  assert.equal(deleted.size, 3);
  renderer.dispose();
});
test("un échec de création du deuxième buffer libère le premier", () => {
  const { gl, deleted } = createMockGl();
  const original = gl.createBuffer;
  let calls = 0;
  gl.createBuffer = () => {
    calls++;
    if (calls === 2) throw new Error("buffer allocation");
    return original();
  };
  const renderer = createGeographicWebGLRenderer(gl);
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /buffer allocation/);
  assert.equal(deleted.size, 1);
  renderer.dispose();
});
test("un échec de création d'un buffer nul nettoie les buffers déjà créés", () => {
  const { gl, deleted } = createMockGl();
  const original = gl.createBuffer;
  let calls = 0;
  gl.createBuffer = () => (++calls === 2 ? null : original());
  const renderer = createGeographicWebGLRenderer(gl);
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /Impossible de créer les buffers/);
  assert.equal(deleted.size, 2);
  renderer.dispose();
});
test("un lot échoué ne laisse aucune entrée partiellement publiée dans le cache", () => {
  const { gl } = createMockGl();
  const original = gl.bufferData;
  let calls = 0;
  gl.bufferData = (...args) => { if (++calls === 2) throw new Error("upload"); original(...args); };
  const renderer = createGeographicWebGLRenderer(gl);
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /upload/);
  gl.bufferData = original;
  const recovered = renderer.renderLayers([
    { key: "land", type: "polygons", features: [polygonFeature(0)] }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(recovered.cacheHit, false);
  assert.equal(recovered.drawCalls, 1);
  renderer.dispose();
});

test("un échec d'un compartiment ultérieur libère les compartiments déjà construits", () => {
  const { gl, deleted } = createMockGl();
  const original = gl.bufferData;
  let calls = 0;
  gl.bufferData = (...args) => {
    if (++calls === 5) throw new Error("second bucket upload");
    original(...args);
  };
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 65 }, (_, index) => polygonFeature(index));
  assert.throws(() => renderer.renderLayers([
    { key: "land", type: "polygons", features }
  ], 800, 400, { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /second bucket upload/);
  assert.equal(deleted.size, 6);
  renderer.dispose();
});
test("un rebuild transactionnel conserve les anciens compartiments si le nouveau échoue", () => {
  const { gl, deleted } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const originalFeatures = Array.from({ length: 65 }, (_, index) => polygonFeature(index));
  renderer.renderLayers([{ key: "land", type: "polygons", features: originalFeatures }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  const previousBuffers = deleted.size;
  const changed = originalFeatures.slice();
  changed.push(polygonFeature(100));
  const originalUpload = gl.bufferData;
  let calls = 0;
  gl.bufferData = (...args) => { if (++calls === 2) throw new Error("replacement upload"); originalUpload(...args); };
  assert.throws(() => renderer.renderLayers([{ key: "land", type: "polygons", features: changed }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 }), /replacement upload/);
  assert.equal(deleted.size, previousBuffers + 3, "les buffers de remplacement échoués sont libérés, les anciens restent valides");
  gl.bufferData = originalUpload;
  const recovered = renderer.renderLayers([{ key: "land", type: "polygons", features: originalFeatures }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  assert.equal(recovered.cacheHit, true);
  renderer.dispose();
});

test("un deleteBuffer défaillant ne bloque pas la libération des autres buffers", () => {
  const { gl, deleted } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  renderer.renderLayers([{ key: "land", type: "polygons", features: [polygonFeature(0)] }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  const original = gl.deleteBuffer;
  let calls = 0;
  gl.deleteBuffer = buffer => { if (++calls === 1) throw new Error("context lost"); original(buffer); };
  assert.doesNotThrow(() => renderer.dispose());
  assert.equal(calls, 3);
  assert.equal(deleted.size, 2);
});
test("dispose géographique est idempotent même après une erreur de suppression", () => {
  const { gl } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  gl.deleteProgram = () => { throw new Error("program already invalid"); };
  assert.doesNotThrow(() => renderer.dispose());
  assert.doesNotThrow(() => renderer.dispose());
});
test("clearLayerCache poursuit le nettoyage après une erreur de buffer", () => {
  const { gl, deleted } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  renderer.renderLayers([{ key: "land", type: "polygons", features: [polygonFeature(0)] }], 800, 400,
    { zoom: 2, centerLongitude: 0, centerLatitude: 0 });
  const original = gl.deleteBuffer;
  let calls = 0;
  gl.deleteBuffer = buffer => { if (++calls === 1) throw new Error("buffer invalid"); original(buffer); };
  assert.doesNotThrow(() => renderer.clearLayerCache());
  assert.equal(calls, 3);
  assert.equal(deleted.size, 2);
  gl.deleteBuffer = original;
  renderer.dispose();
});

test("un cache polygonal identique court-circuite les reconstructions et allocations", () => {
  const { gl, uploaded } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 12 }, (_, index) => polygonFeature(index));
  const viewport = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };
  const first = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  let allocations = 0;
  const createBuffer = gl.createBuffer;
  gl.createBuffer = () => { allocations++; return createBuffer(); };
  const second = renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  assert.equal(second.cacheHit, true);
  assert.equal(second.bufferUploads, 0);
  assert.equal(second.uploadedBytes, 0);
  assert.equal(second.cacheBuildMs, 0);
  assert.equal(allocations, 0);
  assert.equal(second.cachedGpuBytes, first.cachedGpuBytes);
  assert.equal(uploaded.length, first.bufferUploads);
  renderer.dispose();
});
test("un nouveau tableau de références inchangées réutilise directement le cache polygonal", () => {
  const { gl, uploaded } = createMockGl();
  const renderer = createGeographicWebGLRenderer(gl);
  const features = Array.from({ length: 10 }, (_, index) => polygonFeature(index));
  const viewport = { zoom: 2, centerLongitude: 0, centerLatitude: 0 };
  renderer.renderLayers([{ key: "land", type: "polygons", features }], 800, 400, viewport);
  const before = uploaded.length;
  const next = renderer.renderLayers([{ key: "land", type: "polygons", features: features.slice() }], 800, 400, viewport);
  assert.equal(next.cacheHit, true);
  assert.equal(next.bufferUploads, 0);
  assert.equal(uploaded.length, before);
  renderer.dispose();
});
