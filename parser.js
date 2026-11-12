// Finds Bible references in spoken or typed text.
// Handles: "John 3:16", "Romans chapter eight verse twenty eight", "first Corinthians 13 verses 4 to 7",
// "Psalm twenty three", "Matthew five and verse three", plus common mis-hearings (roman, galations...).

const BOOKS = [
  ["Genesis"], ["Exodus"], ["Leviticus"], ["Numbers"], ["Deuteronomy"], ["Joshua"], ["Judges"], ["Ruth"],
  ["1 Samuel"], ["2 Samuel"], ["1 Kings"], ["2 Kings"], ["1 Chronicles"], ["2 Chronicles"],
  ["Ezra"], ["Nehemiah"], ["Esther"], ["Job"], ["Psalms", "psalm"], ["Proverbs", "proverb"],
  ["Ecclesiastes"], ["Song of Solomon", "song of songs", "songs of solomon"], ["Isaiah", "isiah"], ["Jeremiah"],
  ["Lamentations"], ["Ezekiel", "ezekial"], ["Daniel"], ["Hosea"], ["Joel"], ["Amos"], ["Obadiah"], ["Jonah"],
  ["Micah"], ["Nahum"], ["Habakkuk", "habakuk"], ["Zephaniah"], ["Haggai"], ["Zechariah", "zachariah"], ["Malachi"],
  ["Matthew", "mathew"], ["Mark"], ["Luke"], ["John"], ["Acts"], ["Romans", "roman"],
  ["1 Corinthians", "1 corinthian"], ["2 Corinthians", "2 corinthian"], ["Galatians", "galations"],
  ["Ephesians"], ["Philippians", "phillipians"], ["Colossians", "colosians"],
  ["1 Thessalonians"], ["2 Thessalonians"], ["1 Timothy"], ["2 Timothy"], ["Titus"], ["Philemon"],
  ["Hebrews"], ["James"], ["1 Peter"], ["2 Peter"], ["1 John"], ["2 John"], ["3 John"], ["Jude"],
  ["Revelation", "revelations"],
];

const ALIASES = [];
for (const [canon, ...extra] of BOOKS) {
  for (const n of new Set([canon.toLowerCase(), ...extra])) ALIASES.push([n, canon]);
}
ALIASES.sort((a, b) => b[0].length - a[0].length);   // longest first so "1 john" beats "john"
const ALIAS_MAP = Object.fromEntries(ALIASES);

const U = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11,
  twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
const T = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };

function wordsToDigits(text) {
  const toks = text.split(/\s+/).filter(Boolean);
  const out = [];
  let cur = null;
  const flush = () => { if (cur !== null) { out.push(String(cur)); cur = null; } };
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w in U || w in T) {
      const v = w in U ? U[w] : T[w];
      const joins = cur !== null && (
        (cur >= 100 && cur % 100 === 0 && v < 100) ||
        (cur >= 20 && cur < 100 && cur % 10 === 0 && v < 10));
      if (joins) cur += v; else { flush(); cur = v; }
    } else if (w === "hundred" && cur !== null && cur > 0 && cur < 10) {
      cur *= 100;
    } else if (w === "and" && cur !== null && cur >= 100 && cur % 100 === 0 &&
               (toks[i + 1] in U || toks[i + 1] in T)) {
      // "one hundred and nineteen": skip the "and"
    } else {
      flush(); out.push(w);
    }
  }
  flush();
  return out.join(" ");
}

const NUMBERED = "(samuel|kings|chronicles|corinthians|corinthian|thessalonians|timothy|peter|john)";
function normalize(text) {
  let t = text.toLowerCase().replace(/[,;!?"“”]/g, " ").replace(/\.(?=\s|$)/g, " ");
  t = t.replace(new RegExp(`\\b(first|1st|i)\\s+(?=${NUMBERED}\\b)`, "g"), "1 ");
  t = t.replace(new RegExp(`\\b(second|2nd|ii)\\s+(?=${NUMBERED}\\b)`, "g"), "2 ");
  t = t.replace(/\b(third|3rd|iii)\s+(?=john\b)/g, "3 ");
  return wordsToDigits(t);
}

const NAMES = ALIASES.map(([n]) => n.replace(/ /g, "\\s+")).join("|");
const REF_RE = new RegExp(
  `\\b(${NAMES})\\s*(?:chapter\\s*)?(\\d{1,3})` +
  `(?:\\s*(?:[:.]|and\\s+verses?|verses?)?\\s*(\\d{1,3})(?:\\s*(?:-|–|to|through)\\s*(\\d{1,3}))?)?(?!\\d)`,
  "g"
);

function scanRefs(t) {
  const found = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(t)) !== null) {
    const book = ALIAS_MAP[m[1].replace(/\s+/g, " ")];
    if (!book) continue;
    const [, , ch, v1, v2] = m;
    let ref = `${book} ${ch}`;
    if (v1) ref += `:${v1}` + (v2 && +v2 > +v1 ? `-${v2}` : "");
    found.push({ ref, index: m.index });
  }
  return found;
}

