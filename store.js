// Service notes storage, shared by the operator page and the notes page.
// Everything is saved in this browser (localStorage). Each service is one "session" made of entries:
//   speech  - what was said (paragraphs, split on pauses)
//   verse   - a verse that was put on screen
//   note    - something you typed yourself
const Store = (() => {
  const IDX = "vs:sessions", ACTIVE = "vs:active", PREFIX = "vs:s:";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const countWords = (t) => (String(t || "").trim().match(/\S+/g) || []).length;

  const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtClock = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  function elapsed(ms) {
    const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }
  const defaultTitle = () => "Service, " + new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  function stats(s) {
    let words = 0, verses = 0;
    for (const e of s.entries) { if (e.type === "verse") verses++; else words += countWords(e.text); }
    const last = s.entries.length ? (s.entries[s.entries.length - 1].end || s.entries[s.entries.length - 1].t) : s.start;
    return { words, verses, duration: last - s.start };
  }
  function meta(s) {
    const st = stats(s);
    return { id: s.id, title: s.title, preacher: s.preacher, start: s.start, updated: Date.now(), words: st.words, verses: st.verses };
  }

  const list = () => read(IDX, []).sort((a, b) => b.start - a.start);
  const get = (id) => read(PREFIX + id, null);
  function save(s) {
    if (!write(PREFIX + s.id, s)) return false;
    const idx = read(IDX, []).filter((m) => m.id !== s.id);
    idx.push(meta(s));
    return write(IDX, idx);
  }
  function activeId() { try { return localStorage.getItem(ACTIVE); } catch (_) { return null; } }
  function create(title) {
    const s = { id: uid(), title: title || defaultTitle(), preacher: "", start: Date.now(), entries: [] };
    save(s);
    try { localStorage.setItem(ACTIVE, s.id); } catch (_) {}
    return s;
  }
  const active = () => { const id = activeId(); return id ? get(id) : null; };
  const ensureActive = () => active() || create();
  function endActive() { try { localStorage.removeItem(ACTIVE); } catch (_) {} }

  function mutate(id, fn) { const s = get(id); if (!s) return false; fn(s); return save(s); }

  function addSpeech(text) {
    text = String(text || "").trim();
    if (!text) return true;
    const s = ensureActive(), now = Date.now(), last = s.entries[s.entries.length - 1];
    if (last && last.type === "speech" && now - (last.end || last.t) < 7000) { last.text += " " + text; last.end = now; }
    else s.entries.push({ id: uid(), type: "speech", t: now, end: now, text });
    return save(s);
  }
  function addVerse(v) {
    const s = ensureActive(), now = Date.now();
    const lastVerse = [...s.entries].reverse().find((e) => e.type === "verse");
    if (lastVerse && lastVerse.reference === v.reference && lastVerse.translation === v.translation && now - lastVerse.t < 30000) return true;
    s.entries.push({ id: uid(), type: "verse", t: now, end: now, reference: v.reference, text: v.text, translation: v.translation, copyright: v.copyright || "" });
    return save(s);
  }
  function addNote(id, text) {
    const e = { id: uid(), type: "note", t: Date.now(), end: Date.now(), text: text || "" };
    return mutate(id, (s) => s.entries.push(e)) ? e.id : null;
  }
  const update = (id, eid, patch) => mutate(id, (s) => { const e = s.entries.find((x) => x.id === eid); if (e) Object.assign(e, patch); });
  const remove = (id, eid) => mutate(id, (s) => { s.entries = s.entries.filter((x) => x.id !== eid); });
  const rename = (id, patch) => mutate(id, (s) => Object.assign(s, patch));
  function del(id) {
    try { localStorage.removeItem(PREFIX + id); } catch (_) {}
    write(IDX, read(IDX, []).filter((m) => m.id !== id));
    if (activeId() === id) endActive();
  }

  /* ---- exports ---- */
  const keyPoints = (s) => s.entries.filter((e) => e.starred && e.type !== "verse");
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function toMarkdown(s) {
    const st = stats(s), L = [];
    L.push(`# ${s.title}`, "");
    L.push(`- Date: ${fmtDate(s.start)}`);
    if (s.preacher) L.push(`- Preacher: ${s.preacher}`);
    L.push(`- Length: ${elapsed(st.duration)} (${st.words} words)`, "");
    const verses = s.entries.filter((e) => e.type === "verse");
    if (verses.length) { L.push("## Verses used", ""); verses.forEach((e) => L.push(`- ${e.reference} (${e.translation}) at ${elapsed(e.t - s.start)}`)); L.push(""); }
    const kp = keyPoints(s);
    if (kp.length) { L.push("## Key points", ""); kp.forEach((e) => L.push(`- ${e.text}`)); L.push(""); }
    L.push("## Notes", "");
    for (const e of s.entries) {
      const time = elapsed(e.t - s.start);
      if (e.type === "verse") L.push(`> **${e.reference} (${e.translation})** ${e.text}`, "");
      else if (e.type === "note") L.push(`**My note (${time}):** ${e.text}`, "");
      else L.push(`**${time}** ${e.text}${e.starred ? " ★" : ""}`, "");
    }
    return L.join("\n");
  }

  function toWordHtml(s) {
    const st = stats(s);
    let b = `<h1>${esc(s.title)}</h1><p>${esc(fmtDate(s.start))}${s.preacher ? " | Preacher: " + esc(s.preacher) : ""}<br>Length ${elapsed(st.duration)}, ${st.words} words</p>`;
    const verses = s.entries.filter((e) => e.type === "verse");
    if (verses.length) b += `<h2>Verses used</h2><ul>${verses.map((e) => `<li>${esc(e.reference)} (${esc(e.translation)})</li>`).join("")}</ul>`;
    const kp = keyPoints(s);
    if (kp.length) b += `<h2>Key points</h2><ul>${kp.map((e) => `<li>${esc(e.text)}</li>`).join("")}</ul>`;
    b += "<h2>Notes</h2>";
    for (const e of s.entries) {
      const time = elapsed(e.t - s.start);
      if (e.type === "verse") b += `<blockquote><b>${esc(e.reference)} (${esc(e.translation)})</b> ${esc(e.text)}</blockquote>`;
      else if (e.type === "note") b += `<p><i>My note (${time}):</i> ${esc(e.text)}</p>`;
      else b += `<p><span style="color:#667">${time}</span> ${esc(e.text)}${e.starred ? " ★" : ""}</p>`;
    }
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(s.title)}</title><style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.5}blockquote{border-left:3px solid #4f6cf0;margin-left:0;padding-left:12px;color:#223}h1{font-size:22pt}h2{font-size:15pt}</style></head><body>${b}</body></html>`;
  }

  function download(name, mime, content) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const slug = (t) => (String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service");

  const backupAll = () => ({ app: "verse-screen", version: 1, sessions: list().map((m) => get(m.id)).filter(Boolean) });
  function restore(data) {
    let n = 0;
    if (!data || !Array.isArray(data.sessions)) return 0;
    for (const s of data.sessions) {
      if (s && s.id && Array.isArray(s.entries) && save(s)) n++;
    }
    return n;
  }

  return { IDX, ACTIVE, PREFIX, list, get, save, create, active, activeId, ensureActive, endActive, defaultTitle,
    addSpeech, addVerse, addNote, update, remove, rename, del, stats, elapsed, fmtDate, fmtClock,
    toMarkdown, toWordHtml, download, slug, backupAll, restore };
})();
if (typeof module !== "undefined") module.exports = Store;
