export const START_DATE = "1444-01-01";
export const SPEEDS = Object.freeze([1, 5, 20, 60]);

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4,}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Date invalide.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TypeError("Date calendrier invalide.");
  return date;
}
export function addDays(isoDate, amount = 1) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError("Le nombre de jours doit être un entier positif ou nul.");
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function formatDate(isoDate, locale = "fr-FR") {
  const date = parseDate(isoDate);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
export function createClock(overrides = {}) {
  const date = overrides.date ?? START_DATE;
  parseDate(date);
  const speed = overrides.speed ?? 1;
  if (!SPEEDS.includes(speed)) throw new RangeError("Vitesse non prise en charge.");
  return { date, day: overrides.day ?? 1, speed, paused: overrides.paused ?? true };
}
export function advanceClock(clock, days = 1) {
  if (!Number.isInteger(days) || days < 0) throw new RangeError("Avance temporelle invalide.");
  return { ...clock, date: addDays(clock.date, days), day: clock.day + days };
}