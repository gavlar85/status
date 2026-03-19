
const STORAGE_KEY_TRIPS = "workspace_local_trips_v2";
const STORAGE_KEY_META = "workspace_local_meta_v2";

const SERVICE_CATALOG = [
  "Flight Plans",
  "Fuel",
  "GRS",
  "Handling",
  "Hotel (Crew)",
  "Hotel (Pax)",
  "Landing Permit",
  "Overflight Permit(s)",
  "Transport (Crew)",
  "Transport (Pax)"
];

const healthRank = { green: 0, white: 1, blue: 2, amber: 3, red: 4 };
const laneConfig = {
  operating: { label: "Operating", dotClass: "operating-dot" },
  hours24to48: { label: "24-48hrs", dotClass: "hours24to48-dot" },
  over48: { label: ">48hrs", dotClass: "over48-dot" },
  over7days: { label: ">7days", dotClass: "over7days-dot" }
};
const lanes = ["operating", "hours24to48", "over48", "over7days"];

const state = {
  trips: [],
  selectedTripId: null,
  selectedLegId: null,
  selectedServiceName: null,
  openDrawerId: null,
  tripsFileHandle: null,
  loadedFileName: "",
  dirty: false,
  lastLocalSave: "",
  lastExport: "",
  kpiCollapsed: false,
  utilityHidden: false,
  serviceModalOpen: false
};

const lanesContainer = document.getElementById("lanesContainer");
const kpiStrip = document.getElementById("kpiStrip");
const selectedTripPanel = document.getElementById("selectedTripPanel");
const selectedUpdated = document.getElementById("selectedUpdated");
const legSelectorPanel = document.getElementById("legSelectorPanel");
const overviewPanel = document.getElementById("overviewPanel");
const selectedLegPanel = document.getElementById("selectedLegPanel");
const addServiceBtn = document.getElementById("addServiceBtn");
const editLegHeaderBtn = document.getElementById("editLegHeaderBtn");
const taskListPanel = document.getElementById("taskListPanel");
const recentUpdatesPanel = document.getElementById("recentUpdatesPanel");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const clientFilter = document.getElementById("clientFilter");
const scopeFilter = document.getElementById("scopeFilter");
const drawerPanels = [...document.querySelectorAll(".drawer-panel")];
const navButtons = [...document.querySelectorAll(".nav-btn[data-drawer]")];
const openBoardBtn = document.getElementById("openBoardBtn");
const saveFlightJsBtn = document.getElementById("saveFlightJsBtn");
const updateFlightJsBtn = document.getElementById("updateFlightJsBtn");
const boardExportStatus = document.getElementById("boardExportStatus");
const dataStatusBadge = document.getElementById("dataStatusBadge");
const workspaceDataStatus = document.getElementById("workspaceDataStatus");
const loadTripsJsBtn = document.getElementById("loadTripsJsBtn");
const saveTripsJsBtn = document.getElementById("saveTripsJsBtn");
const saveTripsJsAsBtn = document.getElementById("saveTripsJsAsBtn");
const resetWorkspaceBtn = document.getElementById("resetWorkspaceBtn");
const collapseKpiBtn = document.getElementById("collapseKpiBtn");
const toggleUtilityBtn = document.getElementById("toggleUtilityBtn");
const serviceModalBackdrop = document.getElementById("serviceModalBackdrop");
const serviceModalPills = document.getElementById("serviceModalPills");
const serviceModalEmpty = document.getElementById("serviceModalEmpty");
const closeServiceModalBtn = document.getElementById("closeServiceModalBtn");
const doneServiceModalBtn = document.getElementById("doneServiceModalBtn");
const editLegModalBackdrop = document.getElementById("editLegModalBackdrop");
const closeEditLegModalBtn = document.getElementById("closeEditLegModalBtn");
const cancelEditLegBtn = document.getElementById("cancelEditLegBtn");
const saveEditLegBtn = document.getElementById("saveEditLegBtn");
const editLegDepInput = document.getElementById("editLegDepInput");
const editLegDestInput = document.getElementById("editLegDestInput");
const editLegEtdInput = document.getElementById("editLegEtdInput");
const editLegEtaInput = document.getElementById("editLegEtaInput");

function formatLegDateTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "TBA";
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(-2);
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} - ${hours}:${minutes}`;
}

function nowStamp() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function normalizeHealth(value, leg = {}) {
  const candidate = String(value ?? "").toLowerCase();
  if (["white", "blue", "green", "amber", "red"].includes(candidate)) return candidate;
  if ((leg.alerts || []).length) return "red";
  if ((leg.tasks || []).length) return "amber";
  return "white";
}

function sanitizeTrips(input) {
  if (!Array.isArray(input)) return [];
  return input.map((trip, tripIndex) => ({
    id: trip.id ?? trip.tripRef ?? tripIndex + 1,
    tripRef: String(trip.tripRef ?? trip.id ?? `TRIP-${tripIndex + 1}`),
    callsign: String(trip.callsign ?? trip.registration ?? trip.tripRef ?? ""),
    registration: String(trip.registration ?? trip.callsign ?? ""),
    client: String(trip.client ?? trip.operator ?? "Unknown Client"),
    operator: String(trip.operator ?? trip.client ?? ""),
    owner: String(trip.owner ?? ""),
    team: String(trip.team ?? ""),
    spclCare: String(trip.spclCare ?? ""),
    account: String(trip.account ?? ""),
    aircraftType: String(trip.aircraftType ?? ""),
    mtow: trip.mtow ?? null,
    mtowUnit: String(trip.mtowUnit ?? ""),
    workflowStatus: String(trip.workflowStatus ?? (trip.status === "completed" ? "completed" : "active")).toLowerCase(),
    crew: trip.crew ?? "",
    pax: trip.pax ?? "",
    services: Array.isArray(trip.services) ? [...trip.services] : [],
    updated: String(trip.updated ?? ""),
    tripNotes: String(trip.tripNotes ?? ""),
    legs: Array.isArray(trip.legs) ? trip.legs.map((leg, legIndex) => ({
      id: leg.id ?? `${trip.tripRef ?? trip.id ?? tripIndex + 1}-${legIndex + 1}`,
      seq: leg.seq ?? legIndex + 1,
      dep: String(leg.dep ?? "TBA"),
      dest: String(leg.dest ?? "TBA"),
      etd: leg.etd ?? null,
      eta: leg.eta ?? null,
      etdRaw: leg.etdRaw ?? "",
      etaRaw: leg.etaRaw ?? "",
      handler: String(leg.handler ?? ""),
      handlingType: String(leg.handlingType ?? ""),
      far: String(leg.far ?? ""),
      legStatus: String(leg.legStatus ?? "Pending"),
      health: normalizeHealth(leg.health, leg),
      alerts: Array.isArray(leg.alerts) ? [...leg.alerts] : [],
      tasks: Array.isArray(leg.tasks) ? [...leg.tasks] : [],
      services: Array.isArray(leg.services) ? [...leg.services] : (Array.isArray(trip.services) ? [...trip.services] : []),
      note: String(leg.note ?? "")
    })) : []
  })).map(trip => {
    if (!["active", "completed"].includes(trip.workflowStatus)) trip.workflowStatus = "active";
    return trip;
  });
}

function cacheCurrentTrips() {
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(state.trips));
    localStorage.setItem(STORAGE_KEY_META, JSON.stringify({
      loadedFileName: state.loadedFileName,
      dirty: state.dirty,
      lastLocalSave: state.lastLocalSave,
      lastExport: state.lastExport
    }));
  } catch {}
}

function clearLocalCache() {
  try {
    localStorage.removeItem(STORAGE_KEY_TRIPS);
    localStorage.removeItem(STORAGE_KEY_META);
  } catch {}
}

function markDirty() {
  state.dirty = true;
  state.lastLocalSave = nowStamp();
  cacheCurrentTrips();
  updateDataStatus();
}

function markClean() {
  state.dirty = false;
  state.lastLocalSave = nowStamp();
  cacheCurrentTrips();
  updateDataStatus();
}

function getVisibleTrips(sourceTrips = state.trips, includeCompleted = false) {
  return includeCompleted ? sourceTrips : sourceTrips.filter(trip => trip.workflowStatus !== "completed");
}

function setTrips(trips, options = {}) {
  state.trips = sanitizeTrips(trips);
  state.loadedFileName = options.fileName ?? state.loadedFileName ?? "";
  const firstTrip = getVisibleTrips(state.trips, true)[0] || null;
  state.selectedTripId = firstTrip?.id ?? null;
  state.selectedLegId = firstTrip?.legs?.[0]?.id ?? null;
  state.selectedServiceName = null;
}

function updateDataStatus() {
  if (!dataStatusBadge || !workspaceDataStatus) return;
  dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty", "status-error");
  if (!state.trips.length) {
    dataStatusBadge.classList.add("status-empty");
    dataStatusBadge.textContent = "No trips loaded";
    workspaceDataStatus.classList.remove("success", "error", "warning");
    workspaceDataStatus.textContent = "No trips loaded.\nLoad a local trips.js file to begin.";
    return;
  }
  if (state.dirty) {
    dataStatusBadge.classList.add("status-dirty");
    dataStatusBadge.textContent = "Unsaved changes";
    workspaceDataStatus.classList.remove("success", "error");
    workspaceDataStatus.classList.add("warning");
    workspaceDataStatus.textContent = `Loaded file: ${state.loadedFileName || "Local draft"}\nTrips in workspace: ${state.trips.length}\nLocal draft cached: ${state.lastLocalSave || "Just now"}\nExport required: Yes`;
    return;
  }
  dataStatusBadge.classList.add("status-clean");
  dataStatusBadge.textContent = state.loadedFileName ? "Loaded from local file" : "Local draft loaded";
  workspaceDataStatus.classList.remove("error", "warning");
  workspaceDataStatus.classList.add("success");
  workspaceDataStatus.textContent = `Loaded file: ${state.loadedFileName || "Local draft"}\nTrips in workspace: ${state.trips.length}\nLocal cache updated: ${state.lastLocalSave || "N/A"}\nExport required: No`;
}

function populateClientFilter() {
  if (!clientFilter) return;
  const currentValue = clientFilter.value || "all";
  const counts = new Map();
  state.trips.forEach(trip => counts.set(trip.client || "Unknown Client", (counts.get(trip.client || "Unknown Client") || 0) + 1));
  const clients = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  clientFilter.innerHTML = '<option value="all">All Clients</option>';
  clients.forEach(([name, count]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${count})`;
    clientFilter.appendChild(option);
  });
  clientFilter.value = clients.some(([name]) => name === currentValue) ? currentValue : "all";
}

