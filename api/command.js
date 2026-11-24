// POST /api/command   body: { text, current, translation, translations, layout, auto, detected }
//   ->  { action: { type: "show" | "step" | "translation" | "search" | "clear" | "layout" | "auto" | "show_item" | "none", ... } }
//
// Turns anything the operator says out loud ("go to the third verse after this", "put it in lower third",
// "switch to the amplified", "show the second one", "where did Solomon die") into ONE screen action.
// Needs ANTHROPIC_API_KEY in Vercel (the same key the word search uses). OPERATOR_PIN protects it.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

const SYSTEM =
  "You turn what a church media operator says out loud into ONE command for a Bible verse screen. " +
  "You are given the operator's sentence and the current state. Reply with JSON only, no other text: {\"type\": ...}. Types:\n" +
  "{\"type\":\"show\",\"ref\":\"John 3:16\"}  show a verse or passage (standard English book names, 'Book chapter:verse' or 'Book chapter:verse-verse'). " +
  "Work out relative requests from the current verse: 'go to verse 5' in John 3:16 is John 3:5; 'chapter 4' is John 4:1; 'the verse after next' is 2 verses on.\n" +
  "{\"type\":\"step\",\"nav\":\"next\"|\"prev\",\"unit\":\"verse\"|\"chapter\",\"count\":1}  move from the verse on screen (count 1 to 10).\n" +
  "{\"type\":\"translation\",\"abbr\":\"NIV\"}  switch translation; abbr must be one of the available translations.\n" +
  "{\"type\":\"search\",\"query\":\"where Solomon died\"}  find a verse from words or a description (a story, a person, a topic).\n" +
  "{\"type\":\"clear\"}  blank the screen.\n" +
  "{\"type\":\"layout\",\"value\":\"full\"|\"lower\"}  full screen or lower third.\n" +
  "{\"type\":\"auto\",\"value\":true|false}  turn automatic showing of detected verses on or off.\n" +
  "{\"type\":\"show_item\",\"n\":1}  show the nth verse in the detected list, 1 being the newest ('show the first one', 'show the second one').\n" +
  "{\"type\":\"none\"}  anything that is not clearly an instruction to the screen: preaching, prayer, announcements, conversation, a question to the congregation. " +
  "When in doubt, answer none. Never invent a verse. Give exactly one action.";

const TYPES = new Set(["show", "step", "translation", "search", "clear", "layout", "auto", "show_item", "none"]);

function clean(a, translations) {
  if (!a || typeof a !== "object" || !TYPES.has(a.type)) return { type: "none" };
  switch (a.type) {
    case "show": { const ref = String(a.ref || "").slice(0, 60); return ref ? { type: "show", ref } : { type: "none" }; }
    case "step": return { type: "step", nav: a.nav === "prev" ? "prev" : "next", unit: a.unit === "chapter" ? "chapter" : "verse",
      count: Math.max(1, Math.min(10, parseInt(a.count, 10) || 1)) };
    case "translation": {
      const abbr = String(a.abbr || "").trim();
      const ok = translations.find((t) => t.toUpperCase() === abbr.toUpperCase());
      return ok ? { type: "translation", abbr: ok } : { type: "none" };
    }
    case "search": { const query = String(a.query || "").trim().slice(0, 200); return query.length >= 3 ? { type: "search", query } : { type: "none" }; }
    case "layout": return a.value === "lower" || a.value === "full" ? { type: "layout", value: a.value } : { type: "none" };
    case "auto": return typeof a.value === "boolean" ? { type: "auto", value: a.value } : { type: "none" };
    case "show_item": return { type: "show_item", n: Math.max(1, Math.min(12, parseInt(a.n, 10) || 1)) };
    default: return { type: a.type };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const pin = process.env.OPERATOR_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "Wrong or missing PIN" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: "Smart commands need ANTHROPIC_API_KEY in Vercel" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { b = null; } }
  const text = String((b && b.text) || "").trim().slice(0, 300);
  if (text.length < 2) return res.status(400).json({ error: "Nothing to interpret" });
  const translations = (Array.isArray(b.translations) ? b.translations : []).map(String).slice(0, 80);

  const state =
    `Current verse on screen: ${b.current ? String(b.current).slice(0, 40) : "nothing"}\n` +
    `Current translation: ${String(b.translation || "").slice(0, 20)}\n` +
    `Available translations: ${translations.join(", ") || "unknown"}\n` +
    `Layout: ${b.layout === "lower" ? "lower third" : "full screen"}\n` +
    `Automatic showing of detected verses: ${b.auto ? "on" : "off"}\n` +
    `Verses in the detected list: ${parseInt(b.detected, 10) || 0}\n\n` +
    `Operator said: ${text}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 150, system: SYSTEM, messages: [{ role: "user", content: state }] }),
    });
    if (!r.ok) return res.status(502).json({ error: "Claude answered " + r.status });
    const d = await r.json();
    const out = (d.content || []).map((x) => x.text || "").join("");
    const m = /\{[\s\S]*\}/.exec(out);
    let a = null;
    try { a = m ? JSON.parse(m[0]) : null; } catch (_) {}
    return res.status(200).json({ action: clean(a, translations) });
  } catch (e) {
    return res.status(502).json({ error: e.name === "AbortError" ? "Claude took too long" : e.message });
  } finally {
    clearTimeout(timer);
  }
};