function detectReferences(text) {
  const out = [];
  for (const f of scanRefs(normalize(text))) if (!out.includes(f.ref)) out.push(f.ref);
  return out;
}

/* ---------- spoken commands ---------- */

// "go to John 3:16", "turn with me to Romans 8", "open your Bibles to Psalm 23"
const GO_PREFIX = new RegExp(
  "(?:\\b(?:go|turn|jump|skip|move|flip)\\s+(?:with\\s+me\\s+|us\\s+)?(?:(?:back|down|up|over|forward|ahead)\\s+)?(?:to|in)\\s+(?:the\\s+book\\s+of\\s+)?" +
  "|\\bopen\\s+(?:up\\s+)?(?:your\\s+)?bibles?\\s+(?:with\\s+me\\s+)?(?:to|at|in)\\s+(?:the\\s+book\\s+of\\s+)?" +
  "|\\btake\\s+us\\s+to\\s+(?:the\\s+book\\s+of\\s+)?)$"
);
function detectGoTo(text) {
  const t = normalize(text);
  return scanRefs(t).filter((f) => GO_PREFIX.test(t.slice(Math.max(0, f.index - 50), f.index))).map((f) => f.ref);
}

const REL = "(?:chapter\\s+(\\d{1,3})\\s*(?:and\\s+)?)?verse\\s+(?:number\\s+)?(\\d{1,3})(?:\\s*(?:-|to|through)\\s*(\\d{1,3}))?";
const LEAD = "(?:(?:ok|okay|now|so|and)\\s+)*";
const GO_WORDS = "\\b(?:go|turn|jump|skip|move|flip|read|look)\\s+(?:with\\s+me\\s+|us\\s+)?(?:(?:back|down|up|over|forward|ahead)\\s+)?(?:to\\s+|at\\s+)?(?:the\\s+)?";
const LEAD2 = "(?:(?:ok|okay|now|so|and|then|lets|let's|let|us|we|can|you|please)\\s+)*";
const NUM_GO = new RegExp("^" + LEAD2 +
  "(?:(?:go|come|move|jump|skip|scroll|flip|turn)\\s+(?:(?:back|down|up|over|forward|ahead)\\s+)?(?:to|at)\\s+" +
  "|(?:back|down|up|forward|ahead)\\s+(?:to|at)\\s+)" +
  "(?:verse\\s+(?:number\\s+)?)?(\\d{1,3})(?:\\s*(?:-|to|through)\\s*(\\d{1,3}))?(?:\\s+(?:please|now|again))?$");
const REL_GO = new RegExp(GO_WORDS + REL);
const REL_WHOLE = new RegExp("^" + LEAD + REL + "$");
const CH_GO = new RegExp(GO_WORDS + "chapter\\s+(\\d{1,3})\\b(?!\\s*(?:and\\s+)?verse)");
const CH_WHOLE = new RegExp("^" + LEAD + "chapter\\s+(\\d{1,3})$");
const EXPLICIT = /\b(next|previous|prior)\s+(verse|chapter)\b/g;
const FILLER = new Set(["ok", "okay", "please", "now", "and", "the", "lets", "let's", "let", "us", "go", "to", "one", "1", "again", "so", "then", "just", "can", "you", "we", "amen", "pastor"]);

