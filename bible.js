// Looks up Bible text straight from the browser, so the app still works when the /api folder is missing.
// It talks to bible-api.com (free translations) and to API.Bible (NIV, NLT and others) using a key
// that you paste into the page. The key is kept only in this browser, never in GitHub.
(function (root) {
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
  const ORDER = Object.keys(CODES);
  const CHAPTERS = {
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
  const POPULAR = ["NIV", "NKJV", "NLT", "ESV", "NASB", "CSB", "AMP", "MSG", "GNT", "KJV", "WEB", "ASV"];
  const rank = (a) => { const i = POPULAR.indexOf(String(a).toUpperCase()); return i === -1 ? 99 : i; };

  class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }

  function parseRef(ref) {
    const m = /^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(String(ref).trim());
    if (!m || !CODES[m[1]]) return null;
    return { book: m[1], code: CODES[m[1]], ch: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null };
  }
  const make = (book, ch, v1, v2) => ({ book, code: CODES[book], ch, v1: v1 || null, v2: v2 || null });
  const fmt = (p) => `${p.book} ${p.ch}` + (p.v1 ? `:${p.v1}` + (p.v2 && p.v2 > p.v1 ? `-${p.v2}` : "") : "");
  function usfm(p) {
    if (p.v1 == null) return `${p.code}.${p.ch}`;
    if (p.v2 == null || p.v2 <= p.v1) return `${p.code}.${p.ch}.${p.v1}`;
    return `${p.code}.${p.ch}.${p.v1}-${p.code}.${p.ch}.${p.v2}`;
  }
  const freeName = (b) => (b === "Psalms" ? "Psalm" : b);

  const countCache = new Map();
  async function verseCount(book, ch) {
    const key = book + " " + ch;
    if (countCache.has(key)) return countCache.get(key);
    try {
      const r = await fetch(`https://bible-api.com/${encodeURIComponent(freeName(book) + " " + ch)}?translation=kjv`);
      if (!r.ok) return null;
      const vs = (await r.json()).verses || [];
      const n = vs.length ? vs[vs.length - 1].verse : null;
      if (n) countCache.set(key, n);
      return n || null;
    } catch (_) { return null; }
  }

  function adjacentChapter(book, ch, dir) {
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
      return a ? make(a.book, a.ch, p.v1 == null ? null : 1) : null;
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
    const a = adjacentChapter(p.book, p.ch, "prev");
    if (!a) return null;
    return make(a.book, a.ch, (await verseCount(a.book, a.ch)) || null);
  }

  const clean = (t) => String(t || "").replace(/¶/g, "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  function clip(text, max = 1000) {
    if (text.length <= max) return { text, truncated: false };
    const cut = text.slice(0, max);
    return { text: cut.slice(0, cut.lastIndexOf(" ")) + "…", truncated: true };
  }

  async function fromFree(code, p) {
    if (!FREE.includes(code)) throw new Fail(400, "Unknown free translation");
    let r;
    try { r = await fetch(`https://bible-api.com/${encodeURIComponent(freeName(p.book) + " " + fmt(p).slice(p.book.length + 1))}?translation=${code}`); }
    catch (_) { throw new Fail(502, "Could not reach the free Bible service. Check the internet connection."); }
    if (r.status === 429) throw new Fail(429, "The free Bible service is busy. Wait a few seconds and try again.");
    if (!r.ok) throw new Fail(404, "Verse not found");
    const d = await r.json();
    return { reference: d.reference, text: clean(d.text), copyright: "" };
  }

  async function fromApiBible(bibleId, p, key) {
    if (!key) throw new Fail(501, "This translation needs your API.Bible key. Paste it under “Not seeing NIV…” on this page.");
    if (!/^[\w-]{8,40}$/.test(bibleId)) throw new Fail(400, "Bad Bible id");
    const q = "content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false&include-verse-spans=false";
    let r;
    try { r = await fetch(`https://rest.api.bible/v1/bibles/${bibleId}/passages/${usfm(p)}?${q}`, { headers: { "api-key": key } }); }
    catch (_) { throw new Fail(502, "Could not reach API.Bible. Check the internet, and that the key's allowed domains in the API.Bible dashboard include this site."); }
    if (r.status === 401 || r.status === 403) throw new Fail(403, "API.Bible did not accept the key for this translation. Check the key, and that this Bible is enabled for your app.");
    if (!r.ok) throw new Fail(404, "Verse not found in this translation");
    const d = (await r.json()).data || {};
    return { reference: clean(d.reference), text: clean(d.content), copyright: clean(d.copyright) };
  }

  const load = (t, p, keys) =>
    t.startsWith("bible:") ? fromApiBible(t.slice(6), p, keys.bibleKey) :
    t === "esv" ? Promise.reject(new Fail(501, "ESV needs the server setup. Pick another translation.")) :
    fromFree(t.replace(/^free:/, ""), p);

  // q = { ref, t, nav, unit }   keys = { bibleKey }
  async function lookup(q, keys) {
    keys = keys || {};
    const t = String(q.t || "free:kjv");
    let p = parseRef(String(q.ref || "").trim());
    if (!p) throw new Fail(400, "Could not read that reference");
    const nav = q.nav === "next" || q.nav === "prev" ? q.nav : null;
    const unit = q.unit === "chapter" ? "chapter" : "verse";
    if (nav) {
      const target = await step(p, nav, unit);
      if (!target) throw new Fail(404, "There is nothing further in that direction");
      p = target;
    }
    let out;
    try { out = await load(t, p, keys); }
    catch (e) {
      const a = nav === "next" && unit === "verse" && e.status === 404 && p.v1 ? adjacentChapter(p.book, p.ch, "next") : null;
      if (!a) throw e;
      p = make(a.book, a.ch, 1);
      out = await load(t, p, keys);
    }
    const { text, truncated } = clip(out.text);
    return { ref: fmt(p), reference: out.reference || fmt(p), text, truncated, copyright: out.copyright };
  }

  // keys = { bibleKey, langs }
  async function listTranslations(keys) {
    keys = keys || {};
    const list = [
      { id: "free:kjv", abbr: "KJV", name: "King James Version", group: "Free" },
      { id: "free:web", abbr: "WEB", name: "World English Bible", group: "Free" },
      { id: "free:bbe", abbr: "BBE", name: "Bible in Basic English", group: "Free" },
      { id: "free:oeb-us", abbr: "OEB", name: "Open English Bible", group: "Free" },
    ];
    const info = { bible: !!keys.bibleKey, esv: false, warnings: [] };
    if (keys.bibleKey) {
      try {
        const langs = (keys.langs || "eng").split(",").map((s) => s.trim());
        let r;
        try { r = await fetch("https://rest.api.bible/v1/bibles", { headers: { "api-key": keys.bibleKey } }); }
        catch (_) { throw new Error("Your browser could not reach API.Bible. Check the internet connection, and the key's allowed domains in the API.Bible dashboard."); }
        if (!r.ok) throw new Error("API.Bible rejected the key (status " + r.status + "). Check that it was copied completely.");
        const d = await r.json();
        const found = (d.data || [])
          .filter((b) => b.language && langs.includes(b.language.id))
          .map((b) => ({ id: "bible:" + b.id, abbr: b.abbreviationLocal || b.abbreviation || b.name, name: b.nameLocal || b.name, group: "API.Bible" }))
          .sort((a, b) => rank(a.abbr) - rank(b.abbr) || a.name.localeCompare(b.name));
        list.unshift(...found);
        info.found = found.map((b) => b.abbr);
        info.total = (d.data || []).length;
        const have = info.found.map((a) => String(a).toUpperCase());
        const missing = ["NIV", "NLT", "NKJV"].filter((a) => !have.includes(a));
        if (!found.length) info.warnings.push(info.total ? `Your key works and returned ${info.total} Bibles, but none in English.` : "Your key works, but no Bibles are enabled for it yet. In your API.Bible dashboard, open your app and select the Bibles you want.");
        else if (missing.length) info.hint = `Your API.Bible key works (${found.length} Bibles found), but ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not enabled for it yet. In your API.Bible dashboard, open your app and check its selected Bibles. Some need approval from the publisher first.`;
      } catch (e) { info.warnings.push(e.message); }
    }
    return { translations: list, ...info };
  }

  const API = { lookup, listTranslations, parseRef, fmt };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BibleCore = API;
})(typeof window !== "undefined" ? window : globalThis);
