export const START_DATE = "1444-01-01";
export const SPEEDS = Object.freeze([1, 5, 20, 60]);

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4,}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Date invalide.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new TypeError("Date calendrier invalide.");
  return date;
}
function toIsoDate(date) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function addDays(isoDate, amount = 1) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError("Le nombre de jours doit être un entier positif ou nul.");
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
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
  const day = overrides.day ?? 1;
  if (!Number.isInteger(day) || day < 1) throw new RangeError("Compteur de jours invalide.");
  return { date, day, speed, paused: overrides.paused ?? true };
}
export function advanceClock(clock, days = 1) {
  if (!Number.isInteger(days) || days < 0) throw new RangeError("Avance temporelle invalide.");
  return { ...clock, date: addDays(clock.date, days), day: clock.day + days };
}