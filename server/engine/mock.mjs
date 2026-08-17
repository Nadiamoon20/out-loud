/**
 * موتور mock — بدون هیچ کلید API کار می‌کند.
 *
 * سه چیز اینجا شبیه‌سازی می‌شود:
 *  ۱. streamTurn   جواب طرف مقابل — از mock_replies سناریو یا follow_ups موضوع می‌آید،
 *                  با تأخیر کلمه‌به‌کلمه پخش می‌شود تا حس واقعی جریان مکالمه را بدهد.
 *  ۲. coach        تصحیح فوریِ قانون‌محور — یک فهرست از خطاهای رایج زبان‌آموزان
 *                  فارسی‌زبان (انتقال از فارسی: حذف حرف تعریف، «I am agree»، …).
 *                  این یک الگوریتم واقعی است، نه شبیه‌سازی هوش مصنوعی جعلی.
 *  ۳. debrief      آمار پایان جلسه از روی خودِ متن گفت‌وگو محاسبه می‌شود:
 *                  سهم حرف زدن، عبارت‌های هدف که گفته/نگفته شده، سطح تخمینی.
 */

const WORD_DELAY_MS = 55;

// ─────────────────────────────────────────────────────────────
// ۱. جریان مکالمه
// ─────────────────────────────────────────────────────────────

function pickReply({ scenario, topic, turnIndex }) {
  if (scenario) {
    const pool = scenario.mock_replies;
    if (turnIndex === 0) return scenario.opening_line_en;
    return pool[(turnIndex - 1) % pool.length];
  }
  // موضوع آزاد: اول opening، بعد از follow_ups به ترتیب، بعد چرخشی
  const pool = topic.follow_ups_en;
  if (turnIndex === 0) return topic.opening_en;
  return pool[(turnIndex - 1) % pool.length];
}

/** @param {{scenario?: object, topic?: object, history: Array}} params */
export async function* streamTurn({ scenario, topic, history }) {
  const turnIndex = history.filter((h) => h.role === 'partner').length;
  const reply = pickReply({ scenario, topic, turnIndex });
  const words = reply.split(' ');
  for (let i = 0; i < words.length; i++) {
    await new Promise((r) => setTimeout(r, WORD_DELAY_MS));
    yield (i === 0 ? '' : ' ') + words[i];
  }
}

// ─────────────────────────────────────────────────────────────
// ۲. تصحیح فوری — خطاهای رایج انتقال از فارسی به انگلیسی
// ─────────────────────────────────────────────────────────────

