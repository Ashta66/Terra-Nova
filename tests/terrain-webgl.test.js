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
  assert.match(shader, /greenlandIceSheet&&e>=1500\.0/);
  assert.doesNotMatch(shader, /antarcticSnowCoverage|antarcticSnowAmount/,
    "la banquise antarctique est rendue par la couche vectorielle, pas par le shader des tuiles");
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
  assert.match(shader, /bool polarSnow=greenlandIceSheet&&e>=1500\.0/);
  assert.doesNotMatch(shader, /antarcticSnowCoverage|antarcticSnowAmount/);
  assert.match(shader, /float summitSnowAmount=smoothstep\(snowLine-500\.0,snowLine\+250\.0,e\)/);
  assert.match(shader, /snowAmount=max\(snowAmount,summitSnowAmount\*0\.82\)/);
  assert.doesNotMatch(shader, /bool summitSnow=e>=snowLine/);
  assert.match(shader, /if\(snowAmount>0\.0\)color=mix\(color,vec3\(0\.96,0\.97,0\.98\),snowAmount\)/);
  assert.doesNotMatch(shader, /iceSheet&&e>=1500\.0\)e=max\(e,5000\.0\)/);
});

function createAtlasHarness(options = {}) {
  const calls = { texImage: 0, texSubImage: 0, deleted: 0, scheduled: [], cancelled: [] };
  const gl = {
    MAX_TEXTURE_SIZE: 1, TEXTURE_2D: 2, TEXTURE_MIN_FILTER: 3, TEXTURE_MAG_FILTER: 4,
    TEXTURE_WRAP_S: 5, TEXTURE_WRAP_T: 6, NEAREST: 7, CLAMP_TO_EDGE: 8,
    UNPACK_ALIGNMENT: 9, LUMINANCE_ALPHA: 10, UNSIGNED_BYTE: 11,
    getParameter: () => options.maxTextureSize ?? 1024,
    createTexture: () => ({}), bindTexture() {}, texParameteri() {}, pixelStorei() {},
    texImage2D() { calls.texImage++; },
    texSubImage2D() { calls.texSubImage++; if (options.failUpload) throw new Error("upload failed"); },
    deleteTexture() { calls.deleted++; }
  };
  const values = new Int16Array(64);
  for (let i = 0; i < values.length; i++) values[i] = i - 20;
  const sourceTile = { originX: 0, originY: 0, width: 8, height: 8, values };
  const store = { width: 8, height: 8, tileSize: 8, revision: 1,
    getTileAtLevel: () => sourceTile };
  const tile = (x = 0, y = 0) => ({ level: 0, x, y, originX: 0, originY: 0, width: 8, height: 8 });
  return { gl, calls, store, tile };
}

