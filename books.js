// Shared by the serverless functions: turns "John 3:16" into codes the Bible APIs understand.
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

function parseRef(ref) {
  const m = /^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(String(ref).trim());
  if (!m || !CODES[m[1]]) return null;
  return { book: m[1], code: CODES[m[1]], ch: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null };
}

// API.Bible passage id: JHN.3.16 | JHN.3.16-JHN.3.18 | PSA.23
function usfm(p) {
  if (p.v1 == null) return `${p.code}.${p.ch}`;
  if (p.v2 == null) return `${p.code}.${p.ch}.${p.v1}`;
  return `${p.code}.${p.ch}.${p.v1}-${p.code}.${p.ch}.${p.v2}`;
}

module.exports = { parseRef, usfm };
