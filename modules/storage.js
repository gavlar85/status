// Local storage for TSB-NG v0.1
// - clients + seed trips live in repo as JSON
// - user edits persist in browser via localStorage
// - export/import lets you move your local data between machines

const KEY = "tsb_ng_v01_state";

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function looksLikeState(x) {
  return x && typeof x === "object"
    && x.clients && typeof x.clients === "object"
    && Array.isArray(x.trips)
    && x.ui && typeof x.ui === "object"
    && x.config && typeof x.config === "object";
}

export async function loadInitialState({ forceSeed = false } = {}) {
  const [clients, seedTrips] = await Promise.all([
    fetchJSON("./data/clients.json"),
    fetchJSON("./data/seedTrips.json"),
  ]);

  const seedState = {
    clients,
    trips: (seedTrips.trips || []),
    ui: { selectedTripId: null },
    config: {
      days: 30,
      slotHours: 6,
      dayWidth: 220,
    }
  };

  if (forceSeed) return seedState;

  const raw = localStorage.getItem(KEY);
  if (!raw) return seedState;

  try {
    const parsed = JSON.parse(raw);
    if (!looksLikeState(parsed)) return seedState;

    // Keep repo-controlled bits authoritative (clients + config)
    return {
      ...parsed,
      clients,
      config: seedState.config,
      ui: { selectedTripId: null }
    };
  } catch {
    return seedState;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export async function resetState() {
  localStorage.removeItem(KEY);
}

export function exportTripsJSON(state) {
  const payload = {
    exportedAtUTC: new Date().toISOString(),
    trips: state.trips || []
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tsb-ng-trips.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importTripsJSON(file, currentState) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("File is not valid JSON."); }

  const trips = Array.isArray(parsed?.trips) ? parsed.trips : (Array.isArray(parsed) ? parsed : null);
  if (!trips) throw new Error("JSON must contain a top-level 'trips' array (or be an array of trips).");

  // Basic sanitize: ensure expected fields exist (soft)
  const cleanTrips = trips.map(t => ({
    id: String(t.id || ""),
    client: String(t.client || "").toUpperCase(),
    aircraftType: String(t.aircraftType || "").toUpperCase(),
    reg: String(t.reg || "").toUpperCase(),
    callsign: String(t.callsign || "").toUpperCase(),
    tags: Array.isArray(t.tags) ? t.tags.map(x => String(x)) : [],
    notes: String(t.notes || ""),
    legs: Array.isArray(t.legs) ? t.legs.map(l => ({
      id: String(l.id || ""),
      depICAO: String(l.depICAO || "").toUpperCase(),
      arrICAO: String(l.arrICAO || "").toUpperCase(),
      depUTC: String(l.depUTC || ""),
      arrUTC: String(l.arrUTC || ""),
    })) : []
  }));

  const next = {
    ...currentState,
    trips: cleanTrips,
    ui: { selectedTripId: null }
  };
  // Persist immediately so refresh keeps it
  saveState(next);
  return next;
}