test("l'atlas borne sa taille réelle par le budget mémoire demandé", () => {
  const { gl } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { slotsPerSide: 32, maxBytes: 4096 });
  assert.ok(atlas);
  assert.ok(atlas.memoryBytes <= 4096);
  assert.equal(atlas.stats.maxBytes, 4096);
  assert.equal(atlas.stats.overBudget, false);
  atlas.dispose();
});
test("l'atlas refuse une texture maximale inférieure à une cellule", () => {
  const { gl } = createAtlasHarness({ maxTextureSize: 9 });
  assert.equal(createTerrainWebGLTileAtlas(gl, { tileSize: 8 }), null);
});
test("l'atlas libère la texture si son allocation initiale échoue", () => {
  const harness = createAtlasHarness();
  harness.gl.texImage2D = () => { throw new Error("allocation"); };
  assert.equal(createTerrainWebGLTileAtlas(harness.gl, { tileSize: 8 }), null);
  assert.equal(harness.calls.deleted, 1);
});
test("l'atlas ne réalloue pas la texture lors d'un clear logique", () => {
  const { gl, calls } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { slotsPerSide: 2, maxBytes: 4096 });
  assert.equal(calls.texImage, 1);
  atlas.clear();
  assert.equal(calls.texImage, 1);
  assert.equal(atlas.size, 0);
  atlas.dispose();
});
test("l'atlas encode les valeurs d'altitude signées dans une tuile valide", () => {
  const { gl, store, tile, calls } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 2, maxBytes: 4096 });
  const entry = atlas.get(tile());
  assert.ok(entry);
  assert.equal(calls.texSubImage, 1);
  assert.equal(entry.byteLength, 200);
  assert.equal(atlas.stats.uploads, 1);
  atlas.dispose();
});
test("les consultations atlas réutilisent la même entrée LRU", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 2, maxBytes: 4096 });
  const first = atlas.get(tile());
  assert.equal(atlas.get(tile()), first);
  assert.equal(atlas.stats.hits, 1);
  assert.equal(atlas.stats.uploads, 1);
  atlas.dispose();
});
test("une tuile de révision différente remplace son ancienne version", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 2, maxBytes: 4096 });
  atlas.get(tile());
  store.revision++;
  atlas.get(tile());
  assert.equal(atlas.size, 1);
  assert.equal(atlas.stats.evictions, 1);
  atlas.dispose();
});
test("les erreurs de transfert GPU restituent le slot et sont diagnostiquées", () => {
  const { gl, store, tile } = createAtlasHarness({ failUpload: true });
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 1, maxBytes: 1024 });
  assert.equal(atlas.get(tile()), null);
  assert.equal(atlas.size, 0);
  assert.equal(atlas.stats.uploadFailures, 1);
  assert.match(atlas.stats.lastUploadFailure, /upload failed/);
  atlas.dispose();
});
test("les insertions atlas sont refusées après dispose", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store);
  atlas.dispose();
  assert.equal(atlas.get(tile()), null);
  assert.equal(atlas.peek(tile()), null);
  assert.equal(atlas.enqueue(tile()), false);
  assert.equal(atlas.disposed, true);
});
test("dispose atlas est idempotent et ne supprime la texture qu'une fois", () => {
  const { gl, calls } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 });
  atlas.dispose(); atlas.dispose();
  assert.equal(calls.deleted, 1);
});
test("la file atlas est bornée et évince une précharge au profit d'une tuile visible", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { maxPending: 2 });
  const original = globalThis.setTimeout;
  globalThis.setTimeout = callback => { globalThis.__atlasScheduled = callback; return 17; };
  try {
    assert.equal(atlas.enqueue(tile(0), new Set(), 2), true);
    assert.equal(atlas.enqueue(tile(1), new Set(), 2), true);
    assert.equal(atlas.enqueue(tile(2), new Set(), 0), true);
    assert.equal(atlas.pendingCount, 2);
    assert.equal(atlas.stats.rejectedPending, 1);
  } finally {
    globalThis.setTimeout = original;
    delete globalThis.__atlasScheduled;
    atlas.dispose();
  }
});
test("une file atlas refuse une nouvelle précharge de priorité égale lorsqu'elle est pleine", () => {
  const { gl, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { maxPending: 1 });
  const original = globalThis.setTimeout;
  globalThis.setTimeout = () => 1;
  try {
    atlas.enqueue(tile(0), new Set(), 2);
    assert.equal(atlas.enqueue(tile(1), new Set(), 2), false);
    assert.equal(atlas.pendingCount, 1);
  } finally { globalThis.setTimeout = original; atlas.dispose(); }
});
test("clear annule la tâche planifiée et vide les demandes en attente", () => {
  const { gl, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 });
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let cancelled = 0;
  globalThis.setTimeout = () => 42;
  globalThis.clearTimeout = id => { if (id === 42) cancelled++; };
  try {
    atlas.enqueue(tile());
    atlas.clear();
    assert.equal(atlas.pendingCount, 0);
    assert.equal(cancelled, 1);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    atlas.dispose();
  }
});
test("un callback idle obsolète ne travaille pas après clear", () => {
  const { gl, tile, calls } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 });
  const originalSet = globalThis.setTimeout;
  let scheduled;
  globalThis.setTimeout = callback => { scheduled = callback; return 5; };
  try {
    atlas.enqueue(tile());
    atlas.clear();
    scheduled?.();
    assert.equal(calls.texSubImage, 0);
  } finally { globalThis.setTimeout = originalSet; atlas.dispose(); }
});
test("les erreurs de callback onReady ne bloquent pas la file atlas", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { maxPending: 2 });
  const originalSet = globalThis.setTimeout;
  const callbacks = [];
  globalThis.setTimeout = callback => { callbacks.push(callback); return callbacks.length; };
  try {
    atlas.setOnReady(() => { throw new Error("ui"); });
    atlas.enqueue(tile(), new Set(), 0);
    assert.doesNotThrow(() => callbacks.shift()?.());
    assert.equal(atlas.stats.uploads, 1);
  } finally { globalThis.setTimeout = originalSet; atlas.dispose(); }
});
test("les diagnostics atlas exposent la limite de file et le cycle de vie", () => {
  const { gl } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { maxPending: 7 });
  assert.equal(atlas.stats.maxPending, 7);
  assert.equal(atlas.stats.disposed, false);
  atlas.dispose();
  assert.equal(atlas.stats.disposed, true);
});

