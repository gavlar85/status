/* Trip Status Board – app.js (UTC timeline + rolling month window + local persistence)
   - Board grid is UTC-based (days are UTC midnights)
   - Today highlight uses UTC date
   - Month view shows a rolling 31-day window centered on anchor date (default today)
   - Legs store stdUtc / staUtc (ISO strings, UTC "Z")
   - Leg edit uses <input type="datetime-local"> (local picker) and converts to UTC ISO for storage
   - Legs split across UTC days; overnights & multi-day legs supported
   - Trip startDate/endDate derived from earliest stdUtc and latest staUtc (UTC dates)
   - Trip modal supports insert/add legs (via + per leg row); ICAO/schedule edits ONLY in Leg modal
   - Leg modal has EDIT toggle; edit panel hidden unless active
   - Local-only usability: autosave to localStorage + Export/Import/Reset (works on file://)
*/

const STATUS_STATES = [
  "not_reqd",
  "own_missing_info",
  "own_complete",
  "not_started",
  "in_progress",
  "complete",
];

const STATUS_LABELS = {
  not_reqd: "NOT REQD",
  own_missing_info: "OWN - Missing Info",
  own_complete: "OWN - Complete",
  not_started: "NOT STARTED",
  in_progress: "IN PROGRESS",
  complete: "COMPLETE",
};

const LEG_STATUS_KEYS = [
  ["times", "Times confirmed (STD/STA)"],
  ["handling", "Handling / Slot / PPR OK"],
  ["flightPlan", "Flight plan filed / released"],
  ["crewPax", "Crew / Pax ok for leg"],
  ["apisGar", "APIS / GAR (if applicable)"],
  ["fuel", "Fuel confirmed"],
  ["catering", "Catering confirmed (if applicable)"],
  ["wxNotam", "WX / NOTAM reviewed"],
  ["clientUpdate", "Client update sent for leg"],
];

/* ---------------- Local persistence (file:// safe) ---------------- */
const STORAGE_KEY = "tsb_trips_v1";

function saveTripsToLocal(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  }catch(e){
    console.error("Save failed:", e);
  }
}

function loadTripsFromLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  }catch(e){
    console.warn("Load failed:", e);
    return null;
  }
}

function clearLocalTrips(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){ console.warn(e); }
}

/* ---------------- Demo data (fallback) ---------------- */
const DEMO_TRIPS = [
  {
    id: "TRIP-2026-0142",
    client: "Cartier Europe B.V.",
    aircraft: "PHCBV",
    tags: ["MED", "AOG"],
    notes: "",
    legs: [
      {
        flightNo: "PH123",
        adep: "EGSS",
        ades: "LFPB",
        altn: "LFPO",
        stdUtc: "2026-02-26T08:30:00Z",
        staUtc: "2026-02-26T10:30:00Z",
        status: {},
      },
      {
        flightNo: "PH124",
        adep: "LFPB",
        ades: "EGSS",
        altn: "EGGW",
        stdUtc: "2026-02-26T17:00:00Z",
        staUtc: "2026-02-26T18:45:00Z",
        status: {},
      },
    ],
    updatedAt: "2026-02-26T09:10:00Z",
  },
  {
    id: "TRIP-2026-0146",
    client: "Cartier Europe B.V.",
    aircraft: "PHCFR",
    tags: ["VIP"],
    notes: "",
    legs: [
      {
        flightNo: "PH200",
        adep: "EGGW",
        ades: "EIDW",
        altn: "EIME",
        stdUtc: "2026-02-27T11:00:00Z",
        staUtc: "2026-02-27T12:20:00Z",
        status: {},
      },
    ],
    updatedAt: "2026-02-26T09:15:00Z",
  },
];

/* ---------------- Data source ----------------
   Priority:
   1) localStorage
   2) optional data.js seed: window.TSB_TRIPS (if you add it later)
   3) DEMO_TRIPS
*/
let trips = loadTripsFromLocal()
  || (Array.isArray(window.TSB_TRIPS) ? window.TSB_TRIPS : null)
  || structuredClone(DEMO_TRIPS);

/* ---------------- App state ---------------- */
const state = {
  view: "week",           // "week" | "month"
  tz: "UTC",              // "UTC" | "LOCAL" (display preference only)
  anchorDate: new Date(), // anchor moment; view days are derived as UTC midnights around this date
  expandedClients: new Set(),
  search: "",
  blockedOnly: false,
  selectedTripId: null,
  selectedLeg: null,      // { tripId, legIndex }
  legEditOpen: false,
};

/* ---------------- Utilities ---------------- */
function pad2(n){ return String(n).padStart(2, "0"); }

function toISODateUTC(d){
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}

function utcMidnightFromDate(d){
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0,0,0));
}

