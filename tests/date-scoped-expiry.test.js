import test from "node:test";
import assert from "node:assert/strict";
import { createDateScopedExpiry } from "../src/core/date-scoped-expiry.js";

test("l'expiration physique ne rescane pas le monde pour une date inchangée", () => {
  let calls = 0;
  const world = { revision: 1 };
  const expire = createDateScopedExpiry((current, date) => {
    calls++;
    return current;
  });

  assert.equal(expire(world, "1900-01-01"), world);
  assert.equal(expire(world, "1900-01-01"), world);
  assert.equal(expire(world, "1900-01-01"), world);
  assert.equal(calls, 1);
});

test("l'expiration physique est recalculée après un changement de date ou de monde", () => {
  let calls = 0;
  const firstWorld = { revision: 1 };
  const secondWorld = { revision: 2 };
  const expire = createDateScopedExpiry((current) => {
    calls++;
    return current;
  });

  expire(firstWorld, "1900-01-01");
  expire(firstWorld, "1900-01-02");
  expire(secondWorld, "1900-01-02");
  assert.equal(calls, 3);
});

test("le monde retourné après expiration devient la référence du cache", () => {
  let calls = 0;
  const world = { revision: 1 };
  const expiredWorld = { revision: 2 };
  const expire = createDateScopedExpiry(() => {
    calls++;
    return expiredWorld;
  });

  assert.equal(expire(world, "1900-01-01"), expiredWorld);
  assert.equal(expire(expiredWorld, "1900-01-01"), expiredWorld);
  assert.equal(calls, 1);
});
