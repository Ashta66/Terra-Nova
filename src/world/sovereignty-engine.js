// Historical sovereignty is political state only: it never owns or mutates geometry.
// Geometry remains in geography.js and is joined through stable regionId values.

export const SOVEREIGNTY_STATUSES = Object.freeze([
  "sovereign", "contested", "influence", "unclaimed"
]);

const EVENT_TYPES = new Set([
  "set-status", "transfer-control", "add-claim", "remove-claim",
  "set-influence", "clear-influence"
]);

function clone(value) { return structuredClone(value); }
function validYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < -10000 || year > 10000) throw new TypeError("Année historique invalide.");
  return year;
}
function requireId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(label + " requis.");
  return value;
}

export function createSovereigntyState({ countries = [], regions = [], events = [] } = {}) {
  const countryMap = new Map(countries.map(country => [requireId(country.id, "Identifiant de pays"), clone(country)]));
  if (countryMap.size !== countries.length) throw new Error("Identifiant de pays dupliqué.");
  const regionIds = new Set();
  const baseline = regions.map(region => {
    const regionId = requireId(region.regionId, "Identifiant de région");
    if (regionIds.has(regionId)) throw new Error("État politique dupliqué pour la région " + regionId + ".");
    regionIds.add(regionId);
    const status = region.status ?? "unclaimed";
    if (!SOVEREIGNTY_STATUSES.includes(status)) throw new TypeError("Statut de souveraineté inconnu : " + status);
    const controllerId = region.controllerId ?? null;
    if (controllerId && !countryMap.has(controllerId)) throw new Error("Pays contrôleur inconnu : " + controllerId);
    const claimants = [...new Set(region.claimants ?? [])];
    claimants.forEach(id => { if (!countryMap.has(id)) throw new Error("Pays revendiquant inconnu : " + id); });
    if (status === "sovereign" && !controllerId) throw new Error("Un territoire souverain doit avoir un contrôleur.");
    if (status === "contested" && claimants.length < 2) throw new Error("Un territoire contesté doit avoir au moins deux revendiquants.");
    return { regionId, status, controllerId, claimants, influence: clone(region.influence ?? []) };
  });
  const state = { countries: [...countryMap.values()], baseline, events: [], revision: 0 };
  for (const event of events) state.events.push(validateSovereigntyEvent(event, state));
  state.events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  return state;
}

export function validateSovereigntyEvent(event, state) {
  if (!event || typeof event !== "object") throw new TypeError("Événement historique invalide.");
  const id = requireId(event.id, "Identifiant d'événement");
  const year = validYear(event.year);
  const type = event.type;
  if (!EVENT_TYPES.has(type)) throw new TypeError("Type d'événement de souveraineté inconnu.");
  if (!state.baseline.some(region => region.regionId === event.regionId)) throw new Error("Région politique inconnue : " + event.regionId);
  const countryIds = new Set(state.countries.map(country => country.id));
  for (const key of ["countryId", "fromCountryId", "toCountryId"]) {
    if (event[key] && !countryIds.has(event[key])) throw new Error("Pays inconnu dans l'événement : " + event[key]);
  }
  if (type === "transfer-control" && !event.toCountryId) throw new TypeError("Pays destinataire requis pour un transfert.");
  if (type === "add-claim" && !event.countryId) throw new TypeError("Pays revendiquant requis.");
  if (type === "set-influence" && (!event.countryId || !Number.isFinite(event.strength) || event.strength <= 0 || event.strength > 1)) {
    throw new TypeError("Une influence exige un pays et une intensité entre 0 et 1.");
  }
  if (type === "set-status" && !SOVEREIGNTY_STATUSES.includes(event.status)) throw new TypeError("Statut de souveraineté invalide.");
  return clone({ ...event, id, year });
}

function applyEvent(region, event) {
  switch (event.type) {
    case "set-status":
      region.status = event.status;
      if (event.status === "unclaimed") { region.controllerId = null; region.claimants = []; region.influence = []; }
      break;
    case "transfer-control":
      region.controllerId = event.toCountryId;
      region.status = "sovereign";
      region.claimants = [];
      break;
    case "add-claim":
      if (!region.claimants.includes(event.countryId)) region.claimants.push(event.countryId);
      region.status = "contested";
      break;
    case "remove-claim":
      region.claimants = region.claimants.filter(id => id !== event.countryId);
      if (region.claimants.length < 2 && region.controllerId) region.status = "sovereign";
      else if (!region.claimants.length && !region.controllerId) region.status = "unclaimed";
      break;
    case "set-influence": {
      const existing = region.influence.find(item => item.countryId === event.countryId);
      if (existing) existing.strength = event.strength;
      else region.influence.push({ countryId: event.countryId, strength: event.strength });
      if (region.status !== "contested" && region.status !== "sovereign") region.status = "influence";
      break;
    }
    case "clear-influence":
      region.influence = region.influence.filter(item => item.countryId !== event.countryId);
      if (!region.influence.length && region.status === "influence") region.status = region.controllerId ? "sovereign" : "unclaimed";
      break;
  }
}

export function getSovereigntyAtYear(state, year) {
  const targetYear = validYear(year);
  const regions = new Map(state.baseline.map(region => [region.regionId, clone(region)]));
  const appliedEvents = [];
  for (const event of state.events) {
    if (event.year > targetYear) break;
    const region = regions.get(event.regionId);
    if (!region) continue;
    applyEvent(region, event);
    appliedEvents.push(event.id);
  }
  return {
    year: targetYear,
    revision: state.revision,
    regions: [...regions.values()],
    appliedEvents
  };
}

export function appendSovereigntyEvent(state, event) {
  const validated = validateSovereigntyEvent(event, state);
  if (state.events.some(existing => existing.id === validated.id)) throw new Error("Identifiant d'événement déjà utilisé.");
  const next = clone(state);
  next.events.push(validated);
  next.events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  next.revision += 1;
  return next;
}

// Color treatment deliberately keeps each country's identity recognizable.
export function getSovereigntyVisual(regionState, countries) {
  const byId = new Map(countries.map(country => [country.id, country]));
  const controller = regionState.controllerId ? byId.get(regionState.controllerId) : null;
  const claimants = (regionState.claimants ?? []).map(id => byId.get(id)).filter(Boolean);
  const influences = (regionState.influence ?? []).map(item => ({
    ...item, country: byId.get(item.countryId)
  })).filter(item => item.country);
  const baseColor = controller?.color ?? claimants[0]?.color ?? influences[0]?.country.color ?? "#7B8494";
  const palette = {
    sovereign: { fillOpacity: 0.64, saturation: 1, border: "country+black", gradient: false },
    contested: { fillOpacity: 0.40, saturation: 0.78, border: "claimant-split+black", gradient: true },
    influence: { fillOpacity: 0.23, saturation: 0.62, border: "dashed-country+black", gradient: true },
    unclaimed: { fillOpacity: 0.08, saturation: 0.28, border: "geographic-neutral", gradient: true }
  };
  return {
    status: regionState.status,
    color: baseColor,
    claimantColors: claimants.map(country => country.color),
    influenceColors: influences.map(item => ({ color: item.country.color, strength: item.strength })),
    ...palette[regionState.status]
  };
}
