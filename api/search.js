// GET /api/search?q=where jesus died&t=bible:ID&abbr=TPT&name=The Passion Translation
//   ->  { refs: ["Matthew 27:50", ...], via: ["ai", "bible"] }
//
// Finds places in the Bible from words or a description. Set up either (or both) in Vercel:
//   ANTHROPIC_API_KEY  understands descriptions ("where Jesus died", "the verse about not worrying")
//   BIBLE_API_KEY      exact-word search through API.Bible, in the same translation as the one selected on the page when possible
//   SEARCH_BIBLE_ID    optional: an extra API.Bible Bible id to search in
// OPERATOR_PIN protects it, the same PIN as /api/dg-token.
//
// Both searches run at the same time, so the answer comes back as fast as the slower one (never the two added together).
// The AI answer goes first; exact-word matches only fill in behind it.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

const withTimeout = (p, ms) => {
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timed out")), ms); })])
    .finally(() => clearTimeout(timer));
};

async function viaAI(q, trName) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: "You help a church operator find Bible passages quickly. The operator gives words from a verse, or describes a story, person or topic, " +
        "or asks where something happened ('where Jesus died', 'where Solomon died'). " +
        (trName ? `The operator is reading from the ${trName}, so the words may follow that translation's wording. ` : "") +
        "Reply with JSON only, no other text: {\"refs\":[\"Matthew 27:50\"]}. Give up to 5 references, best match first, " +
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
  return refs.map(String).slice(0, 5);
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

// Which API.Bible Bibles to search, best first: the selected one, one with the same abbreviation, then fallbacks.
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

  const errors = [];
  const jobs = [];
  if (hasAI) jobs.push(withTimeout(viaAI(q, name || abbr), 7000).then((refs) => ({ tag: "ai", refs })));
  if (hasBible) {
    jobs.push(withTimeout((async () => {
      const ids = await chooseBibleIds(t, abbr);
      const out = [];
      for (const id of ids.slice(0, hasAI ? 1 : 3)) {      // with the AI answering too, one exact-word search is enough
        if (out.length >= 6) break;
        try { out.push(...await viaBible(q, id)); } catch (e) { errors.push(e.message); }
      }
      return out;
    })(), 8000).then((refs) => ({ tag: "bible", refs })));
  }
  const settled = await Promise.allSettled(jobs);
  const got = {};
  for (const s of settled) { if (s.status === "fulfilled") got[s.value.tag] = s.value.refs; else errors.push(s.reason && s.reason.message || "failed"); }

  const refs = [], via = [];
  const add = (arr, tag) => {
    let any = false;
    for (const r of arr || []) {
      const ref = String(r).trim();
      if (ref && !refs.some((x) => x.toLowerCase() === ref.toLowerCase())) { refs.push(ref); any = true; }
    }
    if (any && !via.includes(tag)) via.push(tag);
  };
  add(got.ai, "ai");
  add((got.bible || []).slice(0, got.ai && got.ai.length ? 2 : 6), "bible");   // exact-word matches only fill in behind the AI answer

  if (!refs.length && errors.length) return res.status(502).json({ error: errors[0] });
  return res.status(200).json({ refs: refs.slice(0, 8), via });
};