const CORRECTION_RULES = [
  {
    id: 'am-agree',
    test: /\bi\s*am\s*agree\b/i,
    said: 'I am agree',
    natural: 'I agree',
    why_fa: 'در انگلیسی «agree» خودش فعل است — نیازی به «am» نیست.',
    why_en: '"Agree" is already a verb — no "am" is needed before it.',
  },
  {
    id: 'explain-about',
    test: /\bexplain\s+about\b/i,
    said: 'explain about',
    natural: 'explain',
    why_fa: '«explain» خودش «درباره‌ی» را در خودش دارد؛ «about» اضافه است.',
    why_en: '"Explain" already means "explain about" — drop the "about".',
  },
  {
    id: 'discuss-about',
    test: /\bdiscuss\s+about\b/i,
    said: 'discuss about',
    natural: 'discuss',
    why_fa: '«discuss» فعل متعدی است و «about» نمی‌خواهد.',
    why_en: '"Discuss" is transitive — it doesn\'t take "about".',
  },
  {
    id: 'informations',
    test: /\binformations\b/i,
    said: 'informations',
    natural: 'information',
    why_fa: '«information» در انگلیسی جمع بسته نمی‌شود.',
    why_en: '"Information" is uncountable — it has no plural form.',
  },
  {
    id: 'advices',
    test: /\badvices\b/i,
    said: 'advices',
    natural: 'advice',
    why_fa: '«advice» هم جمع بسته نمی‌شود؛ برای جمع می‌گویی «pieces of advice».',
    why_en: '"Advice" is uncountable too — say "some advice" or "a piece of advice".',
  },
  {
    id: 'peoples',
    test: /\bpeoples\b/i,
    said: 'peoples',
    natural: 'people',
    why_fa: '«people» خودش جمع است.',
    why_en: '"People" is already plural.',
  },
  {
    id: 'age-have',
    test: /\bi\s*have\s*\d+\s*years?(\s*old)?\b/i,
    said: 'I have __ years',
    natural: "I am __ years old",
    why_fa: 'برای سن در انگلیسی از فعل «to be» استفاده می‌شود، نه «have».',
    why_en: 'English uses "to be" for age, not "to have".',
  },
  {
    id: 'depends-to',
    test: /\bdepends?\s+to\b/i,
    said: 'depends to',
    natural: 'depends on',
    why_fa: 'حرف اضافه‌ی درست بعد از «depend»، «on» است.',
    why_en: 'The correct preposition after "depend" is "on".',
  },
  {
    id: 'married-with',
    test: /\bmarried\s+with\b/i,
    said: 'married with',
    natural: 'married to',
    why_fa: '«married» با «to» می‌آید، نه «with».',
    why_en: '"Married" pairs with "to", not "with".',
  },
  {
    id: 'take-decision',
    test: /\btake\s+a\s+decision\b/i,
    said: 'take a decision',
    natural: 'make a decision',
    why_fa: 'در انگلیسی تصمیم را «می‌سازند» (make)، نه «می‌گیرند» (take).',
    why_en: 'In English you "make" a decision, not "take" one.',
  },
  {
    id: 'want-bare-verb',
    test: /\bwant\s+(?:know|go|do|see|tell|say|talk|come|leave|start|finish)\b/i,
    said: 'want __',
    natural: 'want to __',
    why_fa: 'بعد از «want» باید «to» بیاید: want to know.',
    why_en: '"Want" needs "to" before the next verb.',
  },
  {
    id: 'since-duration',
    test: /\bsince\s+(?:one|two|three|four|five|six|\d+)\s+(?:day|week|month|year)s?\b/i,
    said: 'since __ (a length of time)',
    natural: 'for __',
    why_fa: 'برای طول مدت از «for» استفاده می‌شود؛ «since» فقط با نقطه‌ی شروع می‌آید.',
    why_en: '"For" is used for a duration; "since" only for a starting point.',
  },
];

