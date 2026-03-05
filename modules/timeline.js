// Timeline helpers (UTC)
export function utcStartOfDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0,0,0,0));
}

export function addDaysUTC(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function parseUTC(isoLocalLike) {
  // isoLocalLike: "YYYY-MM-DDTHH:MM" (no timezone)
  // treat as UTC
  const [datePart, timePart] = isoLocalLike.split("T");
  const [y,m,dd] = datePart.split("-").map(Number);
  const [hh,mm] = timePart.split(":").map(Number);
  return new Date(Date.UTC(y, m-1, dd, hh, mm, 0, 0));
}

export function fmtDayLabelUTC(d) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getUTCDate()).padStart(2,"0")} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtHHMMUTC(d) {
  const hh = String(d.getUTCHours()).padStart(2,"0");
  const mm = String(d.getUTCMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}

export function minutesBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}
