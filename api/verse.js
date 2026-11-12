// GET /api/verse?ref=John+3:16&t=free:kjv                    -> that verse
// GET /api/verse?ref=John+3:16&t=free:kjv&nav=next&unit=verse -> the next verse (nav: next|prev, unit: verse|chapter)
// t can be:  free:kjv | free:web | bible:<API.Bible id> | esv
// The API key is read from the Vercel setting BIBLE_API_KEY. Never paste a key into this file.

const CODES = {
  "Genesis":"GEN","Exodus":"EXO","Leviticus":"LEV","Numbers":"NUM","Deuteronomy":"DEU","Joshua":"JOS","Judges":"JDG","Ruth":"RUT",
  "1 Samuel":"1SA","2 Samuel":"2SA","1 Kings":"1KI","2 Kings":"2KI","1 Chronicles":"1CH","2 Chronicles":"2CH",
  "Ezra":"EZR","Nehemiah":"NEH","Esther":"EST","Job":"JOB","Psalms":"PSA","Proverbs":"PRO","Ecclesiastes":"ECC",
  "Song of Solomon":"SNG","Isaiah":"ISA","Jeremiah":"JER","Lamentations":"LAM","Ezekiel":"EZK","Daniel":"DAN",
  "Hosea":"HOS","Joel":"JOL","Amos":"AMO","Obadiah":"OBA","Jonah":"JON","Micah":"MIC","Nahum":"NAM","Habakkuk":"HAB",
  "Zephaniah":"ZEP","Haggai":"HAG","Zechariah":"ZEC","Malachi":"MAL","Matthew":"MAT","Mark":"MRK","Luke":"LUK",
  "John":"JHN","Acts":"ACT","Romans":"ROM","1 Corinthians":"1CO","2 Corinthians":"2CO","Galatians":"GAL",
  "Ephesians":"EPH","Philippians":"PHP","Colossians":"COL","1 Thessalonians":"1TH","2 Thessalonians":"2TH",
  "1 Timothy":"1TI","2 Timothy":"2TI","Titus":"TIT","Philemon":"PHM","Hebrews":"HEB","James":"JAS",
  "1 Peter":"1PE","2 Peter":"2PE","1 John":"1JN","2 John":"2JN","3 John":"3JN","Jude":"JUD","Revelation":"REV",
};
const ORDER = Object.keys(CODES);                       // books in Bible order
const CHAPTERS = {                                      // number of chapters in each book
  "Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,"Joshua":24,"Judges":21,"Ruth":4,
  "1 Samuel":31,"2 Samuel":24,"1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,"Ezra":10,"Nehemiah":13,
  "Esther":10,"Job":42,"Psalms":150,"Proverbs":31,"Ecclesiastes":12,"Song of Solomon":8,"Isaiah":66,"Jeremiah":52,
  "Lamentations":5,"Ezekiel":48,"Daniel":12,"Hosea":14,"Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,"Nahum":3,
  "Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4,"Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,
  "Romans":16,"1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,"Philippians":4,"Colossians":4,
  "1 Thessalonians":5,"2 Thessalonians":3,"1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,"James":5,
  "1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,"Jude":1,"Revelation":22,
};

const FREE = ["kjv", "web", "bbe", "oeb-us"];
const ESV_COPY = "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers.";

class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------- references ---------- */
function parseRef(ref) {
  const m = /^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(String(ref).trim());
  if (!m || !CODES[m[1]]) return null;
  return { book: m[1], code: CODES[m[1]], ch: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null };
}
const make = (book, ch, v1, v2) => ({ book, code: CODES[book], ch, v1: v1 || null, v2: v2 || null });
const fmt = (p) => `${p.book} ${p.ch}` + (p.v1 ? `:${p.v1}` + (p.v2 && p.v2 > p.v1 ? `-${p.v2}` : "") : "");

// API.Bible passage id: JHN.3.16 | JHN.3.16-JHN.3.18 | PSA.23
function usfm(p) {
  if (p.v1 == null) return `${p.code}.${p.ch}`;
  if (p.v2 == null || p.v2 <= p.v1) return `${p.code}.${p.ch}.${p.v1}`;
  return `${p.code}.${p.ch}.${p.v1}-${p.code}.${p.ch}.${p.v2}`;
}

