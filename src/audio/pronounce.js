// Pronunciation dictionary for the Bulgarian announcement voice. Stop names are written the way
// the signs show them (ж.к., бул., ул. 10, НСА ...); a speech engine reads abbreviations letter by
// letter or not at all, so every message is expanded here before it is spoken. The stop data also
// carries a hand-written `speech` form per stop (tools/lines.py); this is the safety net for
// anything else (and for the test buttons). Clips are looked up by the original text.

// \b does not work with Cyrillic in JS regexes: word edges are written as Unicode lookarounds
const W0 = '(?<![\\p{L}\\p{N}])', W1 = '(?![\\p{L}\\p{N}])';
const rx = (s) => new RegExp(W0 + s + W1, 'giu'); // abbreviations: any case (Акад., акад.)
const AC = (s) => new RegExp(W0 + s + W1, 'gu'); // acronyms: capitals only

/** [pattern, spoken form]; order matters (longer forms first). */
const RULES = [
  [rx('ж\\.\\s?к\\.'), 'жилищен комплекс'],
  [rx('в\\.\\s?з\\.'), 'вилна зона'],
  [rx('м-ст'), 'местност'],
  [rx('кв\\.'), 'квартал'],
  [rx('бул\\.'), 'булевард'],
  [rx('ул\\.'), 'улица'],
  [rx('пл\\.'), 'площад'],
  [rx('акад\\.'), 'академик'],
  [rx('проф\\.'), 'професор'],
  [rx('д-р'), 'доктор'],
  [rx('ген\\.'), 'генерал'],
  [rx('св\\.'), 'свети'],
  [AC('Кл\\.'), 'Климент'],
  [AC('СУ'), 'Софийски университет'],
  [AC('НСА'), 'Национална спортна академия'],
  [AC('СК'), 'спортен комплекс'],
  [AC('НСБАЛ'), 'Национална специализирана болница'],
  [AC('УНСС'), 'У Н С С'],
  [AC('ТУ'), 'Технически университет'],
  [AC('ЛТУ'), 'Лесотехнически университет'],
  [AC('АД'), 'а де'],
  [AC('ЕАД'), 'е а де'],
];

const ONES = ['нула', 'едно', 'две', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет', 'десет', 'единадесет', 'дванадесет', 'тринадесет', 'четиринадесет', 'петнадесет', 'шестнадесет', 'седемнадесет', 'осемнадесет', 'деветнадесет'];
const TENS = ['', '', 'двадесет', 'тридесет', 'четиридесет', 'петдесет', 'шестдесет', 'седемдесет', 'осемдесет', 'деветдесет'];

/** Cardinal number in words (0-999), as street numbers are read ("улица десет"). */
export function numberWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` и ${ONES[n % 10]}` : '');
  const h = Math.floor(n / 100), r = n % 100;
  const hw = h === 1 ? 'сто' : h === 2 ? 'двеста' : h === 3 ? 'триста' : `${ONES[h]}стотин`;
  return r ? `${hw}${r < 20 || r % 10 === 0 ? ' и ' : ' '}${numberWords(r)}` : hw;
}

/** Text as the voice should read it. */
export function pronounce(text) {
  let t = String(text || '');
  for (const [re, w] of RULES) t = t.replace(re, w);
  t = t.replace(/[„“”"«»]/g, '').replace(/\s+[–—-]\s+/g, ', ');
  t = t.replace(/(?<![\p{L}\p{N}])(\d{1,3})(?![\p{L}\p{N}])/gu, (m, d) => numberWords(Number(d)));
  return t.replace(/\s{2,}/g, ' ').trim();
}