/** @param {{userText: string}} params */
export async function coach({ userText }) {
  for (const rule of CORRECTION_RULES) {
    if (rule.test.test(userText)) {
      return {
        said: rule.said,
        natural: rule.natural,
        why_fa: rule.why_fa,
        why_en: rule.why_en,
        rule_id: rule.id,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// ۳. جمع‌بندی پایان جلسه
// ─────────────────────────────────────────────────────────────

const UPGRADE_POOL = [
  { trigger: /\bvery good\b/i, b1: 'very good', upgraded: 'outstanding', register: 'رسمی‌تر و مطمئن‌تر' },
  { trigger: /\bvery important\b/i, b1: 'very important', upgraded: 'crucial', register: 'رسمی‌تر و مطمئن‌تر' },
  { trigger: /\bi think\b/i, b1: 'I think', upgraded: "I'd say", register: 'محاوره‌ای و طبیعی‌تر' },
  { trigger: /\ba lot of\b/i, b1: 'a lot of', upgraded: 'plenty of', register: 'کمی رسمی‌تر' },
  { trigger: /\bbig problem\b/i, b1: 'big problem', upgraded: 'major issue', register: 'حرفه‌ای‌تر' },
  { trigger: /\bi want\b/i, b1: 'I want', upgraded: "I'd like", register: 'مؤدبانه‌تر' },
];

function countWords(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

function estimateLevel(userTurns) {
  const words = userTurns.flatMap((t) => (t.match(/\S+/g) || []).map((w) => w.toLowerCase()));
  if (words.length === 0) return 'B1';
  const avgPerTurn = words.length / userTurns.length;
  const uniqueRatio = new Set(words).size / words.length;
  const score = avgPerTurn * 0.6 + uniqueRatio * 20;
  if (score < 8) return 'B1';
  if (score < 13) return 'B2';
  return 'C1';
}

/** @param {{scenario?: object, topic?: object, transcript: Array<{role: string, text: string}>}} params */
export async function debrief({ scenario, topic, transcript }) {
  const userTurns = transcript.filter((t) => t.role === 'user').map((t) => t.text);
  const partnerTurns = transcript.filter((t) => t.role === 'partner').map((t) => t.text);
  const userWords = userTurns.reduce((n, t) => n + countWords(t), 0);
  const partnerWords = partnerTurns.reduce((n, t) => n + countWords(t), 0);
  const totalWords = userWords + partnerWords;
  const talk_time_percent = totalWords === 0 ? 0 : Math.round((userWords / totalWords) * 100);

  const fullUserText = userTurns.join(' ');

  // تصحیح‌ها: همان قانون‌ها را روی کل گفته‌های کاربر اجرا می‌کنیم، بدون تکرار قانون
  const seenRules = new Set();
  const corrections = [];
  for (const turn of userTurns) {
    for (const rule of CORRECTION_RULES) {
      if (corrections.length >= 5) break;
      if (seenRules.has(rule.id)) continue;
      if (rule.test.test(turn)) {
        seenRules.add(rule.id);
        corrections.push({
          said: rule.said,
          natural: rule.natural,
          why_fa: rule.why_fa,
          why_en: rule.why_en,
        });
      }
    }
  }

  const upgrades = UPGRADE_POOL.filter((u) => u.trigger.test(fullUserText))
    .slice(0, 3)
    .map(({ b1, upgraded, register }) => ({ b1, upgraded, register }));

  let goal_achieved = null;
  let missed_phrases = [];
  if (scenario) {
    // «...» یا «؟» انتهای عبارت‌های هدف را قبل از مقایسه حذف می‌کنیم — کاربر
    // معمولاً جمله را ادامه می‌دهد («for you after this project?»)، پس تطبیقِ
    // زیررشته‌ای دقیق با علامت انتهایی هرگز نباید شرط باشد.
    const normalize = (s) => s.toLowerCase().replace(/[.?…]+$/, '').trim();
    const targetHits = scenario.target_phrases.filter((p) =>
      fullUserText.toLowerCase().includes(normalize(p.en))
    );
    goal_achieved = {
      value: targetHits.length >= 1 && userTurns.length >= 3,
      reason_fa:
        targetHits.length >= 1 && userTurns.length >= 3
          ? 'گفت‌وگو را تا نتیجه پیش بردی و از عبارت‌های هدف استفاده کردی.'
          : 'گفت‌وگو کوتاه بود یا از عبارت‌های هدف استفاده نشد — یک بار دیگر امتحان کن.',
    };
    missed_phrases = scenario.target_phrases
      .filter((p) => !targetHits.includes(p))
      .slice(0, 2)
      .map((p) => ({ phrase: p.en, when_to_use: p.fa }));
  } else {
    goal_achieved = { value: true, reason_fa: 'گفت‌وگوی آزاد بود — هدف مشخصی برای رسیدن وجود نداشت.' };
  }

  const did_well =
    userTurns.find((t) => countWords(t) >= 7 && !CORRECTION_RULES.some((r) => r.test.test(t))) ||
    userTurns.find((t) => countWords(t) >= 4) ||
    null;

  return {
    goal_achieved,
    talk_time_percent,
    corrections,
    upgrades,
    missed_phrases,
    did_well,
    level_estimate: estimateLevel(userTurns.length ? userTurns : ['']),
  };
}
