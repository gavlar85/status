export function uid(prefix="ID") {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  const t = Date.now().toString(36).slice(-5).toUpperCase();
  return `${prefix}_${t}${rnd}`;
}
