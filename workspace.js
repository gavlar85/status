
const STORAGE_KEY_TRIPS = "workspace_local_trips_v2";
const STORAGE_KEY_META = "workspace_local_meta_v2";

const healthRank = { green: 0, amber: 1, red: 2 };
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
  openDrawerId: null,
  tripsFileHandle: null,
  loadedFileName: "",
  dirty: false,
  lastLocalSave: "",
  lastExport: "",
  kpiCollapsed: false,
  utilityHidden: false
};

const lanesContainer = document.getElementById("lanesContainer");
const kpiStrip = document.getElementById("kpiStrip");
const selectedTripPanel = document.getElementById("selectedTripPanel");
const selectedUpdated = document.getElementById("selectedUpdated");
const legSelectorPanel = document.getElementById("legSelectorPanel");
const alertsTasksPanel = document.getElementById("alertsTasksPanel");
const overviewPanel = document.getElementById("overviewPanel");
const servicesPanel = document.getElementById("servicesPanel");
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

function normalizeHealth(value, leg = {}) {
  const candidate = String(value ?? "").toLowerCase();
  if (["green", "amber", "red"].includes(candidate)) return candidate;
  if ((leg.alerts || []).length) return "red";
  if ((leg.tasks || []).length) return "amber";
  return "green";
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
}

function updateDataStatus() {
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
  const currentValue = clientFilter.value || "all";
  const counts = new Map();
  state.trips.forEach(trip => counts.set(trip.client || "Unknown Client", (counts.get(trip.client || "Unknown Client") || 0) + 1));
  const clients = Array.from(counts.entries()).sort((a,b) => a[0].localeCompare(b[0]));
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
  if (!trip?.legs?.length) return "green";
  return trip.legs.reduce((worst, leg) => {
    const current = getLegHealth(leg);
    return healthRank[current] > healthRank[worst] ? current : worst;
  }, "green");
}

