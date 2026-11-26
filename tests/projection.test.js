import test from "node:test";
import assert from "node:assert/strict";
import { projectCoordinate, projectEquirectangular, projectMercator, projectOrthographic, createCoordinateProjector } from "../src/world/projection.js";

test("équirectangulaire place les limites du monde aux bords du canevas", () => {
  assert.deepEqual(projectEquirectangular(-180, 90, 360, 180), { x: 0, y: 0 });
  assert.deepEqual(projectEquirectangular(180, -90, 360, 180), { x: 360, y: 180 });
});

test("Mercator borne les latitudes polaires pour éviter les infinis", () => {
  const point = projectMercator(0, 90, 800, 400);
  assert.ok(Number.isFinite(point.y));
  assert.ok(point.y >= 0 && point.y <= 400);
});

test("projection orthographique masque l'hémisphère arrière", () => {
  assert.equal(projectOrthographic(180, 0, 800, 600), null);
  assert.ok(projectOrthographic(0, 0, 800, 600));
});

test("le routeur de projection refuse une projection inconnue", () => {
  assert.throws(() => projectCoordinate([0, 0], 100, 100, "unknown"), /Projection inconnue/);
});

test("la fenêtre cartographique permet de zoomer autour du centre et de se déplacer", () => {
  const base = projectCoordinate([30, 10], 360, 180, "equirectangular");
  const zoomed = projectCoordinate([30, 10], 360, 180, {
    type: "equirectangular",
    viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.equal(base.x, 210);
  assert.equal(zoomed.x, 240);
  assert.equal(zoomed.y, 70);
});

test("la projection Mercator applique également le zoom et le centre", () => {
  const base = projectCoordinate([45, 0], 360, 180, "mercator");
  const moved = projectCoordinate([45, 0], 360, 180, {
    type: "mercator",
    viewport: { zoom: 2, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.equal(base.x, 225);
  assert.equal(moved.x, 270);
});


test("les projections 2D conservent un zoom élevé jusqu'à 20x", () => {
  const equatorial = projectCoordinate([30, 0], 360, 180, {
    type: "equirectangular", viewport: { zoom: 20, centerLongitude: 0, centerLatitude: 0 }
  });
  const mercator = projectCoordinate([30, 0], 360, 180, {
    type: "mercator", viewport: { zoom: 20, centerLongitude: 0, centerLatitude: 0 }
  });
  assert.equal(equatorial.x, 780);
  assert.equal(mercator.x, 780);
});


test("le viewport équirectangulaire ne peut jamais afficher plusieurs copies du monde", async () => {
  const { constrainEquirectangularViewport } = await import("../src/world/projection.js");
  assert.deepEqual(constrainEquirectangularViewport({ zoom: 1, centerLongitude: 540, centerLatitude: 80 }), {
    zoom: 1, centerLongitude: 0, centerLatitude: 0
  });
  assert.equal(constrainEquirectangularViewport({ zoom: 2, centerLongitude: 540 }).centerLongitude, 540);
  assert.equal(constrainEquirectangularViewport({ zoom: 2, centerLongitude: -540 }).centerLongitude, -540);
  assert.equal(constrainEquirectangularViewport({ zoom: 35, centerLongitude: 540 }).centerLongitude, 540);
});

test("le zoom ancré conserve la coordonnée géographique sous le pointeur", async () => {
  const { zoomEquirectangularViewportAtPoint } = await import("../src/world/projection.js");
  const before = { zoom: 3, centerLongitude: 24, centerLatitude: 8 };
  const next = zoomEquirectangularViewportAtPoint(before, 1.7, 170, 90, 800, 400);
  const longitudeBefore = before.centerLongitude + (170 / 800 - 0.5) * 360 / before.zoom;
  const latitudeBefore = before.centerLatitude - (90 / 400 - 0.5) * 180 / before.zoom;
  const longitudeAfter = next.centerLongitude + (170 / 800 - 0.5) * 360 / next.zoom;
  const latitudeAfter = next.centerLatitude - (90 / 400 - 0.5) * 180 / next.zoom;
  assert.ok(Math.abs(longitudeBefore - longitudeAfter) < 1e-9);
  assert.ok(Math.abs(latitudeBefore - latitudeAfter) < 1e-9);
});

test("le zoom ancré respecte les bornes min et max", async () => {
  const { zoomEquirectangularViewportAtPoint } = await import("../src/world/projection.js");
  assert.equal(zoomEquirectangularViewportAtPoint({ zoom: 2 }, 0.01, 400, 200, 800, 400).zoom, 1);
  assert.equal(zoomEquirectangularViewportAtPoint({ zoom: 19 }, 5, 400, 200, 800, 400).zoom, 20);
});

test("le zoom ancré refuse un facteur ou un cadre invalide sans corrompre le viewport", async () => {
  const { zoomEquirectangularViewportAtPoint } = await import("../src/world/projection.js");
  const base = { zoom: 4, centerLongitude: 12, centerLatitude: 6 };
  assert.deepEqual(zoomEquirectangularViewportAtPoint(base, NaN, 20, 20, 800, 400), base);
  assert.deepEqual(zoomEquirectangularViewportAtPoint(base, 2, 20, 20, 0, 400), base);
});

test("le déplacement horizontal est proportionnel au zoom et à la largeur", async () => {
  const { panEquirectangularViewport } = await import("../src/world/projection.js");
  const next = panEquirectangularViewport({ zoom: 2, centerLongitude: 10, centerLatitude: 0 }, 100, 0, 800, 400);
  assert.equal(next.centerLongitude, -12.5);
});

test("le déplacement vertical est proportionnel au zoom et à la hauteur", async () => {
  const { panEquirectangularViewport } = await import("../src/world/projection.js");
  const next = panEquirectangularViewport({ zoom: 2, centerLongitude: 0, centerLatitude: 0 }, 0, 50, 800, 400);
  assert.equal(next.centerLatitude, 11.25);
});

test("un déplacement avec dimensions nulles ou delta invalide ne modifie pas la vue", async () => {
  const { panEquirectangularViewport } = await import("../src/world/projection.js");
  const base = { zoom: 4, centerLongitude: 12, centerLatitude: 6 };
  assert.deepEqual(panEquirectangularViewport(base, 10, 10, 0, 400), base);
  assert.deepEqual(panEquirectangularViewport(base, Infinity, 10, 800, 400), base);
});

test("les centres non finis sont normalisés sans propager NaN", async () => {
  const { constrainEquirectangularViewport } = await import("../src/world/projection.js");
  const result = constrainEquirectangularViewport({ zoom: NaN, centerLongitude: Infinity, centerLatitude: NaN });
  assert.deepEqual(result, { zoom: 1, centerLongitude: 0, centerLatitude: 0 });
});

test("le viewport conserve ses métadonnées lors de la normalisation", async () => {
  const { constrainEquirectangularViewport } = await import("../src/world/projection.js");
  const result = constrainEquirectangularViewport({ zoom: 2, centerLongitude: 20, centerLatitude: 10, marker: "test" });
  assert.equal(result.marker, "test");
  assert.equal(result.zoom, 2);
});

test("le pan garde le centre dans les limites verticales au zoom maximal", async () => {
  const { panEquirectangularViewport } = await import("../src/world/projection.js");
  const result = panEquirectangularViewport({ zoom: 20, centerLatitude: 0 }, 0, 5000, 800, 400);
  assert.equal(result.centerLatitude, 85.5);
});

test("un facteur de zoom neutre conserve exactement le viewport", async () => {
  const { zoomEquirectangularViewportAtPoint } = await import("../src/world/projection.js");
  const base = { zoom: 4, centerLongitude: 12, centerLatitude: 6 };
  assert.deepEqual(zoomEquirectangularViewportAtPoint(base, 1, 200, 100, 800, 400), base);
});

test("le projecteur préconfiguré correspond aux trois projections publiques",()=>{
 const cases=[
  {type:"equirectangular",viewport:{zoom:3.5,centerLongitude:179,centerLatitude:24}},
  {type:"mercator",viewport:{zoom:8,centerLongitude:-175,centerLatitude:67}},
  {type:"orthographic"}
 ];
 for(const projection of cases){
  const project=createCoordinateProjector(1280,720,projection);
  for(const [longitude,latitude] of [[0,0],[179,45],[-179,-35],[540,89.9],[-72,82]]){
   const expected=projectCoordinate([longitude,latitude],1280,720,projection);
   const actual=project(longitude,latitude);
   if(expected===null)assert.equal(actual,null);
   else {
    assert.ok(Math.abs(actual.x-expected.x)<1e-9,projection.type+" x");
    assert.ok(Math.abs(actual.y-expected.y)<1e-9,projection.type+" y");
   }
  }
 }
});
test("le projecteur préconfiguré respecte le mode longitude non enveloppée",()=>{
 const projection={type:"equirectangular",viewport:{zoom:2,centerLongitude:10,centerLatitude:0,wrapLongitude:false}};
 const actual=createCoordinateProjector(800,400,projection)(350,0);
 const expected=projectCoordinate([350,0],800,400,projection);
 assert.deepEqual(actual,expected);
});
test("le projecteur refuse les types de projection inconnus dès sa création",()=>{
 assert.throws(()=>createCoordinateProjector(800,400,"unknown"),/Projection inconnue/);
});
