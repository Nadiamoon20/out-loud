/**
 * موتور واقعی — از Claude Opus 5 استفاده می‌کند.
 *
 * تا وقتی ENGINE=mock باشد (پیش‌فرض)، این فایل اصلاً import نمی‌شود —
 * پس نبودِ ANTHROPIC_API_KEY هیچ خطایی ایجاد نمی‌کند. کلید فقط سمت
 * سرور خوانده می‌شود و هیچ‌وقت به مرورگر نمی‌رسد.
 *
 * سه اصل از راهنمای SKILL رعایت شده:
 *  - مدل claude-opus-5، بدون پیشوند تاریخ.
 *  - thinking تنظیم نمی‌شود (روی Opus 5 پیش‌فرض adaptive است)؛ برای
 *    جواب‌های سریع (طرف مقابل، مربی) از effort:"low" استفاده می‌شود
 *    به‌جای خاموش کردن thinking — خاموش کردنش می‌تواند باعث نشتِ
 *    تگ‌های <thinking> در متن قابل‌مشاهده شود.
 *  - بدون prefill و بدون temperature/top_p/top_k — هر سه روی Opus 5
 *    خطای ۴۰۰ می‌دهند.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildPartnerSystemPrompt } from '../prompts/partner.mjs';
import { COACH_SYSTEM_PROMPT, COACH_OUTPUT_SCHEMA, buildCoachUserMessage } from '../prompts/coach.mjs';
import { DEBRIEF_SYSTEM_PROMPT, DEBRIEF_OUTPUT_SCHEMA, buildDebriefUserMessage } from '../prompts/debrief.mjs';

const MODEL = 'claude-opus-5';

let _client = null;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

function toMessages(history) {
  return history.map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.text,
  }));
}

const FALLBACK_LINE_EN = "Sorry, could you say that again? I got a bit distracted for a second.";

/** @param {{scenario?: object, topic?: object, history: Array<{role:string,text:string}>, level: string}} params */
export async function* streamTurn({ scenario, topic, history, level }) {
  const system = buildPartnerSystemPrompt({ scenario, topic, level });
  const messages = toMessages(history);
  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: '(The conversation is about to begin. Say your opening line in character — nothing else.)',
    });
  }

  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    system,
    messages,
  });

  let yielded = false;
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yielded = true;
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (!yielded || final.stop_reason === 'refusal') {
    yield FALLBACK_LINE_EN;
  }
}

/** @param {{userText: string}} params */
export async function coach({ userText }) {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: COACH_OUTPUT_SCHEMA },
    },
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildCoachUserMessage(userText) }],
  });

  if (response.stop_reason === 'refusal') return null;
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return null;

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return null;
  }
  if (!parsed.has_correction) return null;

  return {
    said: parsed.said,
    natural: parsed.natural,
    why_fa: parsed.why_fa,
    why_en: '',
    rule_id: 'claude',
  };
}

/** @param {{scenario?: object, topic?: object, transcript: Array<{role:string,text:string}>}} params */
export async function debrief({ scenario, topic, transcript }) {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      format: { type: 'json_schema', schema: DEBRIEF_OUTPUT_SCHEMA },
    },
    system: DEBRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildDebriefUserMessage({ scenario, topic, transcript }) }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('Claude did not return a debrief — possible refusal.');
  }
  return JSON.parse(textBlock.text);
}
