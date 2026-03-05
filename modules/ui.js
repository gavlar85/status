export function openModal(modalEl) { modalEl.hidden = false; }
export function closeModal(modalEl) { modalEl.hidden = true; }

export function buildTripForm({ state, trip }) {
  const form = document.createElement("form");
  form.className = "form";

  const clientField = fieldSelect("Client", "client", state.clients, trip?.client || "");
  const typeField = fieldInput("Aircraft Type", "aircraftType", trip?.aircraftType || "", "e.g. GL7T");
  const regField = fieldInput("Registration", "reg", trip?.reg || "", "e.g. G-XXXX / N123AB");
  const callField = fieldInput("Callsign", "callsign", trip?.callsign || "", "optional");
  const tagsField = fieldInput("Tags (comma separated)", "tags", (trip?.tags || []).join(", "), "VIP, Short Notice");
  tagsField.wrapper.classList.add("field--full");

  const notes = document.createElement("div");
  notes.className = "field field--full";
  notes.innerHTML = `<div class="label">Notes</div><textarea class="note" name="notes" placeholder="Operational notes…"></textarea>`;
  notes.querySelector("textarea").value = trip?.notes || "";

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.innerHTML = `
    <button class="btn" type="button" data-cancel>Cancel</button>
    <button class="btn btn--primary" type="submit">${trip ? "Save" : "Create Trip"}</button>
  `;

  form.append(
    clientField.wrapper,
    typeField.wrapper,
    regField.wrapper,
    callField.wrapper,
    tagsField.wrapper,
    notes,
    actions
  );

  actions.querySelector("[data-cancel]").addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("tsb-ng-cancel-modal"));
  });

  return {
    formEl: form,
    getValue() {
      const fd = new FormData(form);
      const tags = String(fd.get("tags") || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 24);
      return {
        client: String(fd.get("client") || "").toUpperCase(),
        aircraftType: String(fd.get("aircraftType") || "").toUpperCase(),
        reg: String(fd.get("reg") || "").toUpperCase(),
        callsign: String(fd.get("callsign") || "").toUpperCase(),
        tags,
        notes: String(fd.get("notes") || ""),
      };
    }
  };
}

export function buildLegForm({ leg }) {
  const form = document.createElement("form");
  form.className = "form";

  const dep = fieldInput("Departure ICAO", "depICAO", leg?.depICAO || "", "EGSS");
  const arr = fieldInput("Arrival ICAO", "arrICAO", leg?.arrICAO || "", "LFMN");

  const depT = fieldInput("Departure (UTC)", "depUTC", leg?.depUTC || "", "YYYY-MM-DDTHH:MM");
  const arrT = fieldInput("Arrival (UTC)", "arrUTC", leg?.arrUTC || "", "YYYY-MM-DDTHH:MM");

  dep.wrapper.querySelector("input").setAttribute("maxlength", "4");
  arr.wrapper.querySelector("input").setAttribute("maxlength", "4");

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.innerHTML = `
    <button class="btn" type="button" data-cancel>Cancel</button>
    <button class="btn btn--primary" type="submit">${leg ? "Save" : "Add Leg"}</button>
  `;

  form.append(dep.wrapper, arr.wrapper, depT.wrapper, arrT.wrapper, actions);

  actions.querySelector("[data-cancel]").addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("tsb-ng-cancel-modal"));
  });

  for (const inp of form.querySelectorAll("input[name='depICAO'], input[name='arrICAO']")) {
    inp.addEventListener("input", () => inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  }

  return {
    formEl: form,
    getValue() {
      const fd = new FormData(form);
      return {
        depICAO: String(fd.get("depICAO") || "").toUpperCase(),
        arrICAO: String(fd.get("arrICAO") || "").toUpperCase(),
        depUTC: String(fd.get("depUTC") || ""),
        arrUTC: String(fd.get("arrUTC") || ""),
      };
    }
  };
}

function fieldInput(label, name, value, placeholder="") {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  wrapper.innerHTML = `
    <div class="label">${label}</div>
    <input class="input" name="${name}" value="" placeholder="${placeholder}" />
  `;
  wrapper.querySelector("input").value = value ?? "";
  return { wrapper };
}

function fieldSelect(label, name, clientMap, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const opts = Object.entries(clientMap || {})
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([code, obj]) => `<option value="${escapeHtml(code)}">${escapeHtml(code)} — ${escapeHtml(obj.name || "")}</option>`)
    .join("");

  wrapper.innerHTML = `
    <div class="label">${label}</div>
    <select class="select" name="${name}">
      ${opts}
    </select>
  `;
  wrapper.querySelector("select").value = value || (Object.keys(clientMap || {})[0] || "");
  return { wrapper };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