test("une erreur du magasin pendant la construction est diagnostiquée sans propager", () => {
  const { gl, store, tile } = createAtlasHarness();
  store.getTileAtLevel = () => { throw new Error("store unavailable"); };
  const atlas = createTerrainWebGLTileAtlas(gl, store);
  assert.equal(atlas.get(tile()), null);
  assert.equal(atlas.stats.buildFailures, 1);
  assert.match(atlas.stats.lastBuildFailure, /store unavailable/);
  atlas.dispose();
});
test("une file atlas promeut une demande existante sans la dupliquer", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { maxPending: 2 });
  const originalSet = globalThis.setTimeout;
  const callbacks = [];
  globalThis.setTimeout = callback => { callbacks.push(callback); return callbacks.length; };
  try {
    assert.equal(atlas.enqueue(tile(), new Set(), 2), true);
    assert.equal(atlas.enqueue(tile(), new Set(), 0), false);
    assert.equal(atlas.pendingCount, 1);
    callbacks.shift()?.();
    assert.equal(atlas.stats.uploads, 1);
  } finally { globalThis.setTimeout = originalSet; atlas.dispose(); }
});
test("l'atlas évince la tuile LRU non protégée lorsque sa capacité est atteinte", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 1, maxBytes: 512 });
  assert.ok(atlas.get(tile(0)));
  assert.ok(atlas.get(tile(1)));
  assert.equal(atlas.size, 1);
  assert.equal(atlas.stats.evictions, 1);
  atlas.dispose();
});
test("l'atlas ne remplace pas une entrée protégée lorsqu'aucun slot n'est libre", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 1, maxBytes: 512 });
  const first = atlas.get(tile(0));
  atlas.setProtectedKeys(new Set(["0/0/0@1"]));
  assert.equal(atlas.get(tile(1)), null);
  assert.equal(atlas.peek(tile(0)), first);
  assert.equal(atlas.stats.evictions, 0);
  atlas.dispose();
});
test("clear restitue l'ensemble des slots pour les prochaines tuiles", () => {
  const { gl, store, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, store, { slotsPerSide: 1, maxBytes: 512 });
  assert.ok(atlas.get(tile()));
  atlas.clear();
  assert.equal(atlas.size, 0);
  assert.ok(atlas.get(tile(1)));
  assert.equal(atlas.size, 1);
  atlas.dispose();
});
test("un budget inférieur à une cellule refuse la création de l'atlas", () => {
  const { gl } = createAtlasHarness();
  assert.equal(createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { maxBytes: 100 }), null);
});
test("un contexte incapable de créer une texture est refusé sans exception", () => {
  const { gl } = createAtlasHarness();
  gl.createTexture = () => null;
  assert.equal(createTerrainWebGLTileAtlas(gl, { tileSize: 8 }), null);
});
test("retainPending annule le scheduler quand aucune demande ne reste", () => {
  const { gl, tile } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 });
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let cancelled = 0;
  globalThis.setTimeout = () => 77;
  globalThis.clearTimeout = id => { if (id === 77) cancelled++; };
  try {
    atlas.enqueue(tile());
    assert.equal(atlas.retainPending(new Set(), true), 1);
    assert.equal(atlas.pendingCount, 0);
    assert.equal(cancelled, 1);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    atlas.dispose();
  }
});
test("le scheduler idle est annulé à clear et son callback tardif devient inerte", () => {
  const { gl, tile, calls } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 });
  const originalIdle = globalThis.requestIdleCallback, originalCancel = globalThis.cancelIdleCallback;
  let callback, cancelled = 0;
  globalThis.requestIdleCallback = fn => { callback = fn; return 88; };
  globalThis.cancelIdleCallback = id => { if (id === 88) cancelled++; };
  try {
    atlas.enqueue(tile());
    atlas.clear();
    callback?.({ didTimeout: true, timeRemaining: () => 10 });
    assert.equal(cancelled, 1);
    assert.equal(calls.texSubImage, 0);
  } finally {
    if (originalIdle === undefined) delete globalThis.requestIdleCallback; else globalThis.requestIdleCallback = originalIdle;
    if (originalCancel === undefined) delete globalThis.cancelIdleCallback; else globalThis.cancelIdleCallback = originalCancel;
    atlas.dispose();
  }
});
test("les statistiques distinguent le budget demandé et la mémoire allouée", () => {
  const { gl } = createAtlasHarness();
  const atlas = createTerrainWebGLTileAtlas(gl, { tileSize: 8 }, { slotsPerSide: 2, maxBytes: 4096 });
  assert.equal(atlas.stats.maxBytes, 4096);
  assert.equal(atlas.stats.byteLength, atlas.memoryBytes);
  assert.ok(atlas.stats.byteLength < atlas.stats.maxBytes);
  atlas.dispose();
});

