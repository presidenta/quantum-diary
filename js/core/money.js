/* Деньги: категории, разбор сказанного вслух и подсчёты.

   Здесь нет ни DOM, ни запросов — только правила. Поэтому всё проверяется
   обычными тестами, без браузера. */

/* КАТЕГОРИИ — ЗАКРЫТЫЙ СПИСОК, а не вольный текст. Иначе «еда», «Еда» и
   «едa» с латинской «a» станут тремя разными статьями, и месяц не сойдётся.

   Ключ хранится в записи, название переводится — как и везде в приложении.
   Цвета взяты из палитры сфер: те девять уже проверены на различимость при
   дальтонизме, и заводить рядом вторую палитру незачем. */
export const CATEGORIES = [
  { key: 'food',      nameKey: 'money.cat.food',      colorVar: '--s2' },
  { key: 'home',      nameKey: 'money.cat.home',      colorVar: '--s4' },
  { key: 'transport', nameKey: 'money.cat.transport', colorVar: '--s1' },
  { key: 'health',    nameKey: 'money.cat.health',    colorVar: '--s5' },
  { key: 'joy',       nameKey: 'money.cat.joy',       colorVar: '--s7' },
  { key: 'growth',    nameKey: 'money.cat.growth',    colorVar: '--s3' },
  { key: 'gifts',     nameKey: 'money.cat.gifts',     colorVar: '--s9' },
  { key: 'work',      nameKey: 'money.cat.work',      colorVar: '--s6' },
  { key: 'other',     nameKey: 'money.cat.other',     colorVar: '--s8' }
];

export const categoryOf = key => CATEGORIES.find(c => c.key === key) || CATEGORIES.at(-1);

/* ПРАВИЛА «СЛОВО → КАТЕГОРИЯ». Мысль взята у готового трекера
   (pippodima/expense-tracker-web, MIT): человек говорит «кофе», а не «еда».
   Список нарочно короткий и из обиходных слов — он подсказка, а не словарь:
   не угадали, категорию легко поменять руками.

   Слова даны корнями и на двух языках: приложение трёхъязычное, и диктовать
   люди будут на своём. */
const RULES = [
  ['food', ['кофе', 'обед', 'ужин', 'завтрак', 'продукт', 'еда', 'кафе', 'ресторан', 'хлеб', 'молок', 'магазин', 'їжа', 'кава', 'обід', 'вечер']],
  ['transport', ['такси', 'метро', 'автобус', 'бензин', 'заправк', 'билет', 'проезд', 'таксі', 'квиток', 'пальне']],
  ['home', ['квартир', 'аренд', 'коммуналь', 'свет', 'газ', 'вода', 'интернет', 'ремонт', 'оренд', 'світло', 'інтернет']],
  ['health', ['аптек', 'врач', 'лекарств', 'анализ', 'зуб', 'ліки', 'лікар']],
  ['joy', ['кино', 'театр', 'концерт', 'отдых', 'путешеств', 'бар', 'кіно', 'відпочин', 'подорож']],
  ['growth', ['курс', 'книг', 'обучен', 'тренинг', 'школ', 'навчан', 'тренінг']],
  ['gifts', ['подар', 'цвет', 'праздник', 'подарун', 'квіт', 'свято']],
  ['work', ['зарплат', 'гонорар', 'проект', 'проєкт', 'клиент', 'клієнт', 'оплат']]
];

/* Что считать приходом. Слова проверяются по корню: «пришло», «пришла»,
   «получил», «получила» — одно и то же действие. */
const INCOME_WORDS = ['пришл', 'получ', 'доход', 'заработа', 'зарплат', 'гонорар', 'продал', 'надійш', 'отрима', 'заробі'];

/* Слова, которые не несут смысла в заметке: само действие и предлоги.
   Множеством, а не строкой через | — так видно, что это перечень. */
const SERVICE_WORDS = new Set([
  'потратил', 'потратила', 'заплатил', 'заплатила', 'купил', 'купила',
  'пришло', 'пришла', 'получил', 'получила', 'заработал', 'заработала',
  'на', 'за', 'в', 'из', 'по', 'и',
  'витратив', 'витратила', 'сплатив', 'сплатила', 'купив', 'отримав', 'отримала', 'надійшло'
]);

export function guessCategory(text, kind = 'expense') {
  const low = String(text).toLowerCase();
  for (const [key, words] of RULES) {
    if (words.some(w => low.includes(w))) return key;
  }
  // Приход без распознанного слова — это чаще всего работа, а не «прочее»
  return kind === 'income' ? 'work' : 'other';
}

/* Число в сказанном: разряды пробелами, копейки после запятой или точки.
   Одно выражение на два места — разбор суммы и очистку заметки, чтобы они
   не разошлись. */
const NUMBER_RE = /(\d[\d\s ]*)([.,](\d{1,2}))?/;

/* СУММА ИЗ СКАЗАННОГО.

   Распознаватель речи возвращает цифры по-разному: «500», «1 500», «1500,50».
   Пробелы внутри числа — разряды, запятая — копейки. Берём ПЕРВОЕ число:
   «потратил 500 на 2 кофе» — это пятьсот, а не два. */
export function parseAmount(text) {
  const match = String(text).match(NUMBER_RE);
  if (!match) return null;
  const whole = Number(match[1].replace(/[\s ]/g, ''));
  if (!Number.isFinite(whole)) return null;
  const cents = match[3] ? Number(match[3].padEnd(2, '0')) : 0;
  const total = whole * 100 + cents;
  return total > 0 ? total : null;
}

/* Разбор фразы целиком: «Потратил 500 на кофе» → расход 500,00, еда.

   Заметкой остаётся сама фраза без суммы и служебных слов — человек потом
   поймёт, за что платил, лучше любой категории. */
export function parseSpoken(text, { defaultCurrency = 'UAH' } = {}) {
  const amount = parseAmount(text);
  if (!amount) return null;

  const low = String(text).toLowerCase();
  const kind = INCOME_WORDS.some(w => low.includes(w)) ? 'income' : 'expense';
  const category = guessCategory(text, kind);

  /* Служебные слова убираем разбором на слова, а не выражением с границей \b:
     она считается по латинице, и у кириллицы её попросту нет — «потратил»
     оставалось в заметке целиком. Это поймал тест. */
  const note = String(text)
    .replace(NUMBER_RE, ' ')
    .split(/\s+/)
    .filter(word => word && !SERVICE_WORDS.has(word.toLowerCase().replace(/[.,!?]+$/, '')))
    .join(' ')
    .trim();

  return { kind, amount, category, currency: defaultCurrency, note: note || null };
}

/* ---------- Подсчёты ---------- */

export const sumOf = (records, kind) => records
  .filter(r => !r.deletedAt && r.kind === kind)
  .reduce((total, r) => total + r.amount, 0);

/* Итоги по категориям, от большего к меньшему: первым идёт то, на что
   уходит больше всего. */
export function byCategory(records, kind = 'expense') {
  const totals = new Map();
  for (const r of records) {
    if (r.deletedAt || r.kind !== kind) continue;
    totals.set(r.category, (totals.get(r.category) || 0) + r.amount);
  }
  return [...totals.entries()]
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// Копейки → строка для глаза: 150050 → «1 500,50» (пробел неразрывный)
export function money(cents) {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${whole},${String(abs % 100).padStart(2, '0')}`;
}
