/**
 * انتخاب موتور بر اساس ENGINE در .env — mock (پیش‌فرض)، claude یا openrouter.
 *
 * import کردن claude.mjs/openrouter.mjs بی‌خطر است حتی بدون کلید API: هر دو
 * کلاینت/کلید را فقط در اولین فراخوانی واقعی می‌خوانند، نه در زمان import.
 */
import * as mock from './mock.mjs';
import * as claude from './claude.mjs';
import * as openrouter from './openrouter.mjs';

const ENGINES = { mock, claude, openrouter };

export function getEngine() {
  const mode = (process.env.ENGINE || 'mock').toLowerCase();
  return ENGINES[mode] ?? mock;
}