test("le batch atlas ignore les rectangles invalides sans décaler les sommets valides", () => {
  const tile = { level: 0, x: 0, y: 0, width: 2, height: 2 };
  const valid = { x: 0, y: 0, width: 2, height: 2, u0: 0, u1: 1, v0: 0, v1: 1 };
  const rects = [null, { ...valid, width: 0 }, { ...valid, x: NaN }, valid];
  const entries = new Map([["0/0/0", { slotX: 1, slotY: 2 }]]);
  const atlas = { cellSize: 4, atlasWidth: 16, atlasHeight: 16 };
  const vertices = buildTerrainTileAtlasBatchVertices([{ tile, rects }], entries, 2, 2, atlas);
  const expected = buildTerrainTileAtlasBatchVertices([{ tile, rects: [valid] }], entries, 2, 2, atlas);
  assert.deepEqual(vertices, expected);
});
test("le batch atlas ignore les tuiles sans entrée GPU et retourne un buffer vide", () => {
  const tile = { level: 0, x: 0, y: 0, width: 2, height: 2 };
  const rects = [{ x: 0, y: 0, width: 2, height: 2, u0: 0, u1: 1, v0: 0, v1: 1 }];
  const atlas = { cellSize: 4, atlasWidth: 16, atlasHeight: 16 };
  const vertices = buildTerrainTileAtlasBatchVertices([{ tile, rects }], new Map(), 2, 2, atlas);
  assert.ok(vertices instanceof Float32Array);
  assert.equal(vertices.length, 0);
});