function getTripAlertsCount(trip) {
  return trip.legs.reduce((sum, leg) => sum + (leg.alerts || []).length, 0);
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
  const search = searchInput.value.trim().toLowerCase();
  const healthFilter = statusFilter.value;
  const client = clientFilter.value;
  const includeCompleted = scopeFilter.value === "includeCompleted" || scopeFilter.value === "all";

  return getVisibleTrips(state.trips, includeCompleted).filter(trip => {
    const matchesSearch = !search ||
      (trip.callsign || "").toLowerCase().includes(search) ||
      (trip.registration || "").toLowerCase().includes(search) ||
      (trip.client || "").toLowerCase().includes(search) ||
      (trip.tripRef || "").toLowerCase().includes(search) ||
      trip.legs.some(leg => (leg.dep || "").toLowerCase().includes(search) || (leg.dest || "").toLowerCase().includes(search));
    const matchesHealth = healthFilter === "all" || getTripHealth(trip) === healthFilter;
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

function renderKPIs(filteredTrips) {
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
          <div class="trip-top"><div class="trip-ref">${trip.tripRef}</div><div class="trip-callsign">${trip.callsign}</div></div>
          <div class="trip-metrics">
            <div class="trip-metric"><span class="metric-icon">✈</span><span class="metric-value">${trip.legs.length}</span></div>
            <div class="trip-metric"><span class="metric-icon">⚙</span><span class="metric-value">${trip.services.length}</span></div>
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
  if (!trip || !leg) {
    selectedUpdated.textContent = "";
    selectedTripPanel.innerHTML = `<div class="empty-state-card"><h3>No Trip Selected</h3><p>Load a local trips.js from the Workspace Drawer to populate the workspace.</p></div>`;
    return;
  }
  selectedUpdated.textContent = trip.updated ? `Last update ${trip.updated}` : "";
  selectedTripPanel.innerHTML = `<div class="selected-header">
    <div>
      <div class="selected-client">${trip.client} · ${trip.tripRef}</div>
      <div class="selected-callsign">${trip.callsign}</div>
      <div class="selected-route">${leg.dep} → ${leg.dest}</div>
      <div class="selected-meta">${trip.registration} · ${trip.aircraftType} · Health ${getTripHealth(trip).toUpperCase()} · Workflow ${trip.workflowStatus.toUpperCase()}</div>
    </div>
    <div class="action-buttons">
      <button class="primary">Open Checklist</button>
      <button type="button" class="workflow-btn ${trip.workflowStatus === "active" ? "active" : ""}" data-trip-workflow="active">Reopen Trip</button>
      <button type="button" class="workflow-btn ${trip.workflowStatus === "completed" ? "active" : ""}" data-trip-workflow="completed">Mark Completed</button>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card"><div class="info-label">Leg ETD</div><div class="info-value">${formatLegDateTime(leg.etd)}</div></div>
    <div class="info-card"><div class="info-label">Leg ETA</div><div class="info-value">${formatLegDateTime(leg.eta)}</div></div>
    <div class="info-card"><div class="info-label">Current Lane</div><div class="info-value">${trip.workflowStatus === "completed" ? "Completed" : laneConfig[getLaneForTrip(trip)]?.label || "—"}</div></div>
    <div class="info-card"><div class="info-label">Leg Count</div><div class="info-value">${trip.legs.length}</div></div>
  </div>`;
  selectedTripPanel.querySelectorAll("[data-trip-workflow]").forEach(btn => btn.addEventListener("click", () => {
    trip.workflowStatus = btn.dataset.tripWorkflow;
    markDirty();
    render();
  }));
}

function renderLegSelector(trip) {
  if (!trip) {
    legSelectorPanel.innerHTML = `<div class="empty-state-card"><h3>No Legs Available</h3><p>Once a trips.js file is loaded, leg selection will appear here.</p></div>`;
    return;
  }
  legSelectorPanel.innerHTML = `<div class="leg-selector-row">
    ${trip.legs.map(leg => `<button class="leg-tab ${leg.id === state.selectedLegId ? "active" : ""}" data-leg-id="${leg.id}">
      <div class="leg-tab-seq">Leg ${leg.seq}</div>
      <div class="leg-tab-route">${leg.dep} → ${leg.dest}</div>
      <div class="leg-tab-time">ETD ${formatLegDateTime(leg.etd)}</div>
      <div class="leg-tab-time">ETA ${formatLegDateTime(leg.eta)}</div>
      <div class="leg-tab-status"><span class="health-dot ${getLegHealth(leg)}"></span>${getLegHealth(leg).toUpperCase()}</div>
    </button>`).join("")}
  </div>`;
  legSelectorPanel.querySelectorAll(".leg-tab").forEach(btn => btn.addEventListener("click", () => {
    state.selectedLegId = btn.dataset.legId;
    render();
  }));
}

function renderAlertsAndTasks(trip, leg) {
  if (!trip || !leg) {
    alertsTasksPanel.innerHTML = `<div class="empty-state-card" style="grid-column:1/-1"><h3>No Active Data</h3><p>Alerts and tasks will appear once a leg is selected.</p></div>`;
    return;
  }
  alertsTasksPanel.innerHTML = `<div class="stack">
    <div class="control-card">
      <div class="control-title">Leg Health</div>
      <div class="health-controls">
        <button type="button" class="health-btn green ${getLegHealth(leg) === "green" ? "active" : ""}" data-leg-health="green">Green</button>
        <button type="button" class="health-btn amber ${getLegHealth(leg) === "amber" ? "active" : ""}" data-leg-health="amber">Amber</button>
        <button type="button" class="health-btn red ${getLegHealth(leg) === "red" ? "active" : ""}" data-leg-health="red">Red</button>
      </div>
    </div>
    <div class="stack-title">Alerts</div>
    ${(leg.alerts || []).length ? leg.alerts.map(a => `<div class="alert-card">${a}</div>`).join("") : `<div class="generic-card"><div class="generic-text">No active alerts.</div></div>`}
  </div>
  <div class="stack">
    <div class="control-card">
      <div class="control-title">Trip Workflow</div>
      <div class="workflow-controls">
        <button type="button" class="workflow-btn ${trip.workflowStatus === "active" ? "active" : ""}" data-trip-workflow="active">Active</button>
        <button type="button" class="workflow-btn ${trip.workflowStatus === "completed" ? "active" : ""}" data-trip-workflow="completed">Completed</button>
      </div>
    </div>
    <div class="stack-title">Next Tasks</div>
    ${(leg.tasks || []).length ? leg.tasks.map(t => `<div class="task-card">${t}</div>`).join("") : `<div class="generic-card"><div class="generic-text">No outstanding tasks.</div></div>`}
  </div>`;

  alertsTasksPanel.querySelectorAll("[data-leg-health]").forEach(btn => btn.addEventListener("click", () => {
    leg.health = btn.dataset.legHealth;
    markDirty();
    render();
  }));
  alertsTasksPanel.querySelectorAll("[data-trip-workflow]").forEach(btn => btn.addEventListener("click", () => {
    trip.workflowStatus = btn.dataset.tripWorkflow;
    markDirty();
    render();
  }));
}

function renderOverview(trip, leg) {
  if (!trip || !leg) {
    overviewPanel.innerHTML = `<div class="empty-state-card"><h3>Overview Empty</h3><p>Trip overview will appear here after loading a trips.js file.</p></div>`;
    servicesPanel.innerHTML = `<div class="empty-state-card"><h3>No Services Loaded</h3><p>Services from the selected trip will appear here.</p></div>`;
    return;
  }
  overviewPanel.innerHTML = `<div class="stack">
    <div class="generic-card"><div class="generic-title">Selected Leg</div><div class="generic-text">${leg.dep} → ${leg.dest} · ${getLegHealth(leg).toUpperCase()}</div></div>
    <div class="generic-card"><div class="generic-title">Handler</div><div class="generic-text">${leg.handler || "No handler recorded"}${leg.handlingType ? ` · ${leg.handlingType}` : ""}</div></div>
    <div class="generic-card"><div class="generic-title">Trip Note</div><div class="generic-text">${trip.tripNotes || "No trip notes recorded."}</div></div>
  </div>`;
  servicesPanel.innerHTML = trip.services.length ? `<div class="service-tags">${trip.services.map(s => `<span class="service-tag">${s}</span>`).join("")}</div>` : `<div class="generic-card"><div class="generic-text">No services recorded on this trip.</div></div>`;
}

function renderTaskList(filteredTrips) {
  const items = filteredTrips.flatMap(trip => trip.legs.flatMap(leg => (leg.tasks || []).map(task => ({
    callsign: trip.callsign, route: `${leg.dep} → ${leg.dest}`, task
  })))).slice(0, 8);
  taskListPanel.innerHTML = items.length ? items.map(item => `<div class="task-list-item"><div class="small">${item.callsign} · ${item.route}</div><div class="main">${item.task}</div></div>`).join("") : `<div class="generic-card"><div class="generic-text">No tasks to display.</div></div>`;
}

function renderRecentUpdates(filteredTrips) {
  if (!filteredTrips.length) {
    recentUpdatesPanel.innerHTML = `<div class="generic-card"><div class="generic-text">No updates available. Load a trips.js file to begin.</div></div>`;
    return;
  }
  const updates = filteredTrips.slice(0, 5).map(trip => `${trip.callsign} in ${laneConfig[getLaneForTrip(trip)]?.label || "Completed"} with ${getTripHealth(trip).toUpperCase()} trip health.`);
  recentUpdatesPanel.innerHTML = updates.map(item => `<div class="update-item"><div class="main">${item}</div></div>`).join("");
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
      target.sectors.push({ callsign: trip.callsign || registration, dep: leg.dep, dest: leg.dest, etdUtc: leg.etd, etaUtc: leg.eta });
    });
  });
  return Array.from(byRegistration.values()).map(entry => ({ ...entry, sectors: entry.sectors.sort((a,b) => Date.parse(a.etdUtc) - Date.parse(b.etdUtc)) })).filter(entry => entry.sectors.length);
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
    const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description, accept: { "text/javascript": [".js"] } }] });
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
      const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: "Trips JavaScript", accept: { "text/javascript": [".js"] } }] });
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
    workspaceDataStatus.classList.remove("success", "warning");
    workspaceDataStatus.classList.add("error");
    workspaceDataStatus.textContent = `Load failed.\n${error.message}`;
    dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
    dataStatusBadge.classList.add("status-error");
    dataStatusBadge.textContent = "Load failed";
  }
}