/* ---------- moving to the next or previous verse or chapter ---------- */
const countCache = new Map();
async function verseCount(book, ch) {                   // how many verses in a chapter (taken from the free KJV text)
  const key = book + " " + ch;
  if (countCache.has(key)) return countCache.get(key);
  try {
    const r = await fetch(`https://bible-api.com/${encodeURIComponent((book === "Psalms" ? "Psalm" : book) + " " + ch)}?translation=kjv`);
    if (!r.ok) return null;
    const vs = (await r.json()).verses || [];
    const n = vs.length ? vs[vs.length - 1].verse : null;
    if (n) countCache.set(key, n);
    return n || null;
  } catch (_) { return null; }
}

function adjacentChapter(book, ch, dir) {               // crosses into the next or previous book when needed
  const i = ORDER.indexOf(book);
  if (dir === "next") {
    if (ch < CHAPTERS[book]) return { book, ch: ch + 1 };
    return i + 1 < ORDER.length ? { book: ORDER[i + 1], ch: 1 } : null;
  }
  if (ch > 1) return { book, ch: ch - 1 };
  return i > 0 ? { book: ORDER[i - 1], ch: CHAPTERS[ORDER[i - 1]] } : null;
}

async function step(p, nav, unit) {
  if (unit === "chapter") {
    const a = adjacentChapter(p.book, p.ch, nav);
    if (!a) return null;
    return make(a.book, a.ch, p.v1 == null ? null : 1);  // a verse stays a verse (verse 1), a whole chapter stays a chapter
  }
  if (nav === "next") {
    if (p.v1 == null) return make(p.book, p.ch, 1);
    const nv = (p.v2 || p.v1) + 1, count = await verseCount(p.book, p.ch);
    if (count != null && nv > count) {
      const a = adjacentChapter(p.book, p.ch, "next");
      return a ? make(a.book, a.ch, 1) : null;
    }
    return make(p.book, p.ch, nv);
  }
  if (p.v1 != null && p.v1 > 1) return make(p.book, p.ch, p.v1 - 1);
  const a = adjacentChapter(p.book, p.ch, "prev");       // before verse 1 means the last verse of the previous chapter
  if (!a) return null;
  const count = await verseCount(a.book, a.ch);
  return make(a.book, a.ch, count || null);
}

/* ---------- getting the text ---------- */
const clean = (t) => String(t || "").replace(/¶/g, "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

function clip(text, max = 1000) {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  return { text: cut.slice(0, cut.lastIndexOf(" ")) + "…", truncated: true };
}

async function fromFree(code, p) {
  if (!FREE.includes(code)) throw new Fail(400, "Unknown free translation");
  const q = (p.book === "Psalms" ? "Psalm" : p.book) + " " + fmt(p).slice(p.book.length + 1);
  const r = await fetch(`https://bible-api.com/${encodeURIComponent(q)}?translation=${code}`);
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
  const params = "include-headings=false&include-footnotes=false&include-verse-numbers=false&include-short-copyright=false&include-passage-references=false";
  const r = await fetch(`https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(fmt(p))}&${params}`, { headers: { Authorization: `Token ${key}` } });
  if (!r.ok) throw new Fail(r.status === 401 ? 403 : 404, "ESV lookup failed");
  const d = await r.json();
  if (!d.passages || !d.passages[0]) throw new Fail(404, "Verse not found");
  return { reference: d.canonical, text: clean(d.passages[0]), copyright: ESV_COPY };
}

const load = (t, p) =>
  t.startsWith("bible:") ? fromApiBible(t.slice(6), p) :
  t === "esv" ? fromEsv(p) :
  fromFree(t.replace(/^free:/, ""), p);

/* ---------- the endpoint ---------- */
module.exports = async (req, res) => {
  const t = String(req.query.t || "free:kjv");
  let p = parseRef(String(req.query.ref || "").trim());
  if (!p) return res.status(400).json({ error: "Could not read that reference" });
  const nav = req.query.nav === "next" || req.query.nav === "prev" ? req.query.nav : null;
  const unit = req.query.unit === "chapter" ? "chapter" : "verse";

  try {
    if (nav) {
      const target = await step(p, nav, unit);
      if (!target) throw new Fail(404, "There is nothing further in that direction");
      p = target;
    }
    let out;
    try { out = await load(t, p); }
    catch (e) {                                          // if "next verse" ran past the end of the chapter, go to the next chapter
      const a = nav === "next" && unit === "verse" && e.status === 404 && p.v1 ? adjacentChapter(p.book, p.ch, "next") : null;
      if (!a) throw e;
      p = make(a.book, a.ch, 1);
      out = await load(t, p);
    }
    const { text, truncated } = clip(out.text);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({ ref: fmt(p), reference: out.reference || fmt(p), text, truncated, copyright: out.copyright });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.status ? e.message : "Bible service unavailable" });
  }
};
