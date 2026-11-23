import test from "node:test";
import assert from "node:assert/strict";
import { buildTerrainTileAtlasBatchVertices, buildTerrainTileTexture, createTerrainWebGLTileAtlas, expandTerrainTileRect, getTerrainWebGLShaders, getTerrainVertexBufferCapacity, setTerrainViewportUniforms } from "../src/world/terrain-webgl.js";

test("le diagnostic identifie une tuile voisine absente lors de la construction du halo", () => {
  const tile = { level: 0, x: 0, y: 0, originX: 0, originY: 0, width: 2, height: 2 };
  const store = { width: 4, height: 2, tileSize: 2, getTileAtLevel(level, x, y) {
    if (x === 0 && y === 0) return tile;
    return null;
  }};
  const diagnostics = {};
  assert.equal(buildTerrainTileTexture(tile, store, diagnostics), null);
  assert.match(diagnostics.reason, /^missing-neighbor:/);
});

test("les rectangles de tuiles se recouvrent d'un pixel pour supprimer les fissures de rasterisation", () => {
  const left = expandTerrainTileRect({ x: 0, y: 4, width: 10, height: 8 }, 20, 20);
  const right = expandTerrainTileRect({ x: 10, y: 4, width: 10, height: 8 }, 20, 20);
  assert.ok(left && right);
  assert.equal(left.right, 10.5);
  assert.equal(right.left, 9.5);
  assert.equal(left.right - right.left, 1);
  assert.ok(left.tx1 > 1, "le bord droit échantillonne le halo de la tuile");
  assert.ok(right.tx0 < 0, "le bord gauche échantillonne le halo de la tuile");
  assert.equal(expandTerrainTileRect({ x: 30, y: 0, width: 4, height: 4 }, 20, 20), null);
});

test("le shader des tuiles décode chaque altitude avant le filtrage bilinéaire", () => {
  const shader = getTerrainWebGLShaders().tileFragment;
  assert.match(shader, /float decodeElevation\(vec2 uv\)/);
  assert.match(shader, /float a=decodeElevation\(p00\),b=decodeElevation\(p10\)/);
  assert.match(shader, /float c=decodeElevation\(p01\),d=decodeElevation\(p11\)/);
  assert.match(shader, /mix\(mix\(a,b,f\.x\),mix\(c,d,f\.x\),f\.y\)/);
  assert.doesNotMatch(shader, /float elevationAt\(vec2 uv\)\s*\{[^}]*texture2D\(u_elevation,p\)/);
});

test("les UV atlas visent le centre des texels et les limites incluent le halo", () => {
  const tile = { level: 0, x: 0, y: 0, width: 2, height: 2 };
  const rects = [{ x: 0, y: 0, width: 2, height: 2, u0: 0, u1: 1, v0: 0, v1: 1 }];
  const entries = new Map([["0/0/0", { slotX: 1, slotY: 2 }]]);
  const atlas = { cellSize: 4, atlasWidth: 16, atlasHeight: 16 };
  const vertices = buildTerrainTileAtlasBatchVertices([{ tile, rects }], entries, 2, 2, atlas);
  assert.equal(vertices.length, 72);
  assert.ok(Math.abs(vertices[2] - 5 / 16) < 1e-7, "UV x aligné sur la frontière à mi-distance des échantillons");
  assert.ok(Math.abs(vertices[3] - 9 / 16) < 1e-7, "UV y aligné sur la frontière à mi-distance des échantillons");
  assert.ok(Math.abs(vertices[8] - 4.5 / 16) < 1e-7, "borne minimale au centre du halo");
  assert.ok(Math.abs(vertices[10] - 7.5 / 16) < 1e-7, "borne maximale au centre du halo opposé");
});

test("les deux côtés d'une frontière de tuiles échantillonnent le halo à mi-distance", () => {
  const atlas = { cellSize: 4, atlasWidth: 16, atlasHeight: 16 };
  const leftTile = { level: 0, x: 0, y: 0, width: 2, height: 2 };
  const rightTile = { level: 0, x: 1, y: 0, width: 2, height: 2 };
  const leftRect = { x: 0, y: 0, width: 2, height: 2, u0: 0, u1: 1, v0: 0, v1: 1 };
  const rightRect = { x: 2, y: 0, width: 2, height: 2, u0: 0, u1: 1, v0: 0, v1: 1 };
  const entries = new Map([
    ["0/0/0", { slotX: 1, slotY: 0 }],
    ["0/1/0", { slotX: 2, slotY: 0 }]
  ]);
  const left = buildTerrainTileAtlasBatchVertices([{ tile: leftTile, rects: [leftRect] }], entries, 4, 2, atlas, 0);
  const right = buildTerrainTileAtlasBatchVertices([{ tile: rightTile, rects: [rightRect] }], entries, 4, 2, atlas, 0);
  // Au même bord géographique, chaque tuile interpole entre son échantillon
  // intérieur et son halo : indices locaux 2,5 et 0,5 respectivement.
  assert.ok(Math.abs((left[26] * atlas.atlasWidth - 0.5) - (entries.get("0/0/0").slotX * 4 + 2.5)) < 1e-7);
  assert.ok(Math.abs((right[2] * atlas.atlasWidth - 0.5) - (entries.get("0/1/0").slotX * 4 + 0.5)) < 1e-7);
});