function getPrimaryLeg(trip) {
  if (!trip?.legs?.length) return null;
  return [...trip.legs].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
}

function getLegHealth(leg) {
  return normalizeHealth(leg.health, leg);
}

function getTripHealth(trip) {
  if (!trip?.legs?.length) return "white";
  const healths = trip.legs.map(leg => getLegHealth(leg));
  const hasWhite = healths.includes("white");
  const hasBlue = healths.includes("blue");
  const hasRed = healths.includes("red");
  const hasAmber = healths.includes("amber");
  const hasGreen = healths.includes("green");

  if (hasBlue) return "blue";
  if (hasRed) return hasWhite ? "striped-red" : "red";
  if (hasAmber) return hasWhite ? "striped-amber" : "amber";
  if (hasGreen) return hasWhite ? "striped-green" : "green";
  return "white";
}

function getTripFilterHealth(trip) {
  const displayHealth = getTripHealth(trip);
  if (["white", "striped-green", "striped-amber", "striped-red"].includes(displayHealth)) {
    return "white";
  }
  return displayHealth;
}

function getTripAlertsCount(trip) {
  return trip.legs.reduce((sum, leg) => sum + (leg.alerts || []).length, 0);
}

function getTripServicesCount(trip) {
  return trip.legs.reduce((sum, leg) => sum + (Array.isArray(leg.services) ? leg.services.length : 0), 0);
}

function getLaneForTrip(trip) {
  if (!trip || trip.workflowStatus === "completed") return null;
  const firstLeg = getPrimaryLeg(trip);
  if (!firstLeg || !firstLeg.etd || Number.isNaN(Date.parse(firstLeg.etd))) return "over7days";
  const hours = (Date.parse(firstLeg.etd) - Date.now()) / 3600000;
  if (hours <= 24) return "operating";
  if (hours <= 48) return "hours24to48";
  if (hours <= 168) return "over48";
  return "over7days";
}

function getFilteredTrips() {
  const search = searchInput?.value.trim().toLowerCase() || "";
  const healthFilter = statusFilter?.value || "all";
  const client = clientFilter?.value || "all";
  const includeCompleted = (scopeFilter?.value === "includeCompleted" || scopeFilter?.value === "all");

  return getVisibleTrips(state.trips, includeCompleted).filter(trip => {
    const matchesSearch = !search ||
      (trip.callsign || "").toLowerCase().includes(search) ||
      (trip.registration || "").toLowerCase().includes(search) ||
      (trip.client || "").toLowerCase().includes(search) ||
      (trip.tripRef || "").toLowerCase().includes(search) ||
      trip.legs.some(leg => (leg.dep || "").toLowerCase().includes(search) || (leg.dest || "").toLowerCase().includes(search));
    const matchesHealth = healthFilter === "all" || getTripFilterHealth(trip) === healthFilter;
    const matchesClient = client === "all" || trip.client === client;
    return matchesSearch && matchesHealth && matchesClient;
  });
}

function getSelectedTrip(filteredTrips) {
  return filteredTrips.find(t => t.id === state.selectedTripId) || filteredTrips[0] || null;
}

function getSelectedLeg(trip) {
  if (!trip) return null;
  return trip.legs.find(l => l.id === state.selectedLegId) || trip.legs[0] || null;
}

function getAvailableServicesForLeg(leg) {
  const existing = new Set((Array.isArray(leg?.services) ? leg.services : []).map(s => String(s).toLowerCase()));
  return SERVICE_CATALOG.filter(service => !existing.has(service.toLowerCase()));
}

function closeServiceModal() {
  state.serviceModalOpen = false;
  if (serviceModalBackdrop) serviceModalBackdrop.classList.add("hidden");
}

function renderServiceModal(trip, leg) {
  if (!serviceModalBackdrop || !serviceModalPills || !serviceModalEmpty) return;
  if (!state.serviceModalOpen || !trip || !leg) {
    closeServiceModal();
    return;
  }

  const available = getAvailableServicesForLeg(leg);
  serviceModalBackdrop.classList.remove("hidden");
  serviceModalPills.innerHTML = available.map(service =>
    `<button type="button" class="service-modal-pill" data-service-option="${escapeAttribute(service)}">${escapeHtml(service)}</button>`
  ).join("");
  serviceModalEmpty.classList.toggle("hidden", available.length !== 0);

  serviceModalPills.querySelectorAll("[data-service-option]").forEach(btn => btn.addEventListener("click", () => {
    const value = btn.dataset.serviceOption;
    if (!Array.isArray(leg.services)) leg.services = [];
    if (!leg.services.some(s => String(s).toLowerCase() === value.toLowerCase())) {
      leg.services.push(value);
      state.selectedServiceName = value;
      markDirty();
      render();
    }
  }));
}

