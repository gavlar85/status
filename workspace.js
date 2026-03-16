const STORAGE_KEY_TRIPS = "workspace_local_trips_v1";
const STORAGE_KEY_META = "workspace_local_meta_v1";

const statusConfig = {
  loaded: { label: "Loaded", dotClass: "loaded-dot" },
  updated: { label: "Updated", dotClass: "updated-dot" },
  qualitychecked: { label: "Quality Checked", dotClass: "qualitychecked-dot" },
  needsattention: { label: "Needs Attention", dotClass: "needsattention-dot" }
};
const lanes = ["loaded", "updated", "qualitychecked", "needsattention"];

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

function formatTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "TBA";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
}

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
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function cloneTrips(trips) {
  return JSON.parse(JSON.stringify(trips || []));
}

function sanitizeTrips(input) {
  if (!Array.isArray(input)) return [];
  return input.map((trip, tripIndex) => {
    const safeTrip = {
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
      status: String(trip.status ?? "loaded").toLowerCase(),
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
        alerts: Array.isArray(leg.alerts) ? [...leg.alerts] : [],
        tasks: Array.isArray(leg.tasks) ? [...leg.tasks] : [],
        note: String(leg.note ?? "")
      })) : []
    };
    if (!statusConfig[safeTrip.status]) safeTrip.status = "loaded";
    return safeTrip;
  });
}

function setTrips(trips, options = {}) {
  const sanitized = sanitizeTrips(trips);
  state.trips = sanitized;
  state.loadedFileName = options.fileName ?? state.loadedFileName ?? "";
  if (sanitized.length) {
    const selectedTrip = sanitized.find(t => t.id === state.selectedTripId) || sanitized[0];
    state.selectedTripId = selectedTrip.id;
    const selectedLeg = selectedTrip.legs.find(l => l.id === state.selectedLegId) || selectedTrip.legs[0] || null;
    state.selectedLegId = selectedLeg?.id ?? null;
  } else {
    state.selectedTripId = null;
    state.selectedLegId = null;
  }
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
  } catch (error) {
    console.warn("Unable to cache local trips:", error);
  }
}

function clearLocalCache() {
  try {
    localStorage.removeItem(STORAGE_KEY_TRIPS);
    localStorage.removeItem(STORAGE_KEY_META);
  } catch (error) {
    console.warn("Unable to clear local cache:", error);
  }
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
    workspaceDataStatus.textContent =
      `Loaded file: ${state.loadedFileName || "Local draft"}\n` +
      `Trips in workspace: ${state.trips.length}\n` +
      `Local draft cached: ${state.lastLocalSave || "Just now"}\n` +
      `Export required: Yes`;
    return;
  }

  dataStatusBadge.classList.add("status-clean");
  dataStatusBadge.textContent = state.loadedFileName ? "Loaded from local file" : "Local draft loaded";
  workspaceDataStatus.classList.remove("error", "warning");
  workspaceDataStatus.classList.add("success");
  workspaceDataStatus.textContent =
    `Loaded file: ${state.loadedFileName || "Local draft"}\n` +
    `Trips in workspace: ${state.trips.length}\n` +
    `Local cache updated: ${state.lastLocalSave || "N/A"}\n` +
    `Export required: No`;
}