// whole = true when `text` is one complete spoken phrase (a finished sentence from the speech engine).
// Short phrases like "next" or "back" are only treated as commands when they stand alone.
function detectCommands(text, whole) {
  const t = normalize(text).replace(/[^a-z0-9\s:'\-]/g, " ").replace(/\s+/g, " ").trim();
  const cmds = [];
  for (const m of t.matchAll(EXPLICIT)) {
    cmds.push({ type: "step", nav: m[1] === "next" ? "next" : "prev", unit: m[2], explicit: true });
  }
  let m = REL_GO.exec(t) || (whole && REL_WHOLE.exec(t));
  if (m) cmds.push({ type: "verse", ch: m[1] ? +m[1] : null, v1: +m[2], v2: m[3] ? +m[3] : null });
  else if (whole && (m = NUM_GO.exec(t))) cmds.push({ type: "verse", ch: null, v1: +m[1], v2: m[2] ? +m[2] : null });
  else if ((m = CH_GO.exec(t) || (whole && CH_WHOLE.exec(t)))) cmds.push({ type: "chapter", ch: +m[1] });
  if (whole && !cmds.length) {
    const words = t.split(" ");
    if (words.length <= 6) {
      const core = words.filter((w) => !FILLER.has(w));
      if (core.length === 1) {
        if (["next", "forward", "continue"].includes(core[0])) cmds.push({ type: "step", nav: "next", unit: "verse", explicit: false });
        if (["back", "previous", "prior"].includes(core[0])) cmds.push({ type: "step", nav: "prev", unit: "verse", explicit: false });
      }
    }
  }
  for (const ref of detectGoTo(text)) cmds.push({ type: "ref", ref, explicit: false });
  return cmds;
}

// Turn "go to verse 5" into a full reference, using the verse that is on screen now.
function relativeRef(current, cmd) {
  const m = /^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(current || "");
  if (!m) return null;
  const [, book, ch, v1] = m;
  if (cmd.type === "verse") {
    const c = cmd.ch || ch;
    return `${book} ${c}:${cmd.v1}` + (cmd.v2 && cmd.v2 > cmd.v1 ? `-${cmd.v2}` : "");
  }
  if (cmd.type === "chapter") return `${book} ${cmd.ch}` + (v1 ? ":1" : "");
  return null;
}

/* ---------- spoken translation switch ---------- */
// "give me KJV version", "switch to NIV", "use the new living translation", or just "NIV"
const TR_NAMES = [
  ["nkjv", "new\\s+king\\s+james(?:\\s+version)?|n\\s*k\\s*j\\s*v"],
  ["kjv",  "king\\s+james(?:\\s+version)?|k\\s*j\\s*v"],
  ["niv",  "new\\s+international(?:\\s+version)?|n\\s*i\\s*v"],
  ["nlt",  "new\\s+living(?:\\s+translation)?|n\\s*l\\s*t"],
  ["esv",  "english\\s+standard(?:\\s+version)?|e\\s*s\\s*v"],
  ["nasb", "new\\s+american\\s+standard(?:\\s+bible)?|n\\s*a\\s*s\\s*b"],
  ["amp",  "amplified(?:\\s+bible)?|amp\\s+(?:version|translation|bible)"],
  ["web",  "world\\s+english(?:\\s+bible)?|web\\s+(?:version|translation|bible)"],
];
const TR_TRIGGER = "(?:give\\s+(?:me|us)|switch(?:\\s+over)?\\s+to|change(?:\\s+over)?\\s+to|use|show\\s+(?:me|us)|put\\s+it\\s+in|read\\s+(?:it\\s+)?in|let'?s\\s+use|go\\s+to|move\\s+to|i\\s+want|bring\\s+up)";
const TR_TAIL = "(?:\\s+(?:version|translation|bible))?(?:\\s+(?:please|now))?";

function detectTranslation(text, whole) {
  const t = String(text).toLowerCase().replace(/[^a-z\s']/g, " ").replace(/\s+/g, " ").trim();
  for (const [abbr, names] of TR_NAMES) {
    const named = `(?:the\\s+|a\\s+)?(?:${names})`;
    if (new RegExp(`\\b${TR_TRIGGER}\\s+${named}${TR_TAIL}(?=\\s|$)`).test(t)) return abbr;
    if (whole && new RegExp(`^(?:ok(?:ay)?\\s+|now\\s+)?${named}${TR_TAIL}$`).test(t)) return abbr;
  }
  return null;
}

if (typeof module !== "undefined") module.exports = { detectReferences, detectCommands, detectGoTo, relativeRef, detectTranslation };
