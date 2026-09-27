// Uzbek Latin ⇄ Cyrillic. All text in the app is written in Latin and converted for Cyrillic readers.

const APOSTROPHES = "'ʻʼ‘’`";
const apostrophe = `[${APOSTROPHES}]`;

const LATIN_DIGRAPHS: [RegExp, string][] = [
  [new RegExp(`o${apostrophe}`, "gi"), "ў"],
  [new RegExp(`g${apostrophe}`, "gi"), "ғ"],
  [/sh/gi, "ш"],
  [/ch/gi, "ч"],
  [/yo/gi, "ё"],
  [/yu/gi, "ю"],
  [/ya/gi, "я"],
  [/ye/gi, "е"],
];

const LATIN_LETTERS: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л",
  m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х",
  y: "й", z: "з",
};

const isUpper = (text: string) => text !== text.toLowerCase();

function matchCase(source: string, target: string): string {
  if (!isUpper(source[0]!)) return target;
  // "SH" → "Ш", "Sh" → "Ш", "SHAHAR" handled per match
  return target.toUpperCase();
}

export function toCyrillic(text: string): string {
  // Leave URLs, @usernames and e-mail-like tokens untouched.
  return text.replace(/(https?:\/\/\S+|@\w+|\S+@\S+)|([^\s]+)/g, (_match, keep: string | undefined, word: string) =>
    keep ?? convertWord(word),
  );
}

function convertWord(word: string): string {
  let result = word;
  // "e" at the start of a word (or after a vowel) is "э".
  result = result.replace(/(^|[aeiouAEIOU])([eE])/g, (_m, before: string, e: string) => `${before}${e === "E" ? "Э" : "э"}`);
  for (const [pattern, cyrillic] of LATIN_DIGRAPHS) {
    result = result.replace(pattern, (match) => matchCase(match, cyrillic));
  }
  result = result.replace(new RegExp(apostrophe, "g"), "ъ");
  return [...result]
    .map((char) => {
      const lower = LATIN_LETTERS[char.toLowerCase()];
      if (!lower) return char;
      return isUpper(char) ? lower.toUpperCase() : lower;
    })
    .join("");
}

const CYRILLIC_LETTERS: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'",
  ҳ: "h",
};

export function toLatin(text: string): string {
  return [...text]
    .map((char) => {
      const latin = CYRILLIC_LETTERS[char.toLowerCase()];
      if (latin === undefined) return char;
      return isUpper(char) ? latin.charAt(0).toUpperCase() + latin.slice(1) : latin;
    })
    .join("");
}

/** Lowercase Latin without apostrophes, so "Ko'k", "KOʻK" and "Кўк" all compare equal. */
export function searchKey(text: string): string {
  return toLatin(text)
    .toLowerCase()
    .replace(new RegExp(apostrophe, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}
