/**
 * انتخاب موتور بر اساس ENGINE در .env — mock (پیش‌فرض) یا claude.
 *
 * import کردن claude.mjs بی‌خطر است حتی بدون کلید API: آن فایل کلاینت
 * Anthropic را فقط در اولین فراخوانی واقعی می‌سازد، نه در زمان import.
 */
import * as mock from './mock.mjs';
import * as claude from './claude.mjs';

const ENGINES = { mock, claude };

export function getEngine() {
  const mode = (process.env.ENGINE || 'mock').toLowerCase();
  return ENGINES[mode] ?? mock;
}