test("le buffer de sommets WebGL grandit par paliers et réutilise sa capacité", () => {
  assert.equal(getTerrainVertexBufferCapacity(32, 24), 32);
  assert.equal(getTerrainVertexBufferCapacity(32, 33), 4096);
  assert.equal(getTerrainVertexBufferCapacity(4096, 4096), 4096);
  assert.equal(getTerrainVertexBufferCapacity(4096, 4097), 8192);
  assert.equal(getTerrainVertexBufferCapacity(0, 0), 0);
});

test("l'atlas des altitudes utilise NEAREST pour éviter le mélange des octets encodés", () => {
  const calls = [];
  const gl = {
    MAX_TEXTURE_SIZE: 1, TEXTURE_2D: 2, TEXTURE_MIN_FILTER: 3, TEXTURE_MAG_FILTER: 4,
    TEXTURE_WRAP_S: 5, TEXTURE_WRAP_T: 6, NEAREST: 7, LINEAR: 8, CLAMP_TO_EDGE: 9,
    UNPACK_ALIGNMENT: 10, LUMINANCE_ALPHA: 11, UNSIGNED_BYTE: 12,
    getParameter: () => 1024,
    createTexture: () => ({}),
    bindTexture() {},
    texParameteri: (...args) => calls.push(args),
    pixelStorei() {},
    texImage2D() {},
    texSubImage2D() {},
    deleteTexture() {}
  };
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { slotsPerSide: 2, maxBytes: 4096 });
  assert.ok(atlas);
  assert.ok(calls.some(args => args[1] === gl.TEXTURE_MIN_FILTER && args[2] === gl.NEAREST));
  assert.ok(calls.some(args => args[1] === gl.TEXTURE_MAG_FILTER && args[2] === gl.NEAREST));
  assert.ok(calls.every(args => args[2] !== gl.LINEAR));
  atlas.dispose();
});

test("le shader des tuiles reconnaît les calottes polaires à faible zoom", () => {
  const shader = getTerrainWebGLShaders().tileFragment;
  assert.match(shader, /varying vec2 v_screenUv;/);
  assert.match(shader, /uniform vec2 u_viewCenter;/);
  assert.match(shader, /uniform float u_zoom;/);
  assert.match(shader, /float longitude=u_viewCenter\.x\s*\+/);
  assert.match(shader, /float latitude=u_viewCenter\.y\s*\+/);
  assert.match(shader, /latitude>=60\.0&&latitude<=84\.0/);
  assert.match(shader, /longitude>=-75\.0&&longitude<=-10\.0/);
  assert.match(shader, /latitude<=-70\.0/);
  assert.match(shader, /iceSheet&&e>=1500\.0/);
});


test("le shader reçoit le centre et le zoom géographiques à chaque rendu", () => {
  const calls = [];
  const gl = {
    uniform2f: (...args) => calls.push(["center", ...args]),
    uniform1f: (...args) => calls.push(["zoom", ...args])
  };
  const renderer = { viewCenter: "center-location", zoomLocation: "zoom-location" };
  assert.equal(setTerrainViewportUniforms(gl, renderer, {
    centerLongitude: -42.5, centerLatitude: 71.25, zoom: 1.4
  }), true);
  assert.deepEqual(calls, [
    ["center", "center-location", -42.5, 71.25],
    ["zoom", "zoom-location", 1.4]
  ]);
});

test("les terres des calottes groenlandaise et antarctique reçoivent une neige explicite", () => {
  const shader = getTerrainWebGLShaders().tileFragment;
  assert.match(shader, /if\s*\(iceSheet\s*&&\s*e\s*>\s*0\.0\)/);
  assert.match(shader, /vec3\(0\.96,\s*0\.97,\s*0\.98\)/);
  assert.doesNotMatch(shader, /iceSheet&&e>=1500\.0\)e=max\(e,5000\.0\)/);
});
