/**
 * لایه‌ی گفتار — تشخیص گفتار (STT) و خواندن متن (TTS) بومی مرورگر.
 * اگر مرورگر پشتیبانی نکند، sttAvailable=false می‌شود و رابط کاربری
 * باید به‌جایش فقط ورودی متنی نشان دهد — که همیشه در دسترس است.
 */

const SpeechRecognitionCtor =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const sttAvailable = !!SpeechRecognitionCtor;
export const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

let recognition = null;
let listening = false;

/**
 * شروع گوش دادن (push-to-talk). با pointerup باید stopListening صدا زده شود.
 * @returns {boolean} آیا شروع شد
 */
export function startListening({ onInterim, onFinal, onEnd, onError } = {}) {
  if (!sttAvailable || listening) return false;

  recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  let finalText = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (interim) onInterim?.(interim);
  };

  recognition.onerror = (event) => {
    onError?.(event.error);
  };

  recognition.onend = () => {
    listening = false;
    const text = finalText.trim();
    if (text) onFinal?.(text);
    onEnd?.();
  };

  try {
    recognition.start();
    listening = true;
    return true;
  } catch {
    listening = false;
    return false;
  }
}

export function stopListening() {
  if (recognition && listening) {
    recognition.stop();
  }
}

export function isListening() {
  return listening;
}

// ─────────────────────────────────────────────────────────────

let voicesPromise = null;
function loadVoices() {
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const existing = speechSynthesis.getVoices();
    if (existing.length) {
      resolve(existing);
      return;
    }
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    // بعضی مرورگرها هیچ‌وقت این رویداد را شلیک نمی‌کنند — یک سقف زمانی
    setTimeout(() => resolve(speechSynthesis.getVoices()), 800);
  });
  return voicesPromise;
}

const RATE_BY_LEVEL = { A2: 0.82, B1: 0.9, B2: 0.98, C1: 1.05 };

export async function speak(text, { level = 'B1' } = {}) {
  if (!ttsAvailable || !text?.trim()) return;
  const voices = await loadVoices();
  const voice =
    voices.find((v) => /en-US|en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'en-US';
  utterance.rate = RATE_BY_LEVEL[level] ?? 0.9;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (ttsAvailable) speechSynthesis.cancel();
}
