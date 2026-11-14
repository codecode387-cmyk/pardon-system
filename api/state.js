// /api/state?room=CODE
//   POST  the operator page saves what is on screen
//   GET   any display page (EasyWorship browser, OBS, another computer) reads it
// Needs a free Upstash Redis store connected to the Vercel project (see README steps).

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("Redis answered " + r.status);
  return (await r.json()).result;
}

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const room = String(req.query.room || "");
  if (!/^[a-z0-9]{8,40}$/.test(room)) return res.status(400).json({ error: "Bad room code" });
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(501).json({ error: "Relay not set up: connect an Upstash Redis store to this Vercel project and redeploy." });
  }
  const key = "vs:room:" + room;

  try {
    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { b = null; } }
      if (!b || (b.type !== "show" && b.type !== "clear")) return res.status(400).json({ error: "Bad message" });

      const state = { type: b.type, ts: Number(b.ts) || Date.now() };
      if (b.type === "show") {
        const v = b.verse || {};
        state.layout = b.layout === "lower" ? "lower" : "full";
        state.verse = {
          ref: clip(v.ref, 80), reference: clip(v.reference, 80), text: clip(v.text, 6000),
          translation: clip(v.translation, 40), copyright: clip(v.copyright, 600),
        };
      }
      await redis(["SET", key, JSON.stringify(state), "EX", 43200]);   // forgotten after 12 hours
      return res.status(200).json({ ok: true });
    }

    const raw = await redis(["GET", key]);
    return res.status(200).json({ state: raw ? JSON.parse(raw) : null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
