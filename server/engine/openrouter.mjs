/**
 * موتور رایگان — از یک مدل «:free» روی OpenRouter استفاده می‌کند، بدون
 * نیاز به کلید Anthropic. سقف رایگان OpenRouter محدود است (چیزی حدود
 * ۲۰۰ درخواست در روز روی حساب بدون شارژ) و فهرست مدل‌های رایگان با زمان
 * عوض می‌شود — اگر OPENROUTER_MODEL فعلی دیگر در دسترس نبود، مدل «free»ی
 * تازه را از https://openrouter.ai/models?max_price=0 انتخاب و در .env
 * جایگزین کن؛ هیچ کد دیگری لازم نیست عوض شود.
 *
 * برخلاف claude.mjs (که مستقیم از Anthropic SDK/فرمت Messages استفاده
 * می‌کند)، OpenRouter فرمت سازگار با OpenAI (`/chat/completions`) دارد —
 * برای همین این فایل با fetch خام کار می‌کند، نه با @anthropic-ai/sdk.
 */
import { buildPartnerSystemPrompt } from '../prompts/partner.mjs';
import { COACH_SYSTEM_PROMPT, COACH_OUTPUT_SCHEMA, buildCoachUserMessage } from '../prompts/coach.mjs';
import { DEBRIEF_SYSTEM_PROMPT, DEBRIEF_OUTPUT_SCHEMA, buildDebriefUserMessage } from '../prompts/debrief.mjs';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

function model() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY تنظیم نشده — آن را در .env بگذار.');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:5173',
    'X-Title': 'Out Loud',
  };
}

function toMessages(history) {
  return history.map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.text,
  }));
}

/** پرانتزهای ```json ... ``` را در صورت وجود حذف می‌کند — بعضی مدل‌های رایگان حتی با json_schema هم گاهی این‌طور برمی‌گردانند. */
function stripCodeFence(text) {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : text;
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

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: model(),
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok || !res.body) {
    yield FALLBACK_LINE_EN;
    return;
  }

  let yielded = false;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.startsWith('data: ') ? line.slice(6).trim() : '';
      if (!data || data === '[DONE]') continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) {
        yielded = true;
        yield delta;
      }
    }
  }
  if (!yielded) yield FALLBACK_LINE_EN;
}

async function jsonSchemaCompletion({ system, userMessage, schemaName, schema, maxTokens }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(stripCodeFence(content));
  } catch {
    return null;
  }
}

/** @param {{userText: string}} params */
export async function coach({ userText }) {
  const parsed = await jsonSchemaCompletion({
    system: COACH_SYSTEM_PROMPT,
    userMessage: buildCoachUserMessage(userText),
    schemaName: 'coach_correction',
    schema: COACH_OUTPUT_SCHEMA,
    maxTokens: 1024,
  });
  if (!parsed || !parsed.has_correction) return null;

  return {
    said: parsed.said,
    natural: parsed.natural,
    why_fa: parsed.why_fa,
    why_en: '',
    rule_id: 'openrouter',
  };
}

/** @param {{scenario?: object, topic?: object, transcript: Array<{role:string,text:string}>}} params */
export async function debrief({ scenario, topic, transcript }) {
  const parsed = await jsonSchemaCompletion({
    system: DEBRIEF_SYSTEM_PROMPT,
    userMessage: buildDebriefUserMessage({ scenario, topic, transcript }),
    schemaName: 'session_debrief',
    schema: DEBRIEF_OUTPUT_SCHEMA,
    maxTokens: 16000,
  });
  if (!parsed) throw new Error('OpenRouter did not return a valid debrief JSON.');
  return parsed;
}
