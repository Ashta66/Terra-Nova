import test from "node:test";
import assert from "node:assert/strict";
import { buildTerrainTileAtlasBatchVertices, getTerrainWebGLShaders } from "../src/world/terrain-webgl.js";

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
  assert.ok(Math.abs(vertices[2] - 5.5 / 16) < 1e-7, "UV x au centre du premier texel intérieur");
  assert.ok(Math.abs(vertices[3] - 9.5 / 16) < 1e-7, "UV y au centre du premier texel intérieur");
  assert.ok(Math.abs(vertices[8] - 4.5 / 16) < 1e-7, "borne minimale au centre du halo");
  assert.ok(Math.abs(vertices[10] - 7.5 / 16) < 1e-7, "borne maximale au centre du halo opposé");
});
