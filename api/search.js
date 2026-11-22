// GET /api/search?q=where jesus wept&t=bible:ID&abbr=TPT&name=The Passion Translation
//   ->  { refs: ["John 11:35", ...], via: ["ai", "bible"] }
//
// Finds places in the Bible from words or a description. Set up either (or both) in Vercel:
//   ANTHROPIC_API_KEY  understands descriptions ("where David killed Goliath") and is told which translation you use
//   BIBLE_API_KEY      exact-word search through API.Bible. It searches the SAME translation as the one selected on the
//                      page when API.Bible has it (KJV, NKJV, AMP, NIV...), then a couple of other English Bibles.
//   SEARCH_BIBLE_ID    optional: an extra API.Bible Bible id to search in
// OPERATOR_PIN protects it, the same PIN as /api/dg-token.
//
// YouVersion has no word-search service, so for YouVersion-only translations (TPT and others) this returns the best
// candidates from the sources above. The page then loads every candidate in the translation you selected and sorts
// them by how well the words really match that translation's text.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

async function viaAI(q, trName) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: "You help a church operator find Bible passages quickly. The operator gives words from a verse, or describes a story, person or topic. " +
        (trName ? `The operator is reading from the ${trName}, so the words may follow that translation's wording rather than the King James wording. ` : "") +
        "Reply with JSON only, no other text: {\"refs\":[\"John 11:35\"]}. Give up to 6 references, best match first, " +
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
  return refs.map(String).slice(0, 6);
}

// English Bibles this API.Bible key can use (kept for an hour).
let bibleCache = { at: 0, list: [] };
async function listBibles() {
  if (bibleCache.list.length && Date.now() - bibleCache.at < 3600e3) return bibleCache.list;
  const r = await fetch("https://rest.api.bible/v1/bibles?language=eng", { headers: { "api-key": process.env.BIBLE_API_KEY } });
  if (!r.ok) throw new Error("API.Bible answered " + r.status + " when listing Bibles");
  const list = ((await r.json()).data || []).filter((b) => b && b.id);
  bibleCache = { at: Date.now(), list };
  return list;
}
const abbrOf = (b) => String(b.abbreviationLocal || b.abbreviation || "").toUpperCase();

// Which API.Bible Bibles to search, best first: the selected one, one with the same abbreviation (KJV, NKJV, AMP...), then fallbacks.
async function chooseBibleIds(t, abbr) {
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  if (t.startsWith("bible:")) add(t.slice(6));
  let list = [];
  try { list = await listBibles(); } catch (e) { if (!ids.length && !process.env.SEARCH_BIBLE_ID) throw e; }
  const want = String(abbr || "").toUpperCase();
  if (want) for (const b of list) if (abbrOf(b) === want) add(b.id);
  add(process.env.SEARCH_BIBLE_ID);
  for (const p of ["KJV", "NIV", "WEB", "ASV", "NKJV"]) { const b = list.find((x) => abbrOf(x) === p); if (b) add(b.id); }
  if (!ids.length && list[0]) add(list[0].id);
  if (!ids.length) throw new Error("Your API.Bible key has no English Bibles enabled. Enable some in the API.Bible dashboard.");
  return ids;
}

async function viaBible(q, bibleId) {
  const url = `https://rest.api.bible/v1/bibles/${encodeURIComponent(bibleId)}/search?query=${encodeURIComponent(q)}&limit=6&sort=relevance`;
  const r = await fetch(url, { headers: { "api-key": process.env.BIBLE_API_KEY } });
  if (!r.ok) throw new Error("API.Bible answered " + r.status);
  const d = await r.json();
  const verses = (d.data && d.data.verses) || [];
  const passages = (d.data && d.data.passages) || [];
  return [...verses, ...passages].map((v) => v.reference).filter(Boolean).slice(0, 6);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const pin = process.env.OPERATOR_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "Wrong or missing PIN" });

  const q = String(req.query.q || "").trim().slice(0, 300);
  if (q.length < 3) return res.status(400).json({ error: "Type a few more words" });
  const t = String(req.query.t || "");
  const abbr = String(req.query.abbr || "").slice(0, 20);
  const name = String(req.query.name || "").slice(0, 80);
  const hasAI = !!process.env.ANTHROPIC_API_KEY, hasBible = !!process.env.BIBLE_API_KEY;

  if (!hasAI && !hasBible) {
    return res.status(501).json({ error: "Search is not set up on the server. Add ANTHROPIC_API_KEY (best) or BIBLE_API_KEY in Vercel and redeploy." });
  }

  const refs = [], via = [], errors = [];
  const add = (arr, tag) => {
    let any = false;
    for (const r of arr) {
      const ref = String(r).trim();
      if (ref && !refs.some((x) => x.toLowerCase() === ref.toLowerCase())) { refs.push(ref); any = true; }
    }
    if (any && !via.includes(tag)) via.push(tag);
  };

  if (hasAI) {
    try { add(await viaAI(q, name || abbr), "ai"); } catch (e) { errors.push(e.message); }
  }
  if (hasBible) {
    try {
      const ids = await chooseBibleIds(t, abbr);
      for (const id of ids.slice(0, 3)) {
        if (refs.length >= 6) break;
        try { add(await viaBible(q, id), "bible"); } catch (e) { errors.push(e.message); }
      }
    } catch (e) { errors.push(e.message); }
  }

  if (!refs.length && errors.length) return res.status(502).json({ error: errors[0] });
  return res.status(200).json({ refs: refs.slice(0, 8), via });
};
