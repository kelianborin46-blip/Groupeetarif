// api/tarifs.js — Proxy serverless (Vercel, Node 18+)
const API = "https://api.tariffs.groupe-e.ch/v2/tariffs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  const day = req.query.day === "tomorrow" ? 1 : 0;
  try {
    const target = zurichDate(day);
    const data = await fetchDay(target);
    if (!data) return res.status(200).json({ available: false, date: target });
    return res.status(200).json({ available: true, ...data });
  } catch (e) {
    return res.status(502).json({ available: false, error: String(e) });
  }
}

function zurichDate(offsetDays) {
  const t = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(t);
}
function shiftDate(ymd, days) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("API " + r.status);
  return r.json();
}
async function fetchDay(target) {
  const startISO = `${shiftDate(target, -1)}T00:00:00+02:00`;
  const endISO = `${shiftDate(target, 2)}T00:00:00+02:00`;
  const url = `${API}?start_timestamp=${encodeURIComponent(startISO)}&end_timestamp=${encodeURIComponent(endISO)}`;
  let parsed = { filled: 0 };
  try { parsed = extract(await fetchJson(url), target); } catch (_) {}
  if (parsed.filled < 96) {
    try {
      const alt = extract(await fetchJson(API), target);
      if (alt.filled > parsed.filled) parsed = alt;
    } catch (_) {}
  }
  if (parsed.filled < 96) return null;
  return { date: target, publication: parsed.publication, values: parsed.values, grid: parsed.grid };
}
function extract(json, target) {
  const values = new Array(96).fill(null);
  const grid = new Array(96).fill(null);
  let filled = 0;
  const publication = json && json.publication_timestamp;
  if (json && Array.isArray(json.prices)) {
    for (const p of json.prices) {
      if (!p.start_timestamp || !p.start_timestamp.startsWith(target)) continue;
      const hm = p.start_timestamp.slice(11, 16);
      const idx = +hm.slice(0, 2) * 4 + +hm.slice(3, 5) / 15;
      const iv = p.integrated && p.integrated[0] && p.integrated[0].value;
      const gv = p.grid && p.grid[0] && p.grid[0].value;
      if (idx >= 0 && idx < 96 && typeof iv === "number") {
        values[idx] = iv;
        grid[idx] = typeof gv === "number" ? gv : null;
        filled++;
      }
    }
  }
  return { values, grid, filled, publication };
}

