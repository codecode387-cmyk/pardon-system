// GET /api/dg-token  ->  { token }
// Gives the operator page a short-lived Deepgram token, so your real Deepgram key never reaches the browser.
// Vercel environment variables:
//   DEEPGRAM_API_KEY   (required)  your Deepgram key
//   OPERATOR_PIN       (recommended) any PIN you choose; without it, anyone who finds your site could use your Deepgram credit

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return res.status(501).json({ error: "DEEPGRAM_API_KEY is not set in Vercel" });

  const pin = process.env.OPERATOR_PIN;
  if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "Wrong or missing PIN" });

  try {
    const r = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: "Token " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),     // only needed for the moment the connection opens
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
      return res.status(502).json({ error: "Deepgram refused the request (status " + r.status + "). Check the key and its permissions." });
    }
    return res.status(200).json({ token: d.access_token, expires_in: d.expires_in });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