function addDaysUTC(d, n){
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function startOfWeekUTC(d){
  const x = utcMidnightFromDate(d);
  const dow = x.getUTCDay(); // Sun=0
  const diff = (dow === 0 ? -6 : 1 - dow); // back to Monday
  return addDaysUTC(x, diff);
}

function fmtDayHeaderUTC(d){
  const wd = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const idx = (d.getUTCDay() + 6) % 7;
  return `${pad2(d.getUTCDate())} ${wd[idx]}`;
}

function containsText(trip, q){
  const hay = [
    trip.id, trip.client, trip.aircraft,
    (trip.tags || []).join(" "),
    ...(trip.legs || []).flatMap(l => [
      l.flightNo, l.adep, l.ades, l.altn,
      l.stdUtc, l.staUtc,
      l.day, l.std, l.sta, // legacy
    ]),
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

/* ---------------- Status mapping ---------------- */
function normalizeState(s){
  const v = (s || "").toLowerCase().trim();
  return STATUS_STATES.includes(v) ? v : "not_started";
}

function dotFromState(state){
  const s = normalizeState(state);
  if (s === "not_reqd") return "grey";
  if (s === "not_started") return "red";
  if (s === "in_progress" || s === "own_missing_info") return "amber";
  if (s === "complete" || s === "own_complete") return "green";
  return "red";
}

function dotFromStates(states){
  const normalized = (states || []).map(normalizeState).filter(s => s !== "not_reqd");
  if (!normalized.length) return "grey";
  const dots = normalized.map(dotFromState);
  if (dots.includes("red")) return "red";
  if (dots.includes("amber")) return "amber";
  return "green";
}

function ensureLegStatusShape(trip){
  trip.legs = trip.legs || [];
  for (const leg of trip.legs){
    leg.status = leg.status || {};
    for (const [key] of LEG_STATUS_KEYS){
      if (!leg.status[key]) leg.status[key] = { state: "not_started", note: "" };
      if (leg.status[key].note == null) leg.status[key].note = "";
      leg.status[key].state = normalizeState(leg.status[key].state);
    }
  }
}

function legSummaryDots(leg){
  const states = Object.values(leg.status || {}).map(x => x?.state).filter(Boolean);
  return dotFromStates(states);
}

function tripSummaryDots(trip){
  const legs = trip.legs || [];
  if (!legs.length) return "grey";
  const legDots = legs.map(legSummaryDots).filter(d => d !== "grey");
  if (!legDots.length) return "grey";
  if (legDots.includes("red")) return "red";
  if (legDots.includes("amber")) return "amber";
  return "green";
}

function isTripRed(trip){
  return tripSummaryDots(trip) === "red";
}

function tileClassFromState(state){
  return `is-${dotFromState(state)}`;
}

/* ---------------- Datetime helpers ---------------- */
function isoToLocalInputValue(isoZ){
  if (!isoZ) return "";
  const d = new Date(isoZ);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${da}T${hh}:${mm}`;
}

function localInputValueToIsoZ(v){
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function fmtZuluFromIso(isoZ){
  if (!isoZ) return "—";
  const d = new Date(isoZ);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}Z`;
}

function fmtLocalFromIso(isoZ){
  if (!isoZ) return "—";
  const d = new Date(isoZ);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeIcao(v){
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,4);
}

/* ---------------- Legacy migration helpers ---------------- */
function parseHHMM(hhmm){
  const s = (hhmm || "").replace(":","").trim();
  if (!/^\d{3,4}$/.test(s)) return null;
  const t = s.padStart(4, "0");
  return { hh: Number(t.slice(0,2)), mm: Number(t.slice(2,4)) };
}

function makeUtcDateFromDayAndHHMM(dayISO, hhmm){
  const p = parseHHMM(hhmm);
  if (!dayISO || !p) return null;
  const [Y,M,D] = dayISO.split("-").map(Number);
  return new Date(Date.UTC(Y, M-1, D, p.hh, p.mm, 0));
}

function minutesFromHHMM(hhmm){
  const p = parseHHMM(hhmm);
  if (!p) return null;
  return p.hh * 60 + p.mm;
}

function addDaysISO(dayISO, n){
  const [y,m,d] = dayISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d, 0,0,0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISODateUTC(dt);
}

function ensureLegDatetimes(trip){
  for (const leg of (trip.legs || [])){
    if (leg.stdUtc && leg.staUtc) continue;

    const depDay = leg.day;
    const std = leg.std;
    const sta = leg.sta;

    if (!leg.stdUtc && depDay && std){
      const dt = makeUtcDateFromDayAndHHMM(depDay, std);
      leg.stdUtc = dt ? dt.toISOString() : "";
    }

    if (!leg.staUtc && depDay && sta){
      let arrDay = depDay;
      const sMin = minutesFromHHMM(std);
      const aMin = minutesFromHHMM(sta);
      if (sMin != null && aMin != null && aMin < sMin){
        arrDay = addDaysISO(depDay, 1);
      }
      const dt = makeUtcDateFromDayAndHHMM(arrDay, sta);
      leg.staUtc = dt ? dt.toISOString() : "";
    }
  }
}

/* ---------------- Trip date range from legs (UTC dates) ---------------- */
function updateTripDatesFromLegs(trip){
  const legs = (trip.legs || []).filter(l => l.stdUtc && l.staUtc);
  if (!legs.length){
    const todayUtc = toISODateUTC(new Date());
    trip.startDate = trip.startDate || todayUtc;
    trip.endDate = trip.endDate || trip.startDate;
    return;
  }

  let minStd = null;
  let maxSta = null;

  for (const leg of legs){
    const std = new Date(leg.stdUtc);
    const sta = new Date(leg.staUtc);
    if (Number.isNaN(std.getTime()) || Number.isNaN(sta.getTime())) continue;
    if (!minStd || std < minStd) minStd = std;
    if (!maxSta || sta > maxSta) maxSta = sta;
  }

  if (!minStd || !maxSta){
    const todayUtc = toISODateUTC(new Date());
    trip.startDate = trip.startDate || todayUtc;
    trip.endDate = trip.endDate || trip.startDate;
    return;
  }

  trip.startDate = toISODateUTC(minStd);
  trip.endDate = toISODateUTC(maxSta);
}

/* ---------------- Leg segments from UTC datetimes (split by UTC day) ---------------- */
function legToDaySegments(tripId, legIndex, leg){
  if (!leg.stdUtc || !leg.staUtc) return [];

  const std = new Date(leg.stdUtc);
  const sta = new Date(leg.staUtc);
  if (Number.isNaN(std.getTime()) || Number.isNaN(sta.getTime())) return [];
  if (sta <= std) return [];

  const segs = [];
  let curDay = new Date(Date.UTC(std.getUTCFullYear(), std.getUTCMonth(), std.getUTCDate(), 0,0,0));
  const endDay = new Date(Date.UTC(sta.getUTCFullYear(), sta.getUTCMonth(), sta.getUTCDate(), 0,0,0));

  while (curDay <= endDay){
    const dayStart = new Date(curDay);
    const dayEnd = new Date(curDay);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const segStart = std > dayStart ? std : dayStart;
    const segEnd = sta < dayEnd ? sta : dayEnd;

    if (segEnd > segStart){
      const startMin = segStart.getUTCHours() * 60 + segStart.getUTCMinutes();
      const endMin = segEnd.getUTCHours() * 60 + segEnd.getUTCMinutes();
      segs.push({ dayISO: toISODateUTC(curDay), startMin, endMin, tripId, legIndex, legRef: leg });
    }

    curDay.setUTCDate(curDay.getUTCDate() + 1);
  }

  return segs;
}

function assignLanes(segments){
  const segs = segments.slice().sort((a,b) => a.startMin - b.startMin);
  const lanes = [];
  for (const s of segs){
    let placed = false;
    for (let i=0;i<lanes.length;i++){
      if (s.startMin >= lanes[i]){
        s.lane = i;
        lanes[i] = s.endMin;
        placed = true;
        break;
      }
    }
    if (!placed){
      s.lane = lanes.length;
      lanes.push(s.endMin);
    }
  }
  return segs;
}

/* ---------------- Grouping / View ---------------- */
function buildGroups(filteredTrips){
  const byClient = new Map();
  for (const t of filteredTrips){
    if (!byClient.has(t.client)) byClient.set(t.client, new Map());
    const regMap = byClient.get(t.client);
    if (!regMap.has(t.aircraft)) regMap.set(t.aircraft, []);
    regMap.get(t.aircraft).push(t);
  }

  const clients = [...byClient.keys()].sort((a,b) => a.localeCompare(b));
  return clients.map(client => {
    const regs = [...byClient.get(client).keys()].sort((a,b) => a.localeCompare(b));
    return {
      client,
      regs: regs.map(reg => ({
        reg,
        trips: byClient.get(client).get(reg).slice().sort((a,b) => (a.startDate || "").localeCompare(b.startDate || "")),
      })),
    };
  });
}

function getViewDaysUTC(){
  const anchor = state.anchorDate || new Date();
  if (state.view === "week"){
    const start = startOfWeekUTC(anchor);
    return Array.from({ length: 7 }, (_,i) => addDaysUTC(start, i));
  }
  const center = utcMidnightFromDate(anchor);
  const start = addDaysUTC(center, -15);
  return Array.from({ length: 31 }, (_,i) => addDaysUTC(start, i));
}

function shiftAnchor(dir){
  if (state.view === "week"){
    state.anchorDate = addDaysUTC(utcMidnightFromDate(state.anchorDate), dir * 7);
  } else {
    state.anchorDate = addDaysUTC(utcMidnightFromDate(state.anchorDate), dir * 31);
  }
}

/* ---------------- Rendering ---------------- */
const elHeader = document.getElementById("boardHeader");
const elBody = document.getElementById("boardBody");

function render(){
  const days = getViewDaysUTC();
  document.documentElement.style.setProperty("--days", String(days.length));

  for (const t of trips){
    ensureLegStatusShape(t);
    ensureLegDatetimes(t);
    updateTripDatesFromLegs(t);
    if (t.notes == null) t.notes = "";
  }

  const q = state.search.trim().toLowerCase();
  let filtered = trips.slice();
  if (q) filtered = filtered.filter(t => containsText(t, q));
  if (state.blockedOnly) filtered = filtered.filter(isTripRed);

  const groups = buildGroups(filtered);

  renderHeader(days);
  renderBody(days, groups);
}

function renderHeader(days){
  const startISO = toISODateUTC(days[0]);
  const endISO = toISODateUTC(days[days.length - 1]);

  const leftLabel = (state.view === "week")
    ? `Client / Registration (UTC Week of ${startISO})`
    : `Client / Registration (UTC ${startISO} → ${endISO})`;

  const header = document.createElement("div");
  header.className = "grid-header";

  const left = document.createElement("div");
  left.className = "h-left";
  left.textContent = leftLabel;

  header.appendChild(left);

  for (const d of days){
    const c = document.createElement("div");
    c.className = "h-day";
    c.innerHTML = `${fmtDayHeaderUTC(d)}<span class="small">${pad2(d.getUTCMonth()+1)}/${pad2(d.getUTCDate())}</span>`;
    header.appendChild(c);
  }

  elHeader.innerHTML = "";
  elHeader.appendChild(header);
}

function renderBody(days, groups){
  elBody.innerHTML = "";

  if (!groups.length){
    const empty = document.createElement("div");
    empty.style.padding = "18px";
    empty.style.color = "#6b7280";
    empty.textContent = "No trips match your filters.";
    elBody.appendChild(empty);
    return;
  }

  for (const g of groups){
    elBody.appendChild(makeClientRow(days, g));

    if (state.expandedClients.has(g.client)){
      for (const r of g.regs){
        elBody.appendChild(makeRegRow(days, r));
      }
    }
  }
}

function makeClientRow(days, group){
  const todayISO = toISODateUTC(new Date());

  const row = document.createElement("div");
  row.className = "row";

  const left = document.createElement("div");
  left.className = "cell-left";

  const chev = document.createElement("button");
  chev.className = "chev";
  const expanded = state.expandedClients.has(group.client);
  chev.textContent = expanded ? "–" : "+";
  chev.title = expanded ? "Collapse client" : "Expand client";
  chev.addEventListener("click", () => {
    if (state.expandedClients.has(group.client)) state.expandedClients.delete(group.client);
    else state.expandedClients.add(group.client);
    render();
  });

  const name = document.createElement("div");
  name.className = "client-name";
  name.textContent = group.client;

  const meta = document.createElement("div");
  meta.className = "client-meta";
  const tripCount = group.regs.reduce((n,r) => n + r.trips.length, 0);
  meta.textContent = `${group.regs.length} reg • ${tripCount} trip${tripCount === 1 ? "" : "s"}`;

  left.appendChild(chev);
  left.appendChild(name);
  left.appendChild(meta);

  row.appendChild(left);

  for (const d of days){
    const cell = document.createElement("div");
    cell.className = "cell-day";
    if (toISODateUTC(d) === todayISO) cell.classList.add("today");
    row.appendChild(cell);
  }

  return row;
}

function makeRegRow(days, regGroup){
  const todayISO = toISODateUTC(new Date());

  const row = document.createElement("div");
  row.className = "row subrow";

  const left = document.createElement("div");
  left.className = "cell-left";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = regGroup.reg;

  left.appendChild(badge);
  row.appendChild(left);

  const cellByDay = new Map();
  for (const d of days){
    const dayISO = toISODateUTC(d);
    const cell = document.createElement("div");
    cell.className = "cell-day";
    if (dayISO === todayISO) cell.classList.add("today");
    row.appendChild(cell);
    cellByDay.set(dayISO, cell);
  }

  for (const trip of regGroup.trips){
    const span = getTripSpanWithinViewUTC(trip, days);
    if (!span) continue;

    const bar = makeTripBar(trip);
    const gridStart = 2 + span.startIdx;
    const gridEnd = 2 + span.endIdx + 1;
    bar.style.gridColumn = `${gridStart} / ${gridEnd}`;
    row.appendChild(bar);
  }

  const segsByDay = new Map();

  for (const trip of regGroup.trips){
    (trip.legs || []).forEach((leg, idx) => {
      const segs = legToDaySegments(trip.id, idx, leg);
      for (const seg of segs){
        if (!segsByDay.has(seg.dayISO)) segsByDay.set(seg.dayISO, []);
        segsByDay.get(seg.dayISO).push(seg);
      }
    });
  }

  for (const [dayISO, segs] of segsByDay.entries()){
    const cell = cellByDay.get(dayISO);
    if (!cell) continue;

    const laidOut = assignLanes(segs);

    const laneHeight = 14;
    const laneGap = 6;
    const baseTop = 44;

    for (const seg of laidOut){
      const leg = seg.legRef;
      const color = legSummaryDots(leg);

      const leftPct = (seg.startMin / 1440) * 100;
      const widthPct = Math.max(0.6, ((seg.endMin - seg.startMin) / 1440) * 100);

      const bar = document.createElement("div");
      bar.className = `legseg ${color}`;
      bar.style.left = `${leftPct}%`;
      bar.style.width = `${widthPct}%`;
      bar.style.top = `${baseTop + seg.lane * (laneHeight + laneGap)}px`;
      bar.style.height = `${laneHeight}px`;

      const flight = leg.flightNo || `LEG ${seg.legIndex + 1}`;
      bar.title = `${flight} • ${leg.adep || ""}→${leg.ades || ""} • ${fmtZuluFromIso(leg.stdUtc)}-${fmtZuluFromIso(leg.staUtc)} (${dayISO} UTC)`;

      bar.addEventListener("click", () => openLegModal(seg.tripId, seg.legIndex));
      cell.appendChild(bar);
    }
  }

  return row;
}

function getTripSpanWithinViewUTC(trip, days){
  const viewStart = toISODateUTC(days[0]);
  const viewEnd = toISODateUTC(days[days.length - 1]);

  if ((trip.endDate || "") < viewStart || (trip.startDate || "") > viewEnd) return null;

  const startISO = (trip.startDate < viewStart) ? viewStart : trip.startDate;
  const endISO = (trip.endDate > viewEnd) ? viewEnd : trip.endDate;

  const startIdx = days.findIndex(d => toISODateUTC(d) === startISO);
  const endIdx = days.findIndex(d => toISODateUTC(d) === endISO);

  if (startIdx === -1 || endIdx === -1) return null;
  return { startIdx, endIdx };
}

function makeTripBar(trip){
  const bar = document.createElement("div");
  bar.className = "tripbar";
  bar.title = `${trip.id} • ${trip.client} • ${trip.aircraft}`;

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = trip.id;

  const right = document.createElement("div");
  right.className = "right";

  const dot = document.createElement("span");
  dot.className = `dot ${tripSummaryDots(trip)}`;
  dot.title = `Trip status: ${tripSummaryDots(trip)}`;

  right.appendChild(dot);
  bar.appendChild(title);
  bar.appendChild(right);

  bar.addEventListener("click", () => openTripModal(trip.id));
  return bar;
}

/* ---------------- Trip Modal ---------------- */
const tripModal = document.getElementById("tripModal");
const tripBackdrop = document.getElementById("modalBackdrop");

const modalTitle = document.getElementById("modalTitle");
const modalSub = document.getElementById("modalSub");
const modalDetails = document.getElementById("modalDetails");
const modalLegs = document.getElementById("modalLegs");
const modalNotes = document.getElementById("modalNotes");

safeOnClick("modalClose", closeTripModal);
safeOnClick("modalSave", saveTripModal);
if (tripBackdrop) tripBackdrop.addEventListener("click", closeTripModal);

function openTripModal(tripId){
  state.selectedTripId = tripId;

  const trip = trips.find(t => t.id === tripId);
  if (!trip || !tripModal || !tripBackdrop) return;

  ensureLegStatusShape(trip);
  ensureLegDatetimes(trip);
  updateTripDatesFromLegs(trip);

  if (modalTitle) modalTitle.textContent = trip.id;
  if (modalSub) modalSub.textContent = `${trip.client} • ${trip.aircraft} • ${trip.startDate} → ${trip.endDate} (UTC)`;

  if (modalDetails){
    modalDetails.innerHTML = "";
    const items = [
      ["Client", trip.client],
      ["Registration", trip.aircraft],
      ["UTC date range", `${trip.startDate} → ${trip.endDate}`],
      ["Tags", (trip.tags || []).join(", ") || "—"],
      ["Trip derived status", tripSummaryDots(trip).toUpperCase()],
      ["Last updated", trip.updatedAt || "—"],
    ];
    for (const [k,v] of items){
      const kk = document.createElement("div"); kk.className = "k"; kk.textContent = k;
      const vv = document.createElement("div"); vv.className = "v"; vv.textContent = v;
      modalDetails.appendChild(kk);
      modalDetails.appendChild(vv);
    }
  }

  if (modalNotes) modalNotes.value = trip.notes || "";

  if (modalLegs){
    modalLegs.innerHTML = "";

    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>UTC Day</th>
          <th>Flight No</th>
          <th>ADEP</th>
          <th>ADES</th>
          <th>STD</th>
          <th>STA</th>
          <th>Status</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tb = table.querySelector("tbody");

    (trip.legs || []).forEach((l, idx) => {
      const day = l.stdUtc ? l.stdUtc.slice(0,10) : (l.day || "—");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${day}</td>
        <td>${l.flightNo || "—"}</td>
        <td>${l.adep || "—"}</td>
        <td>${l.ades || "—"}</td>
        <td>${fmtZuluFromIso(l.stdUtc)}</td>
        <td>${fmtZuluFromIso(l.staUtc)}</td>
        <td><span class="dot ${legSummaryDots(l)}" title="Leg status"></span></td>
        <td><button class="btn" data-insert="${idx}" title="Insert leg after">+</button></td>
        <td><button class="btn danger" data-del="${idx}" title="Delete leg">🗑</button></td>
      `;
      tr.addEventListener("click", () => openLegModal(trip.id, idx));
      tb.appendChild(tr);
    });

    modalLegs.appendChild(table);

    table.querySelectorAll("button[data-insert]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        insertLegAfter(trip.id, Number(btn.dataset.insert));
      });
    });

    table.querySelectorAll("button[data-del]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteLeg(trip.id, Number(btn.dataset.del));
      });
    });

    // ADD LEG TO END removed (redundant now + exists). Only show when trip has no legs.
    if (!(trip.legs || []).length){
      const addFirst = document.createElement("button");
      addFirst.className = "btn primary";
      addFirst.textContent = "ADD FIRST LEG";
      addFirst.style.marginTop = "10px";
      addFirst.addEventListener("click", () => addLegToEnd(trip.id));
      modalLegs.appendChild(addFirst);
    }
  }

  showTripModal(true);
}

function showTripModal(on){
  if (!tripModal || !tripBackdrop) return;
  tripModal.classList.toggle("hidden", !on);
  tripBackdrop.classList.toggle("hidden", !on);
}

function closeTripModal(){
  showTripModal(false);
  state.selectedTripId = null;
}

function saveTripModal(){
  const trip = trips.find(t => t.id === state.selectedTripId);
  if (trip){
    if (modalNotes) trip.notes = modalNotes.value || "";
    trip.updatedAt = new Date().toISOString();
    saveTripsToLocal();
  }
  closeTripModal();
  render();
}

/* ---------------- Leg creation (Trip modal actions) ---------------- */
function createBlankLeg(){
  return { flightNo: "", adep: "", ades: "", altn: "", stdUtc: "", staUtc: "", status: {} };
}

function addLegToEnd(tripId){
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  trip.legs = trip.legs || [];
  trip.legs.push(createBlankLeg());

  ensureLegStatusShape(trip);
  updateTripDatesFromLegs(trip);
  trip.updatedAt = new Date().toISOString();

  saveTripsToLocal();

  openTripModal(trip.id);
  openLegModal(trip.id, trip.legs.length - 1);
}

function deleteLeg(tripId, legIndex){
  const trip = trips.find(t => t.id === tripId);
  if (!trip || !Array.isArray(trip.legs)) return;

  const leg = trip.legs[legIndex];
  const label = `${leg?.flightNo || `Leg ${legIndex+1}`} ${leg?.adep || ""}→${leg?.ades || ""}`.trim();

  if (!confirm(`Delete this leg?\n\n${label || `Leg ${legIndex+1}`}`)) return;

  trip.legs.splice(legIndex, 1);

  if (state.selectedLeg && state.selectedLeg.tripId === tripId){
    if (state.selectedLeg.legIndex === legIndex){
      closeLegModal();
    } else if (state.selectedLeg.legIndex > legIndex){
      state.selectedLeg.legIndex -= 1;
    }
  }

  ensureLegStatusShape(trip);
  ensureLegDatetimes(trip);
  updateTripDatesFromLegs(trip);
  trip.updatedAt = new Date().toISOString();

  saveTripsToLocal();

  openTripModal(tripId);
  render();
}

function insertLegAfter(tripId, afterIndex){
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  trip.legs = trip.legs || [];
  trip.legs.splice(afterIndex + 1, 0, createBlankLeg());

  ensureLegStatusShape(trip);
  updateTripDatesFromLegs(trip);
  trip.updatedAt = new Date().toISOString();

  saveTripsToLocal();

  openTripModal(trip.id);
  openLegModal(trip.id, afterIndex + 1);
}

/* ---------------- Leg Modal ---------------- */
const legModal = document.getElementById("legModal");
const legBackdrop = document.getElementById("legBackdrop");

const legTitleEl = document.getElementById("legTitle");
const legSubEl = document.getElementById("legSub");
const legDetailsEl = document.getElementById("legDetails");
const legStatusEl = document.getElementById("legStatus");

safeOnClick("legClose", closeLegModal);
safeOnClick("legSave", saveLegModal);
safeOnClick("legEditToggle", toggleLegEdit);
if (legBackdrop) legBackdrop.addEventListener("click", closeLegModal);

function toggleLegEdit(){
  state.legEditOpen = !state.legEditOpen;
  const btn = document.getElementById("legEditToggle");
  if (btn) btn.textContent = state.legEditOpen ? "DONE" : "EDIT";

  const sel = state.selectedLeg;
  if (!sel) return;

  const trip = trips.find(t => t.id === sel.tripId);
  const leg = trip?.legs?.[sel.legIndex];
  if (!trip || !leg) return;

  renderLegDetails(trip, leg, sel.legIndex);
}

function renderLegDetails(trip, leg, legIndex){
  if (!legDetailsEl) return;

  const etdUtc = fmtZuluFromIso(leg.stdUtc);
  const etaUtc = fmtZuluFromIso(leg.staUtc);
  const etdLocal = fmtLocalFromIso(leg.stdUtc);
  const etaLocal = fmtLocalFromIso(leg.staUtc);

  const editorHtml = state.legEditOpen ? `
    <div class="leg-edit-panel">
      <div class="form-grid">
        <label><span>Flight No</span><input id="editFlt" value="${leg.flightNo || ""}" placeholder="e.g. PH123"></label>
        <label><span>ADEP</span><input id="editAdep" value="${leg.adep || ""}" placeholder="EGSS"></label>
        <label><span>ADES</span><input id="editAdes" value="${leg.ades || ""}" placeholder="LFPB"></label>

        <label><span>STD (date + time)</span><input id="editStdUtc" type="datetime-local" value="${isoToLocalInputValue(leg.stdUtc)}"></label>
        <label><span>STA (date + time)</span><input id="editStaUtc" type="datetime-local" value="${isoToLocalInputValue(leg.staUtc)}"></label>
        <label><span>ALTN</span><input id="editAltn" value="${leg.altn || ""}" placeholder="LFPO"></label>
      </div>
      <div style="margin-top:8px; font-size:12px; color:#5f6b7a;">
        Picker uses your local time; values are stored as UTC and displayed as Zulu above.
      </div>
    </div>
  ` : "";

  legDetailsEl.innerHTML = `
    <div class="leg-hero">
      <div class="leg-hero-top">
        <div class="leg-route">
          <div class="leg-airport">
            <div class="leg-icao">${(leg.adep || "----").toUpperCase()}</div>
            <div class="leg-timeblock">
              <div>${etdUtc}</div>
              <div class="sub">${etdLocal} local</div>
            </div>
          </div>

          <div class="leg-arrow" aria-hidden="true"></div>

          <div class="leg-airport right">
            <div class="leg-icao">${(leg.ades || "----").toUpperCase()}</div>
            <div class="leg-timeblock">
              <div>${etaUtc}</div>
              <div class="sub">${etaLocal} local</div>
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <span class="dot ${legSummaryDots(leg)}" title="Leg derived status"></span>
        </div>
      </div>
    </div>

    ${editorHtml}
  `;

  if (!state.legEditOpen) return;

  const $ = (id) => document.getElementById(id);

  const applyEdits = () => {
    leg.flightNo = ($("editFlt")?.value || "").trim();
    leg.adep = normalizeIcao($("editAdep")?.value);
    leg.ades = normalizeIcao($("editAdes")?.value);
    leg.altn = normalizeIcao($("editAltn")?.value);

    const stdIso = localInputValueToIsoZ($("editStdUtc")?.value);
    const staIso = localInputValueToIsoZ($("editStaUtc")?.value);

    leg.stdUtc = stdIso || leg.stdUtc || "";
    leg.staUtc = staIso || leg.staUtc || "";

    if (leg.stdUtc && leg.staUtc){
      const std = new Date(leg.stdUtc);
      const sta = new Date(leg.staUtc);
      if (!Number.isNaN(std.getTime()) && !Number.isNaN(sta.getTime()) && sta <= std){
        sta.setUTCDate(sta.getUTCDate() + 1);
        leg.staUtc = sta.toISOString();
        const staEl = $("editStaUtc");
        if (staEl) staEl.value = isoToLocalInputValue(leg.staUtc);
      }
    }

    ensureLegStatusShape(trip);
    updateTripDatesFromLegs(trip);
    trip.updatedAt = new Date().toISOString();

    saveTripsToLocal();

    if (legTitleEl) legTitleEl.textContent = `Leg • ${leg.flightNo || `#${legIndex+1}`}`;
    const day = leg.stdUtc ? leg.stdUtc.slice(0,10) : "—";
    if (legSubEl) legSubEl.textContent = `${trip.id} • ${trip.aircraft} • ${day} UTC • ${leg.adep || "—"}→${leg.ades || "—"}`;

    renderLegDetails(trip, leg, legIndex);
    render();
  };

  ["editFlt","editAdep","editAdes","editAltn","editStdUtc","editStaUtc"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", applyEdits);
  });
};

function openLegModal(tripId, legIndex){
  const trip = trips.find(t => t.id === tripId);
  if (!trip || !legModal || !legBackdrop) return;

  ensureLegStatusShape(trip);
  ensureLegDatetimes(trip);

  const leg = trip.legs?.[legIndex];
  if (!leg) return;

  state.selectedLeg = { tripId, legIndex };
  state.legEditOpen = false;

  const editBtn = document.getElementById("legEditToggle");
  if (editBtn) editBtn.textContent = "EDIT";

  if (legTitleEl) legTitleEl.textContent = `Leg • ${leg.flightNo || `#${legIndex+1}`}`;
  const day = leg.stdUtc ? leg.stdUtc.slice(0,10) : (leg.day || "—");
  if (legSubEl) legSubEl.textContent = `${trip.id} • ${trip.aircraft} • ${day} UTC • ${leg.adep || "—"}→${leg.ades || "—"}`;

  renderLegDetails(trip, leg, legIndex);

  if (legStatusEl){
    legStatusEl.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "svc-grid";

    for (const [key, label] of LEG_STATUS_KEYS){
      const curState = normalizeState(leg.status[key].state);

      const tile = document.createElement("div");
      tile.className = `svc-tile ${tileClassFromState(curState)}`;

      const row = document.createElement("div");
      row.className = "svc-row";

      const lab = document.createElement("div");
      lab.className = "svc-label";
      lab.textContent = label;

      const sel = document.createElement("select");
      for (const st of STATUS_STATES){
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = STATUS_LABELS[st];
        sel.appendChild(opt);
      }
      sel.value = curState;

      const note = document.createElement("input");
      note.placeholder = "Note (optional)";
      note.value = leg.status[key].note || "";

      sel.addEventListener("change", () => {
        const ns = normalizeState(sel.value);
        leg.status[key].state = ns;

        tile.classList.remove("is-grey","is-red","is-amber","is-green");
        tile.classList.add(tileClassFromState(ns));

        const dot = legDetailsEl?.querySelector(".dot");
        if (dot){
          dot.classList.remove("grey","red","amber","green");
          dot.classList.add(legSummaryDots(leg));
        }

        trip.updatedAt = new Date().toISOString();
        saveTripsToLocal();
        render();
      });

      note.addEventListener("input", () => {
        leg.status[key].note = note.value;
        trip.updatedAt = new Date().toISOString();
        saveTripsToLocal();
      });

      row.appendChild(lab);
      row.appendChild(sel);
      row.appendChild(note);

      tile.appendChild(row);
      grid.appendChild(tile);
    }

    legStatusEl.appendChild(grid);
  }

  showLegModal(true);
}

function showLegModal(on){
  if (!legModal || !legBackdrop) return;
  legModal.classList.toggle("hidden", !on);
  legBackdrop.classList.toggle("hidden", !on);
}

function closeLegModal(){
  showLegModal(false);
  state.selectedLeg = null;
  state.legEditOpen = false;
}

function saveLegModal(){
  const sel = state.selectedLeg;
  if (sel){
    const trip = trips.find(t => t.id === sel.tripId);
    if (trip){
      ensureLegDatetimes(trip);
      updateTripDatesFromLegs(trip);
      trip.updatedAt = new Date().toISOString();
      saveTripsToLocal();
    }
  }
  closeLegModal();
  render();
}

/* ---------------- New Trip Modal (simple v1) ---------------- */
const newModal = document.getElementById("newModal");
const newBackdrop = document.getElementById("newBackdrop");

safeOnClick("newTripBtn", () => {
  const days = getViewDaysUTC();
  setValue("newStart", toISODateUTC(days[0]));
  setValue("newEnd", toISODateUTC(days[Math.min(1, days.length - 1)]));
  showNew(true);
});

safeOnClick("newClose", () => showNew(false));
safeOnClick("newCancel", () => showNew(false));
safeOnClick("newCreate", createTripFromForm);
if (newBackdrop) newBackdrop.addEventListener("click", () => showNew(false));

function showNew(on){
  if (!newModal || !newBackdrop) return;
  newModal.classList.toggle("hidden", !on);
  newBackdrop.classList.toggle("hidden", !on);
}

function createTripFromForm(){
  const client = getValue("newClient").trim();
  const reg = getValue("newReg").trim();
  const id = getValue("newTripId").trim() || `TRIP-${Date.now()}`;
  const tags = getValue("newTags").split(",").map(s => s.trim()).filter(Boolean);

  const startDate = getValue("newStart");
  const endDate = getValue("newEnd");

  if (!client || !reg || !startDate || !endDate){
    alert("Client, Registration, Start date and End date are required.");
    return;
  }

  const firstLeg = {
    flightNo: getValue("newFlt").trim(),
    adep: normalizeIcao(getValue("newAdep")),
    ades: normalizeIcao(getValue("newAdes")),
    altn: normalizeIcao(getValue("newAltn")),
    stdUtc: "",
    staUtc: "",
    status: {},
  };

  const stdHH = getValue("newStd").trim();
  const staHH = getValue("newSta").trim();
  if (startDate && stdHH){
    const dt = makeUtcDateFromDayAndHHMM(startDate, stdHH);
    if (dt) firstLeg.stdUtc = dt.toISOString();
  }
  if (startDate && staHH){
    let arrDay = startDate;
    const sMin = minutesFromHHMM(stdHH);
    const aMin = minutesFromHHMM(staHH);
    if (sMin != null && aMin != null && aMin < sMin) arrDay = addDaysISO(startDate, 1);
    const dt = makeUtcDateFromDayAndHHMM(arrDay, staHH);
    if (dt) firstLeg.staUtc = dt.toISOString();
  }

  const trip = {
    id,
    client,
    aircraft: reg,
    tags,
    notes: "",
    legs: (firstLeg.flightNo || firstLeg.adep || firstLeg.ades || firstLeg.stdUtc || firstLeg.staUtc) ? [firstLeg] : [],
    updatedAt: new Date().toISOString(),
    startDate,
    endDate,
  };

  ensureLegStatusShape(trip);
  ensureLegDatetimes(trip);
  updateTripDatesFromLegs(trip);

  trips.push(trip);
  state.expandedClients.add(client);

  saveTripsToLocal();

  showNew(false);
  render();
}

/* ---------------- Controls wiring ---------------- */
safeOnClick("viewWeek", () => { state.view = "week"; setViewButtons(); render(); });
safeOnClick("viewMonth", () => { state.view = "month"; state.anchorDate = new Date(); setViewButtons(); render(); });

function setViewButtons(){
  const wk = document.getElementById("viewWeek");
  const mo = document.getElementById("viewMonth");
  if (!wk || !mo) return;
  wk.classList.toggle("active", state.view === "week");
  mo.classList.toggle("active", state.view === "month");
  wk.setAttribute("aria-selected", state.view === "week" ? "true" : "false");
  mo.setAttribute("aria-selected", state.view === "month" ? "true" : "false");
}

const tzSelect = document.getElementById("tzSelect");
if (tzSelect) tzSelect.addEventListener("change", (e) => { state.tz = e.target.value; render(); });

const searchInput = document.getElementById("searchInput");
if (searchInput) searchInput.addEventListener("input", (e) => { state.search = e.target.value; render(); });

const blockedOnly = document.getElementById("blockedOnly");
if (blockedOnly) blockedOnly.addEventListener("change", (e) => { state.blockedOnly = e.target.checked; render(); });

safeOnClick("prevBtn", () => { shiftAnchor(-1); render(); });
safeOnClick("nextBtn", () => { shiftAnchor(+1); render(); });
safeOnClick("todayBtn", () => { state.anchorDate = new Date(); render(); });

/* ---------------- Export / Import / Reset ----------------
   If HTML already includes buttons with these IDs, we will use them.
   If not, we inject them into .topbar .controls.
*/
function ensureDataControls(){
  const existing = document.getElementById("exportBtn") || document.getElementById("importBtn") || document.getElementById("resetBtn");
  if (existing) return;

  const controls = document.querySelector(".topbar .controls") || document.querySelector(".controls");
  if (!controls) return;

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn";
  exportBtn.id = "exportBtn";
  exportBtn.type = "button";
  exportBtn.textContent = "Export";

  const importBtn = document.createElement("button");
  importBtn.className = "btn";
  importBtn.id = "importBtn";
  importBtn.type = "button";
  importBtn.textContent = "Import";

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn";
  resetBtn.id = "resetBtn";
  resetBtn.type = "button";
  resetBtn.textContent = "Reset";

  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json";
  file.id = "importFile";
  file.hidden = true;

  controls.appendChild(exportBtn);
  controls.appendChild(importBtn);
  controls.appendChild(resetBtn);
  controls.appendChild(file);
}

function wireDataControls(){
  safeOnClick("exportBtn", () => {
    try{
      const blob = new Blob([JSON.stringify(trips, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trips-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){
      console.error(e);
      alert("Export failed.");
    }
  });

  safeOnClick("importBtn", () => document.getElementById("importFile")?.click());

  const importFile = document.getElementById("importFile");
  if (importFile && !importFile.__wired){
    importFile.__wired = true;
    importFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try{
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Invalid file format (expected array).");
        trips = parsed;
        saveTripsToLocal();
        render();
      }catch(err){
        console.error(err);
        alert("Import failed: invalid JSON file.");
      }finally{
        e.target.value = "";
      }
    });
  }

  safeOnClick("resetBtn", () => {
    if (!confirm("Reset all saved trips for this browser?\n\nThis will clear local changes and reload demo/seed data.")) return;
    clearLocalTrips();
    location.reload();
  });
}

/* ---------------- Init ---------------- */
(function initExpanded(){
  const redClients = new Set(trips.filter(isTripRed).map(t => t.client));
  redClients.forEach(c => state.expandedClients.add(c));
})();

setViewButtons();
ensureDataControls();
wireDataControls();
render();

/* ---------------- Small DOM helpers ---------------- */
function safeOnClick(id, fn){
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
}

function getValue(id){
  const el = document.getElementById(id);
  return el ? (el.value ?? "") : "";
}

function setValue(id, v){
  const el = document.getElementById(id);
  if (el) el.value = v;
}
