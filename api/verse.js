// Vercel serverless function: GET /api/verse?ref=John+3:16&t=kjv
// Uses the free bible-api.com. To switch to API.Bible later, call it here
// with process.env.BIBLE_API_KEY so your key never reaches the browser.

const ALLOWED = ["kjv", "web", "bbe", "oeb-us", "oeb-cw", "almeida"];

module.exports = async (req, res) => {
  const ref = String(req.query.ref || "").trim();
  const t = ALLOWED.includes(req.query.t) ? req.query.t : "kjv";
  if (!ref || ref.length > 60) return res.status(400).json({ error: "Missing or invalid ref" });

  try {
    const r = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${t}`);
    if (!r.ok) return res.status(404).json({ error: "Verse not found" });
    const data = await r.json();
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    res.status(200).json({
      reference: data.reference,
      text: (data.text || "").trim().replace(/\s*\n\s*/g, " "),
      translation: data.translation_name || t.toUpperCase(),
    });
  } catch (e) {
    res.status(502).json({ error: "Bible service unavailable" });
  }
};
