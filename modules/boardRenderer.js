import { utcStartOfDay, addDaysUTC, fmtDayLabelUTC, parseUTC, minutesBetween } from "./timeline.js";

export function renderBoard({ state, timelineHeaderEl, timelineGridEl, rangeLabelEl, onTripClick }) {
  const { config, trips, clients } = state;
  const days = config.days ?? 30;
  const slotHours = config.slotHours ?? 6;
  const slotsPerDay = 24 / slotHours;
  const dayWidth = config.dayWidth ?? 220;

  // Range
  const start = utcStartOfDay(new Date());
  const end = addDaysUTC(start, days);
  rangeLabelEl.textContent = `${fmtDayLabelUTC(start)} → ${fmtDayLabelUTC(addDaysUTC(end, -1))} (UTC)`;

  // Header
  timelineHeaderEl.innerHTML = "";
  timelineHeaderEl.style.gridAutoColumns = `minmax(${dayWidth}px, 1fr)`;

  for (let i = 0; i < days; i++) {
    const d = addDaysUTC(start, i);
    const el = document.createElement("div");
    el.className = "dayHeader";
    el.innerHTML = `
      <div class="dayHeader__date">${fmtDayLabelUTC(d)}</div>
      <div class="dayHeader__ticks">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    `;
    timelineHeaderEl.appendChild(el);
  }

  // Grid shell
  timelineGridEl.innerHTML = "";
  const gridInner = document.createElement("div");
  gridInner.className = "gridInner";
  gridInner.style.minWidth = `${days * dayWidth}px`;

  // Background day + slots
  const bg = document.createElement("div");
  bg.className = "gridBg";
  for (let day = 0; day < days; day++) {
    const dayX = day * dayWidth;
    const dayDiv = document.createElement("div");
    dayDiv.className = "gridBg__day";
    dayDiv.style.left = `${dayX}px`;
    bg.appendChild(dayDiv);

    const slotW = dayWidth / slotsPerDay;
    for (let s = 1; s < slotsPerDay; s++) {
      const slotX = dayX + s * slotW;
      const slotDiv = document.createElement("div");
      const isMajor = (s === slotsPerDay / 2);
      slotDiv.className = "gridBg__slot" + (isMajor ? " gridBg__slot--major" : "");
      slotDiv.style.left = `${slotX}px`;
      bg.appendChild(slotDiv);
    }
  }
  gridInner.appendChild(bg);

  // Lanes
  const lanes = document.createElement("div");
  lanes.className = "lanes";

  const laneH = 64;
  const sortedTrips = [...trips].sort((a, b) => {
    const aStart = tripStart(a);
    const bStart = tripStart(b);
    return (aStart?.getTime() ?? Infinity) - (bStart?.getTime() ?? Infinity);
  });

  sortedTrips.forEach((trip) => {
    const lane = document.createElement("div");
    lane.className = "lane";

    const clientColor = getClientColor(clients, trip.client);
    lane.style.setProperty("--clientColor", clientColor);

    const tStart = tripStart(trip);
    const tEnd = tripEnd(trip);

    const pill = document.createElement("div");
    pill.className = "tripPill";
    pill.title = "Open trip";

    const pillText = document.createElement("div");
    pillText.className = "tripPill__text";
    const meta = trip.callsign ? `${trip.aircraftType} • ${trip.reg} • ${trip.callsign}` : `${trip.aircraftType} • ${trip.reg}`;
    pillText.innerHTML = `<span class="tripPill__client">${escapeHtml(trip.client)}</span><span class="tripPill__meta">${escapeHtml(meta)}</span>`;
    pill.appendChild(pillText);

    const leftPad = 8;
    const rightPad = 8;
    const totalMinutes = minutesBetween(start, end);
    const pxPerMin = (days * dayWidth) / totalMinutes;

    let leftPx = leftPad;
    let widthPx = 200;

    if (tStart && tEnd) {
      const s = clampDate(tStart, start, end);
      const e = clampDate(tEnd, start, end);
      const minFromStart = minutesBetween(start, s);
      const minSpan = Math.max(30, minutesBetween(s, e));
      leftPx = leftPad + minFromStart * pxPerMin;
      widthPx = Math.max(160, minSpan * pxPerMin);
      widthPx = Math.min(widthPx, days * dayWidth - leftPx - rightPad);
    }

    pill.style.left = `${leftPx}px`;
    pill.style.width = `${widthPx}px`;

    pill.addEventListener("click", () => onTripClick(trip.id));
    lane.appendChild(pill);

    let legTop = 10 + 24 + 6;
    (trip.legs || []).forEach((leg) => {
      const legStart = parseUTC(leg.depUTC);
      const legEnd = parseUTC(leg.arrUTC);
      const s = clampDate(legStart, start, end);
      const e = clampDate(legEnd, start, end);
      const minFromStart = minutesBetween(start, s);
      const minSpan = Math.max(15, minutesBetween(s, e));
      const legLeft = leftPad + minFromStart * pxPerMin;
      const legW = Math.max(30, minSpan * pxPerMin);

      const bar = document.createElement("div");
      bar.className = "legBar";
      bar.style.left = `${legLeft}px`;
      bar.style.width = `${Math.min(legW, days * dayWidth - legLeft - rightPad)}px`;
      bar.style.top = `${legTop}px`;
      bar.title = `${leg.depICAO} ${leg.depUTC.slice(11)} → ${leg.arrICAO} ${leg.arrUTC.slice(11)} (UTC)`;
      lane.appendChild(bar);

      legTop += 16 + 4;
    });

    lanes.appendChild(lane);
  });

  const lanesHeight = sortedTrips.length * (laneH + 10) + 20;
  gridInner.style.minHeight = `${Math.max(lanesHeight, 480)}px`;
  gridInner.appendChild(lanes);
  timelineGridEl.appendChild(gridInner);
}

function tripStart(trip) {
  if (!trip.legs || trip.legs.length === 0) return null;
  let min = null;
  for (const leg of trip.legs) {
    const d = parseUTC(leg.depUTC);
    if (!min || d < min) min = d;
  }
  return min;
}
function tripEnd(trip) {
  if (!trip.legs || trip.legs.length === 0) return null;
  let max = null;
  for (const leg of trip.legs) {
    const d = parseUTC(leg.arrUTC);
    if (!max || d > max) max = d;
  }
  return max;
}
function clampDate(d, min, max) {
  if (d < min) return min;
  if (d > max) return max;
  return d;
}
function getClientColor(clients, clientCode) {
  if (!clients || !clients[clientCode]) return "rgba(255,255,255,.25)";
  return clients[clientCode].color || "rgba(255,255,255,.25)";
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
