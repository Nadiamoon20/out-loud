/**
 * حافظه‌ی محلی — بدون سرور، بدون حساب کاربری.
 *
 * بانک عبارات با سیستم Leitner: هر عبارت در یکی از ۵ جعبه است؛ جعبه‌ی
 * بالاتر یعنی فاصله‌ی مرور بیشتر. عبارت تازه همیشه در جعبه‌ی ۱ است و
 * «الان» سررسید — یعنی همان جلسه‌ی بعدی در مرور ظاهر می‌شود.
 */

const KEY_PHRASES = 'outloud.phrasebank.v1';
const KEY_LEVEL = 'outloud.level.v1';

// فاصله‌ی هر جعبه بر حسب روز — اندیس ۰ استفاده نمی‌شود
const BOX_INTERVAL_DAYS = [0, 0, 2, 5, 12, 28];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage در دسترس نیست (مثلاً حالت خصوصی) — بی‌سروصدا نادیده می‌گیریم
  }
}

export function getLevel() {
  return load(KEY_LEVEL, 'B1');
}

export function setLevel(level) {
  save(KEY_LEVEL, level);
}

function getAllPhrases() {
  return load(KEY_PHRASES, []);
}

function saveAllPhrases(list) {
  save(KEY_PHRASES, list);
}

function makeId(en) {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export function addPhrase({ en, fa, source }) {
  if (!en) return;
  const list = getAllPhrases();
  const id = makeId(en);
  if (!id || list.some((p) => p.id === id)) return;
  list.push({
    id,
    en,
    fa: fa || '',
    source: source || 'session',
    box: 1,
    dueAt: Date.now(),
    addedAt: Date.now(),
  });
  saveAllPhrases(list);
}

/**
 * از خروجی debrief، تصحیح‌ها + ارتقاها + عبارت‌های ازدست‌رفته را به بانک
 * عبارات اضافه می‌کند. تکراری‌ها به‌صورت خودکار رد می‌شوند.
 * @returns {number} تعداد عبارت‌های واقعاً جدید
 */
export function addPhrasesFromDebrief(debrief) {
  const before = getAllPhrases().length;
  for (const c of debrief.corrections || []) {
    addPhrase({ en: c.natural, fa: c.why_fa, source: 'correction' });
  }
  for (const u of debrief.upgrades || []) {
    addPhrase({ en: u.upgraded, fa: u.register, source: 'upgrade' });
  }
  for (const m of debrief.missed_phrases || []) {
    addPhrase({ en: m.phrase, fa: m.when_to_use, source: 'missed' });
  }
  return getAllPhrases().length - before;
}

export function getDuePhrases(limit = 5) {
  const now = Date.now();
  return getAllPhrases()
    .filter((p) => p.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, limit);
}

export function recordReview(id, wasCorrect) {
  const list = getAllPhrases();
  const phrase = list.find((p) => p.id === id);
  if (!phrase) return;
  phrase.box = wasCorrect ? Math.min(phrase.box + 1, BOX_INTERVAL_DAYS.length - 1) : 1;
  const days = BOX_INTERVAL_DAYS[phrase.box];
  phrase.dueAt = Date.now() + days * 24 * 60 * 60 * 1000;
  saveAllPhrases(list);
}
