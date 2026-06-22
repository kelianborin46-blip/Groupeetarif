// api/cron.js — Envoi quotidien (Vercel Cron, ~18h30 locale)
const API = "https://api.tariffs.groupe-e.ch/v2/tariffs";

export default async function handler(req, res) {
  const auth = req.headers["authorization"] || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send("unauthorized");
  }
  try {
    const day = await fetchTomorrow();
    if (!day) return res.status(200).json({ sent: 0, reason: "demain pas encore publie" });
    const message = buildMessage(day);
    const subs = await getSubscribers();
    let sent = 0;
    for (const s of subs) {
      try { await tg("sendMessage", { chat_id: s.chat_id, text: message }); sent++; } catch (_) {}
    }
    return res.status(200).json({ sent, date: day.date });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
function buildMessage(day) {
  const cheap = windowAvg(day.values, 8, "min");
  const peak = windowAvg(day.values, 8, "max");
  const lab = (i) => { const m = i * 15; return `${String(Math.floor(m/60)).padStart(2,"0")}h${String(m%60).padStart(2,"0")}`; };
  const ct = (v) => (v * 100).toFixed(1);
  const d = day.date.slice(8, 10) + "." + day.date.slice(5, 7);
  return `\u26a1\ufe0f Tarif VARIO \u2014 demain ${d}\n\n\ud83d\udfe2 Meilleur cr\u00e9neau 2 h : ${lab(cheap.start)}\u2013${lab(cheap.start+8)} (~${ct(cheap.avg)} ct/kWh)\n\ud83d\udfe0 \u00c0 \u00e9viter : ${lab(peak.start)}\u2013${lab(peak.start+8)} (~${ct(peak.avg)} ct/kWh)\n\n\ud83d\udc49 Lancez lave-vaisselle / lave-linge sur le cr\u00e9neau vert.`;
}
function windowAvg(arr, slots, mode) {
  let sum = 0;
  for (let i = 0; i < slots; i++) sum += arr[i];
  let best = { start: 0, avg: sum / slots };
  for (let i = slots; i < arr.length; i++) {
    sum += arr[i] - arr[i - slots];
    const a = sum / slots;
    if (mode === "max" ? a > best.avg : a < best.avg) best = { start: i - slots + 1, avg: a };
  }
  return best;
}
async function getSubscribers() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/subscribers?active=eq.true&select=chat_id`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
  });
  return r.ok ? r.json() : [];
}
function tg(method, payload) {
  return fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((r) => r.json());
}
function zurichDate(offsetDays) {
  const t = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}
function shiftDate(ymd, days) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
async function fetchTomorrow() {
  const target = zurichDate(1);
  const startISO = `${shiftDate(target, -1)}T00:00:00+02:00`;
  const endISO = `${shiftDate(target, 2)}T00:00:00+02:00`;
  const url = `${API}?start_timestamp=${encodeURIComponent(startISO)}&end_timestamp=${encodeURIComponent(endISO)}`;
  let json = null;
  try { json = await (await fetch(url, { headers: { Accept: "application/json" } })).json(); } catch (_) {}
  const values = new Array(96).fill(null);
  let filled = 0;
  if (json && Array.isArray(json.prices)) {
    for (const p of json.prices) {
      if (!p.start_timestamp || !p.start_timestamp.startsWith(target)) continue;
      const hm = p.start_timestamp.slice(11, 16);
      const idx = +hm.slice(0, 2) * 4 + +hm.slice(3, 5) / 15;
      const iv = p.integrated && p.integrated[0] && p.integrated[0].value;
      if (idx >= 0 && idx < 96 && typeof iv === "number") { values[idx] = iv; filled++; }
    }
  }
  return filled === 96 ? { date: target, values } : null;
}
