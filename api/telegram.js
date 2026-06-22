// api/telegram.js — Webhook du bot Telegram (Vercel, Node 18+)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).send("unauthorized");
  }
  const update = req.body && typeof req.body === "object" ? req.body : await readJson(req);
  const msg = update && (update.message || update.edited_message);
  if (msg && msg.chat) {
    const chatId = msg.chat.id;
    const name = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || msg.chat.username || "";
    const text = (msg.text || "").trim().toLowerCase();
    if (text.startsWith("/start")) {
      await upsert(chatId, name, true);
      await tg("sendMessage", { chat_id: chatId, text: "Inscrit \u2705\nVous recevrez chaque soir (vers 18h) le meilleur cr\u00e9neau du lendemain \u2014 tarif VARIO Groupe E.\n\nPour arr\u00eater : /stop" });
    } else if (text.startsWith("/stop")) {
      await upsert(chatId, name, false);
      await tg("sendMessage", { chat_id: chatId, text: "D\u00e9sinscrit. Renvoyez /start quand vous voulez les alertes \u00e0 nouveau." });
    } else {
      await tg("sendMessage", { chat_id: chatId, text: "Envoyez /start pour recevoir les alertes du tarif VARIO." });
    }
  }
  return res.status(200).json({ ok: true });
}
function readJson(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
  });
}
async function tg(method, payload) {
  return fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((r) => r.json());
}
async function upsert(chat_id, name, active) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/subscribers`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ chat_id, name, active }),
  });
}
