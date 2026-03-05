import { parseUTC, fmtHHMMUTC } from "./timeline.js";

export function openDrawer(drawerEl, backdropEl) {
  drawerEl.classList.add("is-open");
  drawerEl.setAttribute("aria-hidden", "false");
  backdropEl.hidden = false;
}

export function closeDrawer(drawerEl, backdropEl) {
  drawerEl.classList.remove("is-open");
  drawerEl.setAttribute("aria-hidden", "true");
  backdropEl.hidden = true;
}

export function renderDrawer({
  state,
  container,
  onClose,
  onEditTrip,
  onAddLeg,
  onEditLeg,
  onDeleteTrip,
  onNotesChange,
  onTagsChange,
}) {
  const tripId = state.ui.selectedTripId;
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) {
    container.innerHTML = `<div class="card"><div class="title">No trip selected</div></div>`;
    return;
  }

  const client = state.clients?.[trip.client];
  const clientColor = client?.color || "rgba(255,255,255,.25)";

  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <div class="row">
      <div>
        <div class="title">${escapeHtml(trip.client)} <span class="subtle">• ${escapeHtml(trip.aircraftType)} • ${escapeHtml(trip.reg)}${trip.callsign ? " • " + escapeHtml(trip.callsign) : ""}</span></div>
        <div class="subtle">UTC only • Local changes stay in your browser</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="pill pill--info" style="border-color: rgba(255,255,255,.12);">
          <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${clientColor};opacity:.9;"></span>
          ${escapeHtml(client?.name || "Client")}
        </span>
      </div>
    </div>

    <div class="row" style="margin-top:10px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <span class="pill">${escapeHtml(trip.aircraftType)}</span>
      </div>
      <div style="display:flex; gap:10px;">
        <button class="btn" type="button" id="btnEditTrip">Edit</button>
        <button class="btn" type="button" id="btnDeleteTrip" style="border-color: rgba(239,68,68,.35);">Delete</button>
      </div>
    </div>

    <div class="tagrow" id="tagRow"></div>

    <div style="margin-top:10px;">
      <div class="label">Tags (comma separated)</div>
      <input class="input" id="tagsInput" placeholder="VIP, Short Notice, AOG" value="${escapeHtml((trip.tags || []).join(", "))}" />
    </div>

    <div style="margin-top:10px;">
      <div class="label">Notes</div>
      <textarea class="note" id="notesInput" placeholder="Operational notes…">${escapeHtml(trip.notes || "")}</textarea>
    </div>
  `;

  const legsCard = document.createElement("div");
  legsCard.className = "card";
  legsCard.innerHTML = `
    <div class="row">
      <div class="title">Legs</div>
      <button class="btn btn--primary" type="button" id="btnAddLeg">Add Leg</button>
    </div>
    <div class="legs" id="legsList"></div>
  `;

  container.replaceChildren(header, legsCard);

  const tagRow = header.querySelector("#tagRow");
  (trip.tags || []).forEach(tag => {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = tag;
    tagRow.appendChild(t);
  });

  const legsList = legsCard.querySelector("#legsList");
  const sortedLegs = [...(trip.legs || [])].sort((a, b) => a.depUTC.localeCompare(b.depUTC));
  if (sortedLegs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "subtle";
    empty.style.padding = "10px 2px";
    empty.textContent = "No legs yet. Add the first leg to place the trip on the timeline.";
    legsList.appendChild(empty);
  } else {
    sortedLegs.forEach(leg => {
      const dep = parseUTC(leg.depUTC);
      const arr = parseUTC(leg.arrUTC);
      const el = document.createElement("div");
      el.className = "legItem";
      el.innerHTML = `
        <div>
          <div class="legItem__route">${escapeHtml(leg.depICAO)} → ${escapeHtml(leg.arrICAO)}</div>
          <div class="legItem__time">${escapeHtml(fmtHHMMUTC(dep))} → ${escapeHtml(fmtHHMMUTC(arr))} • ${escapeHtml(leg.depUTC.slice(0,10))}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn" type="button" data-edit="${escapeHtml(leg.id)}">Edit</button>
          <button class="btn" type="button" data-del="${escapeHtml(leg.id)}" style="border-color: rgba(239,68,68,.35);">Del</button>
        </div>
      `;
      legsList.appendChild(el);
    });
  }

  header.querySelector("#btnEditTrip").addEventListener("click", onEditTrip);
  header.querySelector("#btnDeleteTrip").addEventListener("click", onDeleteTrip);
  legsCard.querySelector("#btnAddLeg").addEventListener("click", onAddLeg);

  legsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const editId = btn.getAttribute("data-edit");
    const delId = btn.getAttribute("data-del");
    if (editId) onEditLeg(editId);
    if (delId) {
      if (!confirm("Delete this leg?")) return;
      window.dispatchEvent(new CustomEvent("tsb-ng-delete-leg", { detail: { tripId, legId: delId } }));
    }
  });

  const notesInput = header.querySelector("#notesInput");
  notesInput.addEventListener("input", () => onNotesChange(notesInput.value));

  const tagsInput = header.querySelector("#tagsInput");
  let tagTimer = null;
  tagsInput.addEventListener("input", () => {
    clearTimeout(tagTimer);
    tagTimer = setTimeout(() => {
      const tags = tagsInput.value
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 24);
      onTagsChange(tags);
    }, 250);
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
