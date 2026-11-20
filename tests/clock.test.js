import test from "node:test";
import assert from "node:assert/strict";
import { addDays, advanceClock, createClock, formatDate, START_DATE } from "../src/core/clock.js";
test("la campagne commence le 1er janvier 1444", () => { assert.equal(createClock().date, START_DATE); });
test("avance correctement au jour suivant et aux changements de mois", () => { assert.equal(addDays("1444-01-31"), "1444-02-01"); });
test("gère les années bissextiles", () => { assert.equal(addDays("2000-02-28"), "2000-02-29"); assert.equal(addDays("1900-02-28"), "1900-03-01"); });
test("avance le compteur de jours sans date de fin", () => { const c = advanceClock(createClock({date:"9999-12-31",day:1}),1); assert.equal(c.date,"10000-01-01"); assert.equal(c.day,2); });
test("refuse les dates et vitesses invalides", () => { assert.throws(()=>addDays("1444-02-30")); assert.throws(()=>createClock({speed:3})); });
test("formate une date sans dépendre du fuseau local", () => { assert.match(formatDate("1444-01-01"),/1 janvier 1444/); });