// GET /api/search?q=where jesus wept&t=free:kjv  ->  { refs: ["John 11:35", ...], via: "ai" | "bible" }
//
// Two ways to find a place in the Bible from words or a description. Set up either (or both) in Vercel:
//   ANTHROPIC_API_KEY  understands descriptions ("where David killed Goliath", "the verse about not worrying")
//   BIBLE_API_KEY      exact-word search inside the selected API.Bible translation (you may already have this)
// OPERATOR_PIN protects it, the same PIN as /api/dg-token.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

async function viaAI(q) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: "You help a church operator find Bible passages quickly. The operator gives words from a verse, or describes a story, person or topic. " +
        "Reply with JSON only, no other text: {\"refs\":[\"John 11:35\"]}. Give up to 4 references, best match first, " +
        "as 'Book chapter:verse' or 'Book chapter:verse-verse' using standard English book names (for example 1 Corinthians, Psalms). " +
        "If nothing fits, reply {\"refs\":[]}. Never invent verses.",
      messages: [{ role: "user", content: q }],
    }),
  });
  if (!r.ok) throw new Error("Claude answered " + r.status);
  const d = await r.json();
  const text = (d.content || []).map((b) => b.text || "").join("");
  const m = /\{[\s\S]*\}/.exec(text);
  const refs = m ? (JSON.parse(m[0]).refs || []) : [];
  return { refs: refs.map(String).slice(0, 5), via: "ai" };
}

async function viaBible(q, bibleId) {
  const url = `https://rest.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/search?query=${encodeURIComponent(q)}&limit=5&sort=relevance`;
  const r = await fetch(url, { headers: { "api-key": process.env.BIBLE_API_KEY } });
  if (!r.ok) throw new Error("API.Bible answered " + r.status);
  const d = await r.json();
  const verses = (d.data && d.data.verses) || [];
  const passages = (d.data && d.data.passages) || [];
  return { refs: [...verses, ...passages].map((v) => v.reference).filter(Boolean).slice(0, 5), via: "bible" };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const pin = process.env.OPERATOR_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "Wrong or missing PIN" });

  const q = String(req.query.q || "").trim().slice(0, 300);
  if (q.length < 3) return res.status(400).json({ error: "Type a few more words" });
  const t = String(req.query.t || "");
  const bibleId = t.startsWith("bible:") ? t.slice(6) : "";
  const canBible = !!process.env.BIBLE_API_KEY && !!bibleId;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      try { return res.status(200).json(await viaAI(q)); }
      catch (e) { if (!canBible) throw e; }               // AI failed: try the exact-word search instead
    }
    if (canBible) return res.status(200).json(await viaBible(q, bibleId));
    return res.status(501).json({
      error: "Search is not set up. Add ANTHROPIC_API_KEY in Vercel, or pick an API.Bible translation (such as NIV) and add BIBLE_API_KEY.",
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
