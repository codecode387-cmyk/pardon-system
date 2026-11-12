// GET /api/translations  ->  every translation this deployment can show.
// Free ones always work. Add BIBLE_API_KEY (and optionally ESV_API_KEY) in Vercel to unlock more.

const POPULAR = ["NIV", "NKJV", "NLT", "ESV", "NASB", "CSB", "AMP", "MSG", "GNT", "KJV", "WEB", "ASV"];
const rank = (abbr) => { const i = POPULAR.indexOf(String(abbr).toUpperCase()); return i === -1 ? 99 : i; };

module.exports = async (req, res) => {
  const list = [
    { id: "free:kjv", abbr: "KJV", name: "King James Version", group: "Free" },
    { id: "free:web", abbr: "WEB", name: "World English Bible", group: "Free" },
    { id: "free:bbe", abbr: "BBE", name: "Bible in Basic English", group: "Free" },
    { id: "free:oeb-us", abbr: "OEB", name: "Open English Bible", group: "Free" },
  ];
  const info = { bible: !!process.env.BIBLE_API_KEY, esv: !!process.env.ESV_API_KEY, warnings: [] };

  if (info.esv) list.push({ id: "esv", abbr: "ESV", name: "English Standard Version", group: "ESV API" });

  if (info.bible) {
    try {
      const langs = (process.env.BIBLE_LANGS || "eng").split(",").map((s) => s.trim());
      const r = await fetch("https://rest.api.bible/v1/bibles", { headers: { "api-key": process.env.BIBLE_API_KEY } });
      if (!r.ok) throw new Error("API.Bible rejected the key (status " + r.status + ")");
      const d = await r.json();
      const found = (d.data || [])
        .filter((b) => b.language && langs.includes(b.language.id))
        .map((b) => ({ id: "bible:" + b.id, abbr: b.abbreviationLocal || b.abbreviation || b.name, name: b.nameLocal || b.name, group: "API.Bible" }))
        .sort((a, b) => rank(a.abbr) - rank(b.abbr) || a.name.localeCompare(b.name));
      list.unshift(...found);
      const have = found.map((b) => String(b.abbr).toUpperCase());
      const missing = ["NIV", "NLT", "NKJV"].filter((a) => !have.includes(a));
      if (!found.length) info.warnings.push("Your API.Bible key works, but it returned no Bibles in the selected language(s).");
      else if (missing.length) info.hint = `Your API.Bible key works (${found.length} Bibles found), but ${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not enabled for it yet. In your API.Bible dashboard, open your app and check its selected Bibles. Some need approval from the publisher first.`;
    } catch (e) {
      info.warnings.push(e.message);
    }
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
  res.status(200).json({ translations: list, ...info });
};
