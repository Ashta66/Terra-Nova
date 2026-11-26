import test from "node:test";
import assert from "node:assert/strict";
import { getMapQualityProfile } from "../src/world/map-quality-profile.js";

test("profil bas sur appareil mobile limité la résolution et la densité des labels", () => {
  const profile = getMapQualityProfile({
    navigator: { userAgent: "Mozilla/5.0 Android Mobile", deviceMemory: 2, hardwareConcurrency: 2 },
    devicePixelRatio: 3,
    innerWidth: 390
  });
  assert.equal(profile.tier, "low");
  assert.equal(profile.mobile, true);
  assert.equal(profile.pixelRatio, 1);
  assert.equal(profile.labelDensity, 0.68);
  assert.ok(profile.terrainQualityMultiplier < 1);
});

test("profil équilibré réduit modérément le coût sur un matériel contraint", () => {
  const profile = getMapQualityProfile({
    navigator: { userAgent: "Mozilla/5.0 Windows", deviceMemory: 4, hardwareConcurrency: 8 },
    devicePixelRatio: 2,
    innerWidth: 1440
  });
  assert.equal(profile.tier, "balanced");
  assert.equal(profile.pixelRatio, 1.1);
  assert.equal(profile.labelDensity, 0.84);
});

test("profil élevé conserve le plafond de résolution existant sur PC", () => {
  const profile = getMapQualityProfile({
    navigator: { userAgent: "Mozilla/5.0 Windows", deviceMemory: 16, hardwareConcurrency: 16 },
    devicePixelRatio: 2,
    innerWidth: 1920
  });
  assert.equal(profile.tier, "high");
  assert.equal(profile.pixelRatio, 1.25);
  assert.equal(profile.labelDensity, 1);
});
