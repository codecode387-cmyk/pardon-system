// Finds Bible references in spoken or typed text.
// Handles: "John 3:16", "Romans chapter eight verse twenty eight", "first Corinthians 13 verses 4 to 7", "Psalm twenty three"

const BOOKS = [
  ["Genesis"], ["Exodus"], ["Leviticus"], ["Numbers"], ["Deuteronomy"], ["Joshua"], ["Judges"], ["Ruth"],
  ["1 Samuel"], ["2 Samuel"], ["1 Kings"], ["2 Kings"], ["1 Chronicles"], ["2 Chronicles"],
  ["Ezra"], ["Nehemiah"], ["Esther"], ["Job"], ["Psalms", "psalm", "psalms"], ["Proverbs"],
  ["Ecclesiastes"], ["Song of Solomon", "song of songs", "song of solomon"], ["Isaiah"], ["Jeremiah"],
  ["Lamentations"], ["Ezekiel"], ["Daniel"], ["Hosea"], ["Joel"], ["Amos"], ["Obadiah"], ["Jonah"],
  ["Micah"], ["Nahum"], ["Habakkuk"], ["Zephaniah"], ["Haggai"], ["Zechariah"], ["Malachi"],
  ["Matthew"], ["Mark"], ["Luke"], ["John"], ["Acts"], ["Romans"],
  ["1 Corinthians"], ["2 Corinthians"], ["Galatians"], ["Ephesians"], ["Philippians"], ["Colossians"],
  ["1 Thessalonians"], ["2 Thessalonians"], ["1 Timothy"], ["2 Timothy"], ["Titus"], ["Philemon"],
  ["Hebrews"], ["James"], ["1 Peter"], ["2 Peter"], ["1 John"], ["2 John"], ["3 John"], ["Jude"],
  ["Revelation", "revelation", "revelations"],
];

const ALIASES = [];
for (const [canon, ...extra] of BOOKS) {
  const names = new Set([canon.toLowerCase(), ...extra]);
  for (const n of names) ALIASES.push([n, canon]);
}
ALIASES.sort((a, b) => b[0].length - a[0].length);
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

function normalize(text) {
  let t = text.toLowerCase().replace(/[,;!?"“”]/g, " ").replace(/\.(?=\s|$)/g, " ");
  t = t.replace(/\b(first|1st)\s+(?=(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)\b)/g, "1 ");
  t = t.replace(/\b(second|2nd)\s+(?=(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john)\b)/g, "2 ");
  t = t.replace(/\b(third|3rd)\s+(?=john\b)/g, "3 ");
  return wordsToDigits(t);
}

const NAMES = ALIASES.map(([n]) => n.replace(/ /g, "\\s+")).join("|");
const REF_RE = new RegExp(
  `\\b(${NAMES})\\s*(?:chapter\\s*)?(\\d{1,3})(?:\\s*(?:[:.]|verses?)?\\s*(\\d{1,3})(?:\\s*(?:-|–|to|through)\\s*(\\d{1,3}))?)?(?!\\d)`,
  "g"
);

function detectReferences(text) {
  const t = normalize(text);
  const found = [];
  let m;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(t)) !== null) {
    const book = ALIAS_MAP[m[1].replace(/\s+/g, " ")];
    if (!book) continue;
    const [, , ch, v1, v2] = m;
    let ref = `${book} ${ch}`;
    if (v1) ref += `:${v1}` + (v2 && +v2 > +v1 ? `-${v2}` : "");
    found.push(ref);
  }
  return found;
}

if (typeof module !== "undefined") module.exports = { detectReferences };
