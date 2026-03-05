/* =========================================================
   Trip Status Board — TSB-NG v0.1 (UTC)
   GitHub Pages friendly: JSON in repo + user edits stored locally
   ========================================================= */

import { loadInitialState, saveState, resetState, exportTripsJSON, importTripsJSON } from "./modules/storage.js";
import { createStore } from "./modules/state.js";
import { renderBoard } from "./modules/boardRenderer.js";
import { openDrawer, closeDrawer, renderDrawer } from "./modules/drawer.js";
import { openModal, closeModal, buildTripForm, buildLegForm } from "./modules/ui.js";

const els = {
  rangeLabel: document.getElementById("rangeLabel"),
  timelineHeader: document.getElementById("timelineHeader"),
  timelineGrid: document.getElementById("timelineGrid"),
  drawer: document.getElementById("drawer"),
  drawerContent: document.getElementById("drawerContent"),
  drawerClose: document.getElementById("drawerClose"),
  backdrop: document.getElementById("backdrop"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
  btnAddTrip: document.getElementById("btnAddTrip"),
  btnReset: document.getElementById("btnReset"),
  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),
};

const INIT = await loadInitialState();
const store = createStore(INIT);

// Persist on every change (v0.1 simplicity)
store.subscribe((state) => saveState(state));

function rerender() {
  const state = store.getState();
  renderBoard({
    state,
    timelineHeaderEl: els.timelineHeader,
    timelineGridEl: els.timelineGrid,
    rangeLabelEl: els.rangeLabel,
    onTripClick: (tripId) => {
      store.dispatch({ type: "SELECT_TRIP", tripId });
      openDrawer(els.drawer, els.backdrop);
      renderDrawer({
        state: store.getState(),
        container: els.drawerContent,
        onClose: () => {
          store.dispatch({ type: "SELECT_TRIP", tripId: null });
          closeDrawer(els.drawer, els.backdrop);
        },
        onEditTrip: () => openTripModal(tripId),
        onAddLeg: () => openLegModal(tripId, null),
        onEditLeg: (legId) => openLegModal(tripId, legId),
        onDeleteTrip: () => {
          if (!confirm("Delete this trip?")) return;
          store.dispatch({ type: "DELETE_TRIP", tripId });
          store.dispatch({ type: "SELECT_TRIP", tripId: null });
          closeDrawer(els.drawer, els.backdrop);
        },
        onNotesChange: (notes) => store.dispatch({ type: "UPDATE_TRIP", tripId, patch: { notes } }),
        onTagsChange: (tags) => store.dispatch({ type: "UPDATE_TRIP", tripId, patch: { tags } }),
      });
    },
  });

  // Keep drawer in sync if open
  const { ui } = state;
  if (ui.selectedTripId && els.drawer.classList.contains("is-open")) {
    renderDrawer({
      state,
      container: els.drawerContent,
      onClose: () => {
        store.dispatch({ type: "SELECT_TRIP", tripId: null });
        closeDrawer(els.drawer, els.backdrop);
      },
      onEditTrip: () => openTripModal(ui.selectedTripId),
      onAddLeg: () => openLegModal(ui.selectedTripId, null),
      onEditLeg: (legId) => openLegModal(ui.selectedTripId, legId),
      onDeleteTrip: () => {
        if (!confirm("Delete this trip?")) return;
        store.dispatch({ type: "DELETE_TRIP", tripId: ui.selectedTripId });
        store.dispatch({ type: "SELECT_TRIP", tripId: null });
        closeDrawer(els.drawer, els.backdrop);
      },
      onNotesChange: (notes) => store.dispatch({ type: "UPDATE_TRIP", tripId: ui.selectedTripId, patch: { notes } }),
      onTagsChange: (tags) => store.dispatch({ type: "UPDATE_TRIP", tripId: ui.selectedTripId, patch: { tags } }),
    });
  }
}

function openTripModal(tripId) {
  const state = store.getState();
  const trip = tripId ? state.trips.find(t => t.id === tripId) : null;

  openModal(els.modal);
  els.modalTitle.textContent = trip ? "Edit Trip" : "Add Trip";

  const { formEl, getValue } = buildTripForm({ state, trip });
  els.modalBody.replaceChildren(formEl);

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = getValue();
    if (!value.client || !value.aircraftType || !value.reg) {
      alert("Please complete Client, Aircraft Type, and Registration.");
      return;
    }
    if (trip) {
      store.dispatch({ type: "UPDATE_TRIP", tripId, patch: value });
    } else {
      store.dispatch({ type: "ADD_TRIP", trip: value });
    }
    closeModal(els.modal);
  }, { once: true });
}

function openLegModal(tripId, legId) {
  const state = store.getState();
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const leg = legId ? trip.legs.find(l => l.id === legId) : null;

  openModal(els.modal);
  els.modalTitle.textContent = leg ? "Edit Leg" : "Add Leg";

  const { formEl, getValue } = buildLegForm({ leg });
  els.modalBody.replaceChildren(formEl);

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = getValue();
    const icaoRe = /^[A-Z0-9]{4}$/;
    if (!icaoRe.test(value.depICAO) || !icaoRe.test(value.arrICAO)) {
      alert("ICAO codes must be 4 characters (A-Z/0-9).");
      return;
    }
    if (!value.depUTC || !value.arrUTC) {
      alert("Please provide Departure and Arrival UTC times.");
      return;
    }
    if (value.arrUTC <= value.depUTC) {
      alert("Arrival must be after Departure.");
      return;
    }
    if (leg) {
      store.dispatch({ type: "UPDATE_LEG", tripId, legId, patch: value });
    } else {
      store.dispatch({ type: "ADD_LEG", tripId, leg: value });
    }
    closeModal(els.modal);
  }, { once: true });
}

// UI events
els.drawerClose.addEventListener("click", () => {
  store.dispatch({ type: "SELECT_TRIP", tripId: null });
  closeDrawer(els.drawer, els.backdrop);
});
els.backdrop.addEventListener("click", () => {
  store.dispatch({ type: "SELECT_TRIP", tripId: null });
  closeDrawer(els.drawer, els.backdrop);
});

els.modalClose.addEventListener("click", () => closeModal(els.modal));
els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal(els.modal);
});

els.btnAddTrip.addEventListener("click", () => openTripModal(null));
els.btnReset.addEventListener("click", async () => {
  if (!confirm("Reset to seed data? This clears local storage for TSB-NG v0.1.")) return;
  await resetState();
  const fresh = await loadInitialState({ forceSeed: true });
  store.replaceState(fresh);
  store.dispatch({ type: "SELECT_TRIP", tripId: null });
  closeDrawer(els.drawer, els.backdrop);
  rerender();
});

els.btnExport.addEventListener("click", () => {
  exportTripsJSON(store.getState());
});

els.fileImport.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const imported = await importTripsJSON(file, store.getState());
    store.replaceState(imported);
    store.dispatch({ type: "SELECT_TRIP", tripId: null });
    closeDrawer(els.drawer, els.backdrop);
    rerender();
  } catch (err) {
    alert("Import failed: " + (err?.message || String(err)));
  } finally {
    els.fileImport.value = "";
  }
});

/* Global lightweight event hooks (v0.1) */
window.addEventListener("tsb-ng-cancel-modal", () => closeModal(els.modal));

window.addEventListener("tsb-ng-delete-leg", (e) => {
  const { tripId, legId } = e.detail || {};
  if (!tripId || !legId) return;
  store.dispatch({ type: "DELETE_LEG", tripId, legId });
});

// First render + subscribe
rerender();
store.subscribe(() => rerender());
