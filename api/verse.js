// GET /api/verse?ref=John+3:16&t=free:kjv
// t can be:  free:kjv | free:web | bible:<API.Bible id> | esv
const { parseRef, usfm } = require("../lib/books");

const FREE = ["kjv", "web", "bbe", "oeb-us"];
const ESV_COPY = "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.";

class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const clean = (t) => String(t || "").replace(/¶/g, "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

function clip(text, max = 1000) {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  return { text: cut.slice(0, cut.lastIndexOf(" ")) + "…", truncated: true };
}

async function fromFree(code, ref) {
  if (!FREE.includes(code)) throw new Fail(400, "Unknown free translation");
  const r = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${code}`);
  if (!r.ok) throw new Fail(404, "Verse not found");
  const d = await r.json();
  return { reference: d.reference, text: clean(d.text), copyright: "" };
}

async function fromApiBible(bibleId, p) {
  const key = process.env.BIBLE_API_KEY;
  if (!key) throw new Fail(501, "BIBLE_API_KEY is not set on the server");
  if (!/^[\w-]{8,40}$/.test(bibleId)) throw new Fail(400, "Bad Bible id");
  const q = "content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false&include-verse-spans=false";
  const r = await fetch(`https://rest.api.bible/v1/bibles/${bibleId}/passages/${usfm(p)}?${q}`, { headers: { "api-key": key } });
  if (r.status === 401 || r.status === 403) throw new Fail(403, "This translation is not enabled for your API.Bible key");
  if (!r.ok) throw new Fail(404, "Verse not found in this translation");
  const d = (await r.json()).data || {};
  return { reference: clean(d.reference), text: clean(d.content), copyright: clean(d.copyright) };
}

async function fromEsv(p) {
  const key = process.env.ESV_API_KEY;
  if (!key) throw new Fail(501, "ESV_API_KEY is not set on the server");
  const q = p.v1 == null ? `${p.book} ${p.ch}` : `${p.book} ${p.ch}:${p.v1}${p.v2 ? "-" + p.v2 : ""}`;
  const params = "include-headings=false&include-footnotes=false&include-verse-numbers=false&include-short-copyright=false&include-passage-references=false";
  const r = await fetch(`https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(q)}&${params}`, { headers: { Authorization: `Token ${key}` } });
  if (!r.ok) throw new Fail(r.status === 401 ? 403 : 404, "ESV lookup failed");
  const d = await r.json();
  if (!d.passages || !d.passages[0]) throw new Fail(404, "Verse not found");
  return { reference: d.canonical, text: clean(d.passages[0]), copyright: ESV_COPY };
}

module.exports = async (req, res) => {
  const ref = String(req.query.ref || "").trim();
  const t = String(req.query.t || "free:kjv");
  const p = parseRef(ref);
  if (!p) return res.status(400).json({ error: "Could not read that reference" });

  try {
    let out;
    if (t.startsWith("bible:")) out = await fromApiBible(t.slice(6), p);
    else if (t === "esv") out = await fromEsv(p);
    else out = await fromFree(t.replace(/^free:/, ""), ref);

    const { text, truncated } = clip(out.text);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({ reference: out.reference || ref, text, truncated, copyright: out.copyright });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.status ? e.message : "Bible service unavailable" });
  }
};