async function saveTripsJs(useSaveAs = false) {
  if (!state.trips.length) {
    workspaceDataStatus.classList.remove("success", "warning");
    workspaceDataStatus.classList.add("error");
    workspaceDataStatus.textContent = "Nothing to save.\nLoad a local trips.js first.";
    dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
    dataStatusBadge.classList.add("status-error");
    dataStatusBadge.textContent = "No data to save";
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
    workspaceDataStatus.classList.remove("success", "warning");
    workspaceDataStatus.classList.add("error");
    workspaceDataStatus.textContent = `Save failed.\n${error.message}`;
    dataStatusBadge.classList.remove("status-empty", "status-clean", "status-dirty");
    dataStatusBadge.classList.add("status-error");
    dataStatusBadge.textContent = "Save failed";
  }
}

function resetWorkspace() {
  state.trips = [];
  state.selectedTripId = null;
  state.selectedLegId = null;
  state.tripsFileHandle = null;
  state.loadedFileName = "";
  state.dirty = false;
  state.lastLocalSave = "";
  state.lastExport = "";
  clearLocalCache();
  showNoDataState();
}

function render() {
  populateClientFilter();
  updateDataStatus();
  const filteredTrips = getFilteredTrips();
  const selectedTrip = getSelectedTrip(filteredTrips);
  if (selectedTrip) {
    state.selectedTripId = selectedTrip.id;
    if (!selectedTrip.legs.some(l => l.id === state.selectedLegId)) state.selectedLegId = selectedTrip.legs[0]?.id || null;
  } else {
    state.selectedTripId = null;
    state.selectedLegId = null;
  }
  const selectedLeg = getSelectedLeg(selectedTrip);
  renderKPIs(filteredTrips);
  renderLanes(filteredTrips);
  renderSelectedTrip(selectedTrip, selectedLeg);
  renderLegSelector(selectedTrip);
  renderAlertsAndTasks(selectedTrip, selectedLeg);
  renderOverview(selectedTrip, selectedLeg);
  renderTaskList(filteredTrips);
  renderRecentUpdates(filteredTrips);
  document.querySelector(".right-panels").style.display = state.utilityHidden ? "none" : "";
}

navButtons.forEach(btn => btn.addEventListener("click", () => setDrawer(state.openDrawerId === btn.dataset.drawer ? null : btn.dataset.drawer)));
document.querySelectorAll("[data-close-drawer]").forEach(btn => btn.addEventListener("click", () => setDrawer(null)));
[searchInput, statusFilter, clientFilter, scopeFilter].forEach(el => { el.addEventListener("input", render); el.addEventListener("change", render); });
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

setDrawer("workspaceDrawer");
showNoDataState();
