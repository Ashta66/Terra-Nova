import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldStartMapPointerGesture,
  shouldHandleMapPointerGesture,
  getMapPointerGestureEndState
} from "../src/world/map-pointer-gesture.js";

test("un geste principal avec bouton gauche peut commencer", () => {
  assert.equal(shouldStartMapPointerGesture({ pointerId: 4, isPrimary: true, pointerType: "mouse", button: 0 }), true);
});

test("un clic droit souris ne démarre pas un déplacement", () => {
  assert.equal(shouldStartMapPointerGesture({ pointerId: 4, isPrimary: true, pointerType: "mouse", button: 2 }), false);
});

test("un pointeur secondaire ne démarre pas un geste concurrent", () => {
  assert.equal(shouldStartMapPointerGesture({ pointerId: 5, isPrimary: false, pointerType: "touch", button: 0 }), false);
});

test("un second geste est refusé tant qu'un pointeur est actif", () => {
  assert.equal(shouldStartMapPointerGesture({ pointerId: 5, isPrimary: true, pointerType: "touch" }, 4), false);
});

test("un identifiant pointeur absent ou invalide est refusé", () => {
  assert.equal(shouldStartMapPointerGesture({ isPrimary: true, button: 0 }), false);
  assert.equal(shouldStartMapPointerGesture({ pointerId: NaN, isPrimary: true, button: 0 }), false);
});

test("seul le pointeur propriétaire peut déplacer la carte", () => {
  assert.equal(shouldHandleMapPointerGesture({ pointerId: 4 }, 4), true);
  assert.equal(shouldHandleMapPointerGesture({ pointerId: 5 }, 4), false);
  assert.equal(shouldHandleMapPointerGesture({ pointerId: 4 }, null), false);
});

test("la fin normale conserve l'information de déplacement", () => {
  assert.deepEqual(getMapPointerGestureEndState({ moved: true }, "pointerup"), { moved: true, cancelled: false });
});

test("une annulation de pointeur supprime le clic résiduel", () => {
  assert.deepEqual(getMapPointerGestureEndState({ moved: false }, "pointercancel"), { moved: false, cancelled: true });
  assert.deepEqual(getMapPointerGestureEndState({ moved: true }, "blur"), { moved: true, cancelled: true });
});

test("terminer un geste absent est sans effet", () => {
  assert.deepEqual(getMapPointerGestureEndState(null), { moved: false, cancelled: false });
});
