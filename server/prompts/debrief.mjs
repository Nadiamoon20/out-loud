/**
 * پرامپت و اسکیمای «جمع‌بندی پایان جلسه».
 *
 * خروجی این بخش، بارِ احساسیِ اصلی محصول است — باید صادق، مشخص و
 * دلگرم‌کننده باشد، نه تعریف‌های کلی. did_well همیشه یک جمله‌ی واقعی از
 * خودِ کاربر است، نه تعارف.
 */

export const DEBRIEF_SYSTEM_PROMPT = `You are analyzing a completed English speaking-practice conversation between a learner and an AI partner, to produce structured feedback for the learner.

Be specific and evidence-based — every claim must point to something actually said in the transcript. Never give generic praise like "great job" — did_well must quote or closely paraphrase one real sentence the learner said that worked well.

Corrections and upgrades:
- corrections: real grammar/usage errors the learner made, with the natural fix and a one-sentence Persian explanation (mention Persian-to-English transfer patterns when relevant — e.g. no articles in Persian, different preposition use). Max 5, only real errors.
- upgrades: sentences that were grammatically fine but simple (B1-level) — show a more natural or higher-register way a fluent speaker would say the same thing. Max 3.
- missed_phrases: from the scenario's target phrases (if any), which ones never came up naturally, and when they'd have fit.
- goal_achieved: for scenario mode, did the learner actually accomplish the stated goal? Judge from the transcript, not from effort. For free-talk topics with no goal, always true with a note that it was open conversation.
- level_estimate: an honest CEFR band (A2/B1/B2/C1) based on vocabulary range, sentence complexity, and error frequency in this session.

Write all why_fa and reason_fa fields in Persian, aimed at a Persian-speaking adult learner. Write said/natural/upgraded fields in English.`;

export const DEBRIEF_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    goal_achieved: {
      type: 'object',
      properties: {
        value: { type: 'boolean' },
        reason_fa: { type: 'string' },
      },
      required: ['value', 'reason_fa'],
      additionalProperties: false,
    },
    talk_time_percent: { type: 'integer', minimum: 0, maximum: 100 },
    corrections: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          said: { type: 'string' },
          natural: { type: 'string' },
          why_fa: { type: 'string' },
        },
        required: ['said', 'natural', 'why_fa'],
        additionalProperties: false,
      },
    },
    upgrades: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          b1: { type: 'string' },
          upgraded: { type: 'string' },
          register: { type: 'string', description: 'Persian: چطور این نسخه فرق می‌کند (رسمی‌تر، طبیعی‌تر، ...)' },
        },
        required: ['b1', 'upgraded', 'register'],
        additionalProperties: false,
      },
    },
    missed_phrases: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          phrase: { type: 'string' },
          when_to_use: { type: 'string', description: 'Persian' },
        },
        required: ['phrase', 'when_to_use'],
        additionalProperties: false,
      },
    },
    did_well: { type: 'string', description: 'A real sentence or close paraphrase from the learner, in English' },
    level_estimate: { type: 'string', enum: ['A2', 'B1', 'B2', 'C1'] },
  },
  required: [
    'goal_achieved',
    'talk_time_percent',
    'corrections',
    'upgrades',
    'missed_phrases',
    'did_well',
    'level_estimate',
  ],
  additionalProperties: false,
};

export function buildDebriefUserMessage({ scenario, topic, transcript }) {
  const context = scenario
    ? `Scenario: ${scenario.title_en}\nLearner's goal: ${scenario.goal_en}\nTarget phrases: ${scenario.target_phrases.map((p) => p.en).join(', ')}`
    : `Free-talk topic: ${topic.title_en} (no specific goal — open conversation)`;

  const lines = transcript.map((t) => `${t.role === 'user' ? 'Learner' : 'Partner'}: ${t.text}`).join('\n');

  return `${context}\n\nTranscript:\n${lines}`;
}