function openServiceModal() {
  const trip = getSelectedTrip(getFilteredTrips());
  const leg = getSelectedLeg(trip);
  if (!leg) return;
  state.serviceModalOpen = true;
  renderServiceModal(trip, leg);
}


function isoToDatetimeLocal(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function datetimeLocalToIso(value) {
  if (!value) return null;
  const parsed = new Date(`${value}:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function closeEditLegModal() {
  if (editLegModalBackdrop) editLegModalBackdrop.classList.add("hidden");
}

function openEditLegModal() {
  const trip = getSelectedTrip(getFilteredTrips());
  const leg = getSelectedLeg(trip);
  if (!trip || !leg) return;
  if (editLegDepInput) editLegDepInput.value = (leg.dep || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  if (editLegDestInput) editLegDestInput.value = (leg.dest || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  if (editLegEtdInput) editLegEtdInput.value = isoToDatetimeLocal(leg.etd);
  if (editLegEtaInput) editLegEtaInput.value = isoToDatetimeLocal(leg.eta);
  if (editLegModalBackdrop) editLegModalBackdrop.classList.remove("hidden");
}

function saveEditLegChanges() {
  const trip = getSelectedTrip(getFilteredTrips());
  const leg = getSelectedLeg(trip);
  if (!trip || !leg) return;

  const dep = (editLegDepInput?.value || "").trim().toUpperCase();
  const dest = (editLegDestInput?.value || "").trim().toUpperCase();
  const etdIso = datetimeLocalToIso(editLegEtdInput?.value || "");
  const etaIso = datetimeLocalToIso(editLegEtaInput?.value || "");

  leg.dep = dep || "TBA";
  leg.dest = dest || "TBA";
  leg.etd = etdIso;
  leg.eta = etaIso;
  leg.health = "blue";

  markDirty();
  closeEditLegModal();
  render();
}

function renderKPIs(filteredTrips) {
  if (!kpiStrip) return;
  if (state.kpiCollapsed) {
    kpiStrip.innerHTML = "";
    kpiStrip.style.display = "none";
    return;
  }
  kpiStrip.style.display = "grid";
  const counts = {
    operating: filteredTrips.filter(t => getLaneForTrip(t) === "operating").length,
    hours24to48: filteredTrips.filter(t => getLaneForTrip(t) === "hours24to48").length,
    over48: filteredTrips.filter(t => getLaneForTrip(t) === "over48").length,
    over7days: filteredTrips.filter(t => getLaneForTrip(t) === "over7days").length
  };
  const kpis = [
    { label: "Operating", value: counts.operating },
    { label: "24-48hrs", value: counts.hours24to48 },
    { label: ">48hrs", value: counts.over48 },
    { label: ">7days", value: counts.over7days }
  ];
  kpiStrip.innerHTML = kpis.map(item => `<div class="kpi-card"><div class="kpi-label">${item.label}</div><div class="kpi-value">${item.value}</div></div>`).join("");
}

function renderLanes(filteredTrips) {
  if (!lanesContainer) return;
  lanesContainer.innerHTML = lanes.map(key => {
    const cfg = laneConfig[key];
    const laneTrips = filteredTrips.filter(trip => getLaneForTrip(trip) === key);
    return `<section class="lane">
      <div class="lane-header">
        <div class="lane-title"><span class="lane-dot ${cfg.dotClass}"></span><div class="lane-name">${cfg.label}</div></div>
        <div class="lane-count">${laneTrips.length}</div>
      </div>
      <div class="lane-body">
        ${laneTrips.length ? laneTrips.map(trip => `<button class="trip-card health-${getTripHealth(trip)} ${trip.id === state.selectedTripId ? "selected" : ""}" data-trip-id="${trip.id}">
          <div class="trip-top"><div class="trip-ref">${escapeHtml(trip.tripRef)}</div><div class="trip-callsign">${escapeHtml(trip.registration || "—")}</div></div>
          <div class="trip-metrics">
            <div class="trip-metric"><span class="metric-icon">✈</span><span class="metric-value">${trip.legs.length}</span></div>
            <div class="trip-metric"><span class="metric-icon">⚙</span><span class="metric-value">${getTripServicesCount(trip)}</span></div>
            <div class="trip-metric"><span class="metric-icon">!</span><span class="metric-value">${getTripAlertsCount(trip)}</span></div>
          </div>
        </button>`).join("") : `<div class="empty-lane">No trips in this lane.</div>`}
      </div>
    </section>`;
  }).join("");

  document.querySelectorAll(".trip-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedTripId = Number(card.dataset.tripId);
      const trip = state.trips.find(t => t.id === state.selectedTripId);
      state.selectedLegId = trip?.legs?.[0]?.id || null;
      render();
    });
  });
}

function renderSelectedTrip(trip, leg) {
  if (!selectedTripPanel || !selectedUpdated) return;
  if (!trip || !leg) {
    selectedUpdated.textContent = "";
    selectedTripPanel.innerHTML = `<div class="empty-state-card"><h3>No Trip Selected</h3><p>Load a trips.js file and select a trip to begin.</p></div>`;
    return;
  }
  selectedUpdated.textContent = trip.updated ? `Last update ${trip.updated}` : "Trip identity";
  selectedTripPanel.innerHTML = `<div class="selected-header">
    <div>
      <div class="selected-client">${escapeHtml(trip.client || "Unknown Client")}</div>
      <div class="selected-callsign">${escapeHtml(trip.registration || "—")}</div>
      <div class="selected-route">Trip ${escapeHtml(trip.tripRef || "—")}</div>
      <div class="selected-meta">${escapeHtml(trip.registration || "—")} · ${escapeHtml(trip.aircraftType || "—")} · ${escapeHtml(trip.operator || trip.client || "")}</div>
    </div>
    <div class="action-buttons">
      <button class="primary">Edit Trip</button>
      <button type="button" class="workflow-btn ${trip.workflowStatus === "active" ? "active" : ""}" data-trip-workflow="active">Reopen Trip</button>
      <button type="button" class="workflow-btn ${trip.workflowStatus === "completed" ? "active" : ""}" data-trip-workflow="completed">Mark Completed</button>
    </div>
  </div>`;
  selectedTripPanel.querySelectorAll("[data-trip-workflow]").forEach(btn => btn.addEventListener("click", () => {
    trip.workflowStatus = btn.dataset.tripWorkflow;
    markDirty();
    render();
  }));
}

function renderLegSelector(trip) {
  if (!legSelectorPanel) return;
  if (!trip) {
    legSelectorPanel.innerHTML = `<div class="empty-state-card"><h3>No Legs Available</h3><p>Once a trips.js file is loaded, leg selection will appear here.</p></div>`;
    return;
  }
  legSelectorPanel.innerHTML = `<div class="leg-selector-row">
    ${trip.legs.map(leg => `<button class="leg-tab ${leg.id === state.selectedLegId ? "active" : ""}" data-leg-id="${leg.id}">
      <div class="leg-tab-seq">Leg ${leg.seq}</div>
      <div class="leg-tab-route">${escapeHtml(leg.dep)} → ${escapeHtml(leg.dest)}</div>
      <div class="leg-tab-time">ETD ${formatLegDateTime(leg.etd)}</div>
      <div class="leg-tab-time">ETA ${formatLegDateTime(leg.eta)}</div>
      <div class="leg-tab-status"><span class="health-dot ${getLegHealth(leg)}"></span>${getLegHealth(leg).toUpperCase()}</div>
    </button>`).join("")}
  </div>`;
  legSelectorPanel.querySelectorAll(".leg-tab").forEach(btn => btn.addEventListener("click", () => {
    state.selectedLegId = btn.dataset.legId;
    state.selectedServiceName = null;
    render();
  }));
}

function renderSelectedLeg(trip, leg) {
  if (!selectedLegPanel) return;
  if (!trip || !leg) {
    selectedLegPanel.innerHTML = `<div class="empty-state-card"><h3>No Leg Selected</h3><p>Select a leg to view its working detail, health, and services.</p></div>`;
    if (addServiceBtn) addServiceBtn.disabled = true;
    if (editLegHeaderBtn) editLegHeaderBtn.disabled = true;
    return;
  }

  const services = Array.isArray(leg.services) ? leg.services : [];

  selectedLegPanel.innerHTML = `<div class="selected-leg-stack">
    <div class="selected-leg-header">
      <div>
        <div class="selected-leg-callsign">${escapeHtml((trip.callsign && String(trip.callsign).trim()) ? trip.callsign : (trip.registration || "—"))}</div>
        <div class="selected-leg-route">${escapeHtml(leg.dep || "TBA")} → ${escapeHtml(leg.dest || "TBA")}</div>
      </div>
      <div class="action-buttons">
        
      </div>
    </div>
    <div class="info-grid selected-leg-grid">
      <div class="info-card"><div class="info-label">Departure</div><div class="info-value">${escapeHtml(leg.dep || "TBA")}</div></div>
      <div class="info-card"><div class="info-label">Arrival</div><div class="info-value">${escapeHtml(leg.dest || "TBA")}</div></div>
      <div class="info-card"><div class="info-label">ETD</div><div class="info-value">${formatLegDateTime(leg.etd)}</div></div>
      <div class="info-card"><div class="info-label">ETA</div><div class="info-value">${formatLegDateTime(leg.eta)}</div></div>
    </div>
    <div class="control-card">
      <div class="control-title">Leg Health</div>
      <div class="health-controls">
        <button type="button" class="health-btn white ${getLegHealth(leg) === "white" ? "active" : ""}" data-leg-health="white">White</button>
        <button type="button" class="health-btn blue ${getLegHealth(leg) === "blue" ? "active" : ""}" data-leg-health="blue">Blue</button>
        <button type="button" class="health-btn green ${getLegHealth(leg) === "green" ? "active" : ""}" data-leg-health="green">Green</button>
        <button type="button" class="health-btn amber ${getLegHealth(leg) === "amber" ? "active" : ""}" data-leg-health="amber">Amber</button>
        <button type="button" class="health-btn red ${getLegHealth(leg) === "red" ? "active" : ""}" data-leg-health="red">Red</button>
      </div>
    </div>
    <div class="selected-leg-services-block">
      <div class="generic-title">Services</div>
      ${services.length
        ? `<div class="service-stack">${services.map((s, index) => `<button type="button" class="service-pill ${state.selectedServiceName === s ? "selected" : ""}" data-service-name="${escapeAttribute(s)}" data-service-index="${index}">
            <span>${escapeHtml(s)}</span>
            <span class="service-pill-remove" data-remove-service="${escapeAttribute(s)}" title="Remove service">−</span>
          </button>`).join("")}</div>`
        : `<div class="generic-card compact-empty"><div class="generic-text">No services recorded on this leg.</div></div>`}
    </div>
  </div>`;

  if (addServiceBtn) addServiceBtn.disabled = false;
  if (editLegHeaderBtn) editLegHeaderBtn.disabled = false;

  selectedLegPanel.querySelectorAll("[data-leg-health]").forEach(btn => btn.addEventListener("click", () => {
    leg.health = btn.dataset.legHealth;
    markDirty();
    render();
  }));

  selectedLegPanel.querySelectorAll("[data-service-name]").forEach(btn => btn.addEventListener("click", (event) => {
    if (event.target && event.target.closest("[data-remove-service]")) return;
    state.selectedServiceName = btn.dataset.serviceName;
    renderSelectedLeg(trip, leg);
  }));

  selectedLegPanel.querySelectorAll("[data-remove-service]").forEach(btn => btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const serviceName = btn.getAttribute("data-remove-service");
    if (!Array.isArray(leg.services)) leg.services = [];
    leg.services = leg.services.filter(s => s !== serviceName);
    if (state.selectedServiceName === serviceName) state.selectedServiceName = null;
    markDirty();
    render();
  }));

}

function renderAlertsAndTasks(trip, leg) {
  return;
}

function renderOverview(trip, leg) {
  if (!overviewPanel) return;
  if (!trip || !leg) {
    overviewPanel.innerHTML = `<div class="empty-state-card"><h3>Leg Notes Empty</h3><p>Leg notes will appear here after loading a trips.js file.</p></div>`;
    return;
  }

  overviewPanel.innerHTML = `<div class="stack">
    <div class="generic-card">
      <div class="generic-title">Leg Notes</div>
      <textarea id="legNotesInput" class="leg-notes-box" placeholder="Add working notes for this leg...">${escapeHtml(leg.note || "")}</textarea>
      <div class="leg-notes-help">Notes are stored against the selected leg and cached locally.</div>
    </div>
  </div>`;

  const notesInput = document.getElementById("legNotesInput");
  if (notesInput) {
    notesInput.addEventListener("input", () => {
      leg.note = notesInput.value;
      markDirty();
    });
  }
}

function renderTaskList(filteredTrips) {
  if (!taskListPanel) return;
  const items = filteredTrips.flatMap(trip => trip.legs.flatMap(leg => (leg.tasks || []).map(task => ({
    callsign: trip.callsign,
    route: `${leg.dep} → ${leg.dest}`,
    task
  })))).slice(0, 8);
  taskListPanel.innerHTML = items.length
    ? items.map(item => `<div class="task-list-item"><div class="small">${escapeHtml(item.callsign)} · ${escapeHtml(item.route)}</div><div class="main">${escapeHtml(item.task)}</div></div>`).join("")
    : `<div class="generic-card"><div class="generic-text">No tasks to display.</div></div>`;
}

function renderRecentUpdates(filteredTrips) {
  if (!recentUpdatesPanel) return;
  if (!filteredTrips.length) {
    recentUpdatesPanel.innerHTML = `<div class="generic-card"><div class="generic-text">No updates available. Load a trips.js file to begin.</div></div>`;
    return;
  }
  const updates = filteredTrips.slice(0, 5).map(trip => `${trip.registration || trip.callsign} in ${laneConfig[getLaneForTrip(trip)]?.label || "Completed"} with ${getTripHealth(trip).toUpperCase()} trip health.`);
  recentUpdatesPanel.innerHTML = updates.map(item => `<div class="update-item"><div class="main">${escapeHtml(item)}</div></div>`).join("");
}

function isValidIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function buildGallimimusFlights(sourceTrips) {
  const byRegistration = new Map();
  sourceTrips.filter(trip => trip.workflowStatus !== "completed").forEach(trip => {
    const registration = trip.registration || trip.callsign || "UNKNOWN";
    const aircraftType = trip.aircraftType || "";
    if (!byRegistration.has(registration)) byRegistration.set(registration, { registration, aircraftType, sectors: [] });
    const target = byRegistration.get(registration);
    trip.legs.forEach(leg => {
      if (!isValidIsoDate(leg.etd) || !isValidIsoDate(leg.eta)) return;
      target.sectors.push({
        callsign: trip.callsign || registration,
        dep: leg.dep,
        dest: leg.dest,
        etdUtc: leg.etd,
        etaUtc: leg.eta
      });
    });
  });
  return Array.from(byRegistration.values())
    .map(entry => ({ ...entry, sectors: entry.sectors.sort((a, b) => Date.parse(a.etdUtc) - Date.parse(b.etdUtc)) }))
    .filter(entry => entry.sectors.length);
}

function serializeGallimimusFlights(sourceTrips) {
  return `window.GALLIMIMUS_FLIGHTS = ${JSON.stringify(buildGallimimusFlights(sourceTrips), null, 2)};\n`;
}

function serializeTripsJs(sourceTrips) {
  return `window.trips = ${JSON.stringify(sourceTrips, null, 2)};\n`;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setBoardExportStatus(message, type = "") {
  if (!boardExportStatus) return;
  boardExportStatus.textContent = message;
  boardExportStatus.classList.remove("success", "error", "warning");
  if (type) boardExportStatus.classList.add(type);
}

async function saveTextToHandle(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveFileWithPicker(content, filename, description) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description, accept: { "text/javascript": [".js"] } }]
    });
    await saveTextToHandle(handle, content);
    return handle;
  }
  downloadTextFile(filename, content);
  return null;
}

async function saveBoardFlightJs() {
  if (!state.trips.length) {
    setBoardExportStatus("No trips loaded. Load a local trips.js first.", "error");
    return;
  }
  const exportTrips = buildGallimimusFlights(state.trips);
  if (!exportTrips.length) {
    setBoardExportStatus("No exportable legs found. Completed trips or legs without valid ETD and ETA were skipped.", "error");
    return;
  }
  try {
    await saveFileWithPicker(serializeGallimimusFlights(state.trips), "flight.js", "Gallimimus flight export");
    const sectorCount = exportTrips.reduce((sum, item) => sum + item.sectors.length, 0);
    setBoardExportStatus(`flight.js generated with ${exportTrips.length} aircraft and ${sectorCount} sectors.`, "success");
  } catch (error) {
    setBoardExportStatus(`flight.js export failed: ${error.message}`, "error");
  }
}

function openGallimimusBoard() {
  window.open("board.html", "_blank");
}

function setDrawer(drawerId) {
  state.openDrawerId = drawerId;
  drawerPanels.forEach(panel => {
    const shouldOpen = panel.id === drawerId;
    panel.classList.toggle("open", shouldOpen);
    panel.classList.toggle("hidden", !shouldOpen);
  });
  navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.drawer === drawerId));
}

function showNoDataState() {
  populateClientFilter();
  updateDataStatus();
  render();
}

function parseTripsJsText(text) {
  const sandboxWindow = {};
  const fn = new Function("window", `${text}\n; return window.trips;`);
  return fn(sandboxWindow);
}

async function loadTripsFromFileHandle(handle) {
  const file = await handle.getFile();
  const parsedTrips = parseTripsJsText(await file.text());
  if (!Array.isArray(parsedTrips)) throw new Error("Loaded file does not expose window.trips as an array.");
  state.tripsFileHandle = handle;
  state.loadedFileName = file.name;
  setTrips(parsedTrips, { fileName: file.name });
  markClean();
  render();
}

async function loadTripsJs() {
  try {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "Trips JavaScript", accept: { "text/javascript": [".js"] } }]
      });
      if (handle) await loadTripsFromFileHandle(handle);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".js,text/javascript";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      setTrips(parseTripsJsText(await file.text()), { fileName: file.name });
      state.tripsFileHandle = null;
      markClean();
      render();
    });
    input.click();
  } catch (error) {
    if (workspaceDataStatus) {
      workspaceDataStatus.classList.remove("success", "warning");
      workspaceDataStatus.classList.add("error");
      workspaceDataStatus.textContent = `Load failed.\n${error.message}`;
    }
    if (dataStatusBadge) {
      dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
      dataStatusBadge.classList.add("status-error");
      dataStatusBadge.textContent = "Load failed";
    }
  }
}

async function saveTripsJs(useSaveAs = false) {
  if (!state.trips.length) {
    if (workspaceDataStatus) {
      workspaceDataStatus.classList.remove("success", "warning");
      workspaceDataStatus.classList.add("error");
      workspaceDataStatus.textContent = "Nothing to save.\nLoad a local trips.js first.";
    }
    if (dataStatusBadge) {
      dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
      dataStatusBadge.classList.add("status-error");
      dataStatusBadge.textContent = "No data to save";
    }
    return;
  }
  try {
    const content = serializeTripsJs(state.trips);
    if (!useSaveAs && state.tripsFileHandle && window.showSaveFilePicker) {
      await saveTextToHandle(state.tripsFileHandle, content);
    } else {
      const handle = await saveFileWithPicker(content, state.loadedFileName || "trips.js", "Workspace trips export");
      if (handle) state.tripsFileHandle = handle;
    }
    state.lastExport = nowStamp();
    markClean();
    render();
  } catch (error) {
    if (workspaceDataStatus) {
      workspaceDataStatus.classList.remove("success", "warning");
      workspaceDataStatus.classList.add("error");
      workspaceDataStatus.textContent = `Save failed.\n${error.message}`;
    }
    if (dataStatusBadge) {
      dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
      dataStatusBadge.classList.add("status-error");
      dataStatusBadge.textContent = "Save failed";
    }
  }
}

function resetWorkspace() {
  state.trips = [];
  state.selectedTripId = null;
  state.selectedLegId = null;
  state.selectedServiceName = null;
  state.tripsFileHandle = null;
  state.loadedFileName = "";
  state.dirty = false;
  state.lastLocalSave = "";
  state.lastExport = "";
  clearLocalCache();
  closeServiceModal();
  showNoDataState();
}

function render() {
  populateClientFilter();
  updateDataStatus();
  const filteredTrips = getFilteredTrips();
  const selectedTrip = getSelectedTrip(filteredTrips);

  if (selectedTrip) {
    state.selectedTripId = selectedTrip.id;
    if (!selectedTrip.legs.some(l => l.id === state.selectedLegId)) {
      state.selectedLegId = selectedTrip.legs[0]?.id || null;
    }
  } else {
    state.selectedTripId = null;
    state.selectedLegId = null;
  }

  const selectedLeg = getSelectedLeg(selectedTrip);
  renderKPIs(filteredTrips);
  renderLanes(filteredTrips);
  renderSelectedTrip(selectedTrip, selectedLeg);
  renderLegSelector(selectedTrip);
  renderSelectedLeg(selectedTrip, selectedLeg);

  if (state.serviceModalOpen) {
    if (selectedTrip && selectedLeg) {
      renderServiceModal(selectedTrip, selectedLeg);
    } else {
      closeServiceModal();
    }
  }

  renderOverview(selectedTrip, selectedLeg);
  renderTaskList(filteredTrips);
  renderRecentUpdates(filteredTrips);

  const rightPanels = document.querySelector(".right-panels");
  if (rightPanels) rightPanels.style.display = state.utilityHidden ? "none" : "";
}

navButtons.forEach(btn => btn.addEventListener("click", () => setDrawer(state.openDrawerId === btn.dataset.drawer ? null : btn.dataset.drawer)));
document.querySelectorAll("[data-close-drawer]").forEach(btn => btn.addEventListener("click", () => setDrawer(null)));
[searchInput, statusFilter, clientFilter, scopeFilter].forEach(el => {
  el?.addEventListener("input", render);
  el?.addEventListener("change", render);
});
openBoardBtn?.addEventListener("click", openGallimimusBoard);
saveFlightJsBtn?.addEventListener("click", saveBoardFlightJs);
updateFlightJsBtn?.addEventListener("click", saveBoardFlightJs);
loadTripsJsBtn?.addEventListener("click", loadTripsJs);
saveTripsJsBtn?.addEventListener("click", () => saveTripsJs(false));
saveTripsJsAsBtn?.addEventListener("click", () => saveTripsJs(true));
resetWorkspaceBtn?.addEventListener("click", resetWorkspace);
collapseKpiBtn?.addEventListener("click", () => {
  state.kpiCollapsed = !state.kpiCollapsed;
  collapseKpiBtn.textContent = state.kpiCollapsed ? "Expand KPI strip" : "Collapse KPI strip";
  render();
});
toggleUtilityBtn?.addEventListener("click", () => {
  state.utilityHidden = !state.utilityHidden;
  toggleUtilityBtn.textContent = state.utilityHidden ? "Show utility column" : "Toggle utility column";
  render();
});
addServiceBtn?.addEventListener("click", openServiceModal);
editLegHeaderBtn?.addEventListener("click", openEditLegModal);
closeServiceModalBtn?.addEventListener("click", closeServiceModal);
doneServiceModalBtn?.addEventListener("click", closeServiceModal);
serviceModalBackdrop?.addEventListener("click", (event) => {
  if (event.target === serviceModalBackdrop) closeServiceModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.serviceModalOpen) closeServiceModal();
});
closeEditLegModalBtn?.addEventListener("click", closeEditLegModal);
cancelEditLegBtn?.addEventListener("click", closeEditLegModal);
saveEditLegBtn?.addEventListener("click", saveEditLegChanges);
editLegModalBackdrop?.addEventListener("click", (event) => {
  if (event.target === editLegModalBackdrop) closeEditLegModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editLegModalBackdrop && !editLegModalBackdrop.classList.contains("hidden")) {
    closeEditLegModal();
  }
});

setDrawer("workspaceDrawer");
showNoDataState();