function populateClientFilter() {
  const currentValue = clientFilter.value || "all";
  const counts = new Map();

  state.trips.forEach(trip => {
    const key = trip.client || "Unknown Client";
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const clients = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  clientFilter.innerHTML = `<option value="all">All Clients</option>`;
  clients.forEach(([name, count]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${count})`;
    clientFilter.appendChild(option);
  });

  clientFilter.value = clients.some(([name]) => name === currentValue) ? currentValue : "all";
}

function getPrimaryLeg(trip) {
  if (!trip) return null;
  return trip.legs.find(leg => leg.id === state.selectedLegId) || trip.legs[0] || null;
}

function getFilteredTrips() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const client = clientFilter.value;
  const scope = scopeFilter.value;

  return state.trips.filter(trip => {
    const primaryLeg = getPrimaryLeg(trip);
    const matchesSearch = !search ||
      (trip.callsign || "").toLowerCase().includes(search) ||
      (trip.registration || "").toLowerCase().includes(search) ||
      (trip.client || "").toLowerCase().includes(search) ||
      (trip.tripRef || "").toLowerCase().includes(search) ||
      trip.legs.some(leg => (leg.dep || "").toLowerCase().includes(search) || (leg.dest || "").toLowerCase().includes(search));

    const matchesStatus = status === "all" || trip.status === status;
    const matchesClient = client === "all" || trip.client === client;
    const matchesScope = scope === "all" || scope === "active" || scope === "today" || !!primaryLeg;

    return matchesSearch && matchesStatus && matchesClient && matchesScope;
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

  const kpis = [
    { label: "Active Trips", value: filteredTrips.length },
    { label: "Needs Action", value: filteredTrips.filter(t => t.legs.some(l => (l.alerts || []).length)).length },
    { label: "Quality Checked", value: filteredTrips.filter(t => t.status === "qualitychecked").length },
    { label: "Open Legs", value: filteredTrips.reduce((sum, t) => sum + t.legs.length, 0) }
  ];

  kpiStrip.innerHTML = kpis.map(item => `
    <div class="kpi-card">
      <div class="kpi-label">${item.label}</div>
      <div class="kpi-value">${item.value}</div>
    </div>
  `).join("");
}

function renderLanes(filteredTrips) {
  lanesContainer.innerHTML = lanes.map(lane => {
    const cfg = statusConfig[lane];
    const laneTrips = filteredTrips.filter(trip => trip.status === lane);
    return `
      <section class="lane">
        <div class="lane-header">
          <div class="lane-title">
            <span class="lane-dot ${cfg.dotClass}"></span>
            <div class="lane-name">${cfg.label}</div>
          </div>
          <div class="lane-count">${laneTrips.length}</div>
        </div>
        <div class="lane-body">
          ${laneTrips.length ? laneTrips.map(trip => {
            const alertCount = trip.legs.reduce((sum, leg) => sum + (leg.alerts || []).length, 0);
            return `
              <button class="trip-card ${trip.status} ${trip.id === state.selectedTripId ? "selected" : ""}" data-trip-id="${trip.id}">
                <div class="trip-top">
                  <div class="trip-ref">${trip.tripRef}</div>
                  <div class="trip-callsign">${trip.callsign}</div>
                </div>
                <div class="trip-metrics">
                  <div class="trip-metric"><span class="metric-icon">✈</span><span class="metric-value">${trip.legs.length}</span></div>
                  <div class="trip-metric"><span class="metric-icon">⚙</span><span class="metric-value">${trip.services.length}</span></div>
                  <div class="trip-metric"><span class="metric-icon">!</span><span class="metric-value">${alertCount}</span></div>
                </div>
              </button>
            `;
          }).join("") : `<div class="empty-lane">No trips in this lane.</div>`}
        </div>
      </section>
    `;
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
    selectedTripPanel.innerHTML = `
      <div class="empty-state-card">
        <h3>No Trip Selected</h3>
        <p>Load a local trips.js from the Workspace Drawer to populate the workspace.</p>
      </div>
    `;
    return;
  }

  selectedUpdated.textContent = trip.updated ? `Last update ${trip.updated}` : "";
  selectedTripPanel.innerHTML = `
    <div class="selected-header">
      <div>
        <div class="selected-client">${trip.client} · ${trip.tripRef}</div>
        <div class="selected-callsign">${trip.callsign}</div>
        <div class="selected-route">${leg.dep} → ${leg.dest}</div>
        <div class="selected-meta">${trip.registration} · ${trip.aircraftType} · Crew ${trip.crew || "—"} · Pax ${trip.pax || "—"}</div>
      </div>
      <div class="action-buttons">
        <button class="primary">Open Checklist</button>
        <button>Edit Trip</button>
        <button>Edit Leg</button>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-card"><div class="info-label">Leg ETD</div><div class="info-value">${formatLegDateTime(leg.etd)}</div></div>
      <div class="info-card"><div class="info-label">Leg ETA</div><div class="info-value">${formatLegDateTime(leg.eta)}</div></div>
      <div class="info-card"><div class="info-label">Trip Status</div><div class="info-value">${statusConfig[trip.status].label}</div></div>
      <div class="info-card"><div class="info-label">Leg Count</div><div class="info-value">${trip.legs.length}</div></div>
    </div>
  `;
}

function renderLegSelector(trip) {
  if (!trip) {
    legSelectorPanel.innerHTML = `
      <div class="empty-state-card">
        <h3>No Legs Available</h3>
        <p>Once a trips.js file is loaded, leg selection will appear here.</p>
      </div>
    `;
    return;
  }
  legSelectorPanel.innerHTML = `
    <div class="leg-selector-row">
      ${trip.legs.map(leg => `
        <button class="leg-tab ${leg.id === state.selectedLegId ? "active" : ""}" data-leg-id="${leg.id}">
          <div class="leg-tab-seq">Leg ${leg.seq}</div>
          <div class="leg-tab-route">${leg.dep} → ${leg.dest}</div>
          <div class="leg-tab-time">ETD ${formatLegDateTime(leg.etd)}</div>
          <div class="leg-tab-time">ETA ${formatLegDateTime(leg.eta)}</div>
          <div class="leg-tab-status">${leg.legStatus}</div>
        </button>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".leg-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedLegId = btn.dataset.legId;
      render();
    });
  });
}

function renderAlertsAndTasks(leg) {
  if (!leg) {
    alertsTasksPanel.innerHTML = `
      <div class="empty-state-card" style="grid-column:1/-1">
        <h3>No Active Data</h3>
        <p>Alerts and tasks will appear once a leg is selected.</p>
      </div>
    `;
    return;
  }
  alertsTasksPanel.innerHTML = `
    <div class="stack">
      <div class="stack-title">Alerts</div>
      ${(leg.alerts || []).length ? leg.alerts.map(a => `<div class="alert-card">${a}</div>`).join("") : `<div class="generic-card"><div class="generic-text">No active alerts.</div></div>`}
    </div>
    <div class="stack">
      <div class="stack-title">Next Tasks</div>
      ${(leg.tasks || []).length ? leg.tasks.map(t => `<div class="task-card">${t}</div>`).join("") : `<div class="generic-card"><div class="generic-text">No outstanding tasks.</div></div>`}
    </div>
  `;
}

function renderOverview(trip, leg) {
  if (!trip || !leg) {
    overviewPanel.innerHTML = `
      <div class="empty-state-card">
        <h3>Overview Empty</h3>
        <p>Trip overview will appear here after loading a trips.js file.</p>
      </div>
    `;
    servicesPanel.innerHTML = `
      <div class="empty-state-card">
        <h3>No Services Loaded</h3>
        <p>Services from the selected trip will appear here.</p>
      </div>
    `;
    return;
  }
  overviewPanel.innerHTML = `
    <div class="stack">
      <div class="generic-card">
        <div class="generic-title">Selected Leg</div>
        <div class="generic-text">${leg.dep} → ${leg.dest} · ${leg.legStatus}</div>
      </div>
      <div class="generic-card">
        <div class="generic-title">Handler</div>
        <div class="generic-text">${leg.handler || "No handler recorded"}${leg.handlingType ? ` · ${leg.handlingType}` : ""}</div>
      </div>
      <div class="generic-card">
        <div class="generic-title">Trip Note</div>
        <div class="generic-text">${trip.tripNotes || "No trip notes recorded."}</div>
      </div>
    </div>
  `;

  servicesPanel.innerHTML = trip.services.length ? `
    <div class="service-tags">
      ${trip.services.map(s => `<span class="service-tag">${s}</span>`).join("")}
    </div>
  ` : `
    <div class="generic-card">
      <div class="generic-text">No services recorded on this trip.</div>
    </div>
  `;
}

function renderTaskList(filteredTrips) {
  const items = filteredTrips.flatMap(trip =>
    trip.legs.flatMap(leg => (leg.tasks || []).map(task => ({
      callsign: trip.callsign,
      route: `${leg.dep} → ${leg.dest}`,
      task
    })))
  ).slice(0, 8);

  taskListPanel.innerHTML = items.length ? items.map(item => `
    <div class="task-list-item">
      <div class="small">${item.callsign} · ${item.route}</div>
      <div class="main">${item.task}</div>
    </div>
  `).join("") : `
    <div class="generic-card">
      <div class="generic-text">No tasks to display.</div>
    </div>
  `;
}

function renderRecentUpdates(filteredTrips) {
  if (!filteredTrips.length) {
    recentUpdatesPanel.innerHTML = `
      <div class="generic-card">
        <div class="generic-text">No updates available. Load a trips.js file to begin.</div>
      </div>
    `;
    return;
  }

  const updates = filteredTrips.slice(0, 5).map(trip => {
    const leg = getPrimaryLeg(trip);
    return `${trip.callsign} now showing ${leg?.dep || "TBA"} → ${leg?.dest || "TBA"} in ${statusConfig[trip.status].label}.`;
  });

  recentUpdatesPanel.innerHTML = updates.map(item => `
    <div class="update-item"><div class="main">${item}</div></div>
  `).join("");
}

function isValidIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function buildGallimimusFlights(sourceTrips) {
  const byRegistration = new Map();

  sourceTrips.forEach(trip => {
    const registration = trip.registration || trip.callsign || "UNKNOWN";
    const aircraftType = trip.aircraftType || "";

    if (!byRegistration.has(registration)) {
      byRegistration.set(registration, {
        registration,
        aircraftType,
        sectors: []
      });
    }

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
    .map(entry => ({
      ...entry,
      sectors: entry.sectors.sort((a, b) => Date.parse(a.etdUtc) - Date.parse(b.etdUtc))
    }))
    .filter(entry => entry.sectors.length > 0)
    .sort((a, b) => Date.parse(a.sectors[0].etdUtc) - Date.parse(b.sectors[0].etdUtc));
}

function serializeGallimimusFlights(sourceTrips) {
  const payload = buildGallimimusFlights(sourceTrips);
  return `window.GALLIMIMUS_FLIGHTS = ${JSON.stringify(payload, null, 2)};\n`;
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
      types: [{
        description,
        accept: { "text/javascript": [".js"] }
      }]
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
    setBoardExportStatus("No exportable legs found. Legs without valid ETD and ETA were skipped.", "error");
    return;
  }

  const content = serializeGallimimusFlights(state.trips);

  try {
    await saveFileWithPicker(content, "flight.js", "Gallimimus flight export");
    const sectorCount = exportTrips.reduce((sum, item) => sum + item.sectors.length, 0);
    setBoardExportStatus(`flight.js generated with ${exportTrips.length} aircraft and ${sectorCount} sectors.`, "success");
  } catch (error) {
    console.error(error);
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

async function loadTripsFromFileHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const parsedTrips = parseTripsJsText(text);

  if (!Array.isArray(parsedTrips)) {
    throw new Error("Loaded file does not expose window.trips as an array.");
  }

  state.tripsFileHandle = handle;
  state.loadedFileName = file.name;
  setTrips(parsedTrips, { fileName: file.name });
  markClean();
  populateClientFilter();
  render();
}

function parseTripsJsText(text) {
  const sandboxWindow = {};
  const fn = new Function("window", `${text}\n; return window.trips;`);
  return fn(sandboxWindow);
}

async function loadTripsJs() {
  try {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: "Trips JavaScript",
          accept: { "text/javascript": [".js"] }
        }]
      });
      if (!handle) return;
      await loadTripsFromFileHandle(handle);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".js,text/javascript";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsedTrips = parseTripsJsText(text);
      setTrips(parsedTrips, { fileName: file.name });
      state.tripsFileHandle = null;
      markClean();
      populateClientFilter();
      render();
    });
    input.click();
  } catch (error) {
    console.error(error);
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

  const content = serializeTripsJs(state.trips);

  try {
    if (!useSaveAs && state.tripsFileHandle && window.showSaveFilePicker) {
      await saveTextToHandle(state.tripsFileHandle, content);
    } else {
      const handle = await saveFileWithPicker(content, state.loadedFileName || "trips.js", "Workspace trips export");
      if (handle) {
        state.tripsFileHandle = handle;
      }
    }

    state.lastExport = nowStamp();
    markClean();
    render();
  } catch (error) {
    console.error(error);
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

  if (selectedTrip && !selectedTrip.legs.some(l => l.id === state.selectedLegId)) {
    state.selectedLegId = selectedTrip.legs[0]?.id || null;
  }
  if (selectedTrip) {
    state.selectedTripId = selectedTrip.id;
  }

  const selectedLeg = getSelectedLeg(selectedTrip);

  renderKPIs(filteredTrips);
  renderLanes(filteredTrips);
  renderSelectedTrip(selectedTrip, selectedLeg);
  renderLegSelector(selectedTrip);
  renderAlertsAndTasks(selectedLeg);
  renderOverview(selectedTrip, selectedLeg);
  renderTaskList(filteredTrips);
  renderRecentUpdates(filteredTrips);

  document.querySelector(".right-panels").style.display = state.utilityHidden ? "none" : "";
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.drawer;
    setDrawer(state.openDrawerId === target ? null : target);
  });
});

document.querySelectorAll("[data-close-drawer]").forEach(btn => {
  btn.addEventListener("click", () => setDrawer(null));
});

[searchInput, statusFilter, clientFilter, scopeFilter].forEach(el => {
  el.addEventListener("input", render);
  el.addEventListener("change", render);
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

setDrawer("workspaceDrawer");
showNoDataState();
