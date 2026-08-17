import * as store from './lib/store.mjs';
import { Ribbon } from './lib/ribbon.mjs';
import * as speech from './lib/speech.mjs';

// ─────────────────────────────────────────────────────────────
// مراجع DOM
// ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const screens = {
  picker: $('screen-picker'),
  session: $('screen-session'),
  debrief: $('screen-debrief'),
};

const el = {
  levelSelect: $('level-select'),
  warmupSection: $('warmup-section'),
  warmupCount: $('warmup-count'),
  warmupCards: $('warmup-cards'),
  warmupSkip: $('warmup-skip'),
  tabs: document.querySelectorAll('.lib-tab'),
  panels: document.querySelectorAll('.lib-panel'),
  gridProfessional: $('grid-professional'),
  gridEveryday: $('grid-everyday'),
  gridTopics: $('grid-topics'),

  btnLeaveSession: $('btn-leave-session'),
  sessionTitleEn: $('session-title-en'),
  sessionTitleFa: $('session-title-fa'),
  liveCorrectCheckbox: $('live-correct-checkbox'),

  sessionBrief: $('session-brief'),
  briefGoalBlock: document.querySelector('.brief-goal'),
  briefGoalFa: $('brief-goal-fa'),
  briefGoalEn: $('brief-goal-en'),
  briefPhrasesBlock: document.querySelector('.brief-phrases'),
  briefPhrasesList: $('brief-phrases-list'),
  btnStartSession: $('btn-start-session'),

  sessionBody: $('session-body'),
  transcript: $('transcript'),
  railPhrasesSection: document.querySelector('.rail-section'),
  railPhrases: $('rail-phrases'),
  railCorrectionFeed: $('rail-correction-feed'),

  sessionControls: $('session-controls'),
  ribbonEl: $('ribbon'),
  ribbonYouPct: $('ribbon-you-pct'),
  turnForm: $('turn-form'),
  btnMic: $('btn-mic'),
  turnText: $('turn-text'),
  btnSend: $('btn-send'),
  turnStatus: $('turn-status'),
  btnEndSession: $('btn-end-session'),

  debriefTitleEn: $('debrief-title-en'),
  statGoal: $('stat-goal'),
  statGoalValue: $('stat-goal-value'),
  statGoalReason: $('stat-goal-reason'),
  statTalktime: $('stat-talktime'),
  statLevel: $('stat-level'),
  didWellQuote: $('did-well-quote'),
  upgradesSection: $('upgrades-section'),
  upgradesList: $('upgrades-list'),
  correctionsSection: $('corrections-section'),
  correctionsList: $('corrections-list'),
  missedSection: $('missed-section'),
  missedList: $('missed-list'),
  btnRetry: $('btn-retry'),
  btnBackToPicker: $('btn-back-to-picker'),

  toast: $('toast'),
};

// ─────────────────────────────────────────────────────────────
// وضعیت
// ─────────────────────────────────────────────────────────────
let content = { scenarios: [], topics: [] };
let currentLevel = store.getLevel();

/** جلسه‌ی جاری — هنگام شروع هر تمرین از نو ساخته می‌شود */
let session = null;

function newSession(kind, data) {
  return {
    kind, // 'scenario' | 'topic'
    data,
    transcript: [], // [{role:'user'|'partner', text}]
    ribbon: new Ribbon(el.ribbonEl),
    busy: false,
  };
}

// ─────────────────────────────────────────────────────────────
// کمکی‌ها
// ─────────────────────────────────────────────────────────────
function wordCount(text) {
  return (text.trim().match(/\S+/g) || []).length;
}

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 3200);
}

function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) {
    node.hidden = key !== name;
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/** پارسر SSE سبک — سرور به‌شکل `data: {...}\n\n` و `event: done\n` می‌فرستد */
async function postSSE(url, body, { onChunk, onDone, onError }) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error('اتصال به سرور برقرار نشد.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop();
      for (const raw of chunks) {
        if (!raw.trim()) continue;
        let eventName = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (eventName === 'done') {
          onDone?.();
          return;
        }
        if (eventName === 'error') {
          onError?.(JSON.parse(data || '{}').message || 'خطا');
          return;
        }
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.chunk) onChunk?.(parsed.chunk);
          } catch {
            /* یک تکه‌ی ناقص — نادیده گرفته می‌شود، تکه‌ی بعدی جبران می‌کند */
          }
        }
      }
    }
    onDone?.();
  } catch (err) {
    onError?.(err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// بارگذاری محتوا و صفحه‌ی انتخاب
// ─────────────────────────────────────────────────────────────
async function loadContent() {
  const res = await fetch('/api/content');
  content = await res.json();
}

function renderWarmup() {
  const due = store.getDuePhrases(5);
  el.warmupSection.hidden = due.length === 0;
  if (due.length === 0) return;
  el.warmupCount.textContent = due.length;
  el.warmupCards.innerHTML = '';
  for (const phrase of due) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'warmup-card';
    card.innerHTML = `
      <span class="warmup-card-en">${escapeHtml(phrase.en)}</span>
      <span class="warmup-card-fa">${escapeHtml(phrase.fa)}</span>
      <span class="warmup-card-hint">برای دیدن معنی بزن</span>
    `;
    card.addEventListener('click', () => {
      if (!card.classList.contains('is-revealed')) {
        card.classList.add('is-revealed');
      } else {
        store.recordReview(phrase.id, true);
        card.remove();
        if (!el.warmupCards.children.length) el.warmupSection.hidden = true;
      }
    });
    el.warmupCards.appendChild(card);
  }
}

function scenarioCard(scenario) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'scenario-card';
  card.innerHTML = `
    <span class="card-level">${scenario.level}</span>
    <h3 class="card-title-en">${escapeHtml(scenario.title_en)}</h3>
    <p class="card-title-fa">${escapeHtml(scenario.title_fa)}</p>
    <p class="card-goal">${escapeHtml(scenario.goal_fa)}</p>
  `;
  card.addEventListener('click', () => startSession('scenario', scenario));
  return card;
}

function topicCard(topic) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'topic-card';
  card.innerHTML = `
    <span class="card-level">${topic.level}</span>
    <h3 class="card-title-en">${escapeHtml(topic.title_en)}</h3>
    <p class="card-title-fa">${escapeHtml(topic.title_fa)}</p>
  `;
  card.addEventListener('click', () => startSession('topic', topic));
  return card;
}

function renderLibrary() {
  const professional = content.scenarios.filter((s) => s.category === 'professional');
  const everyday = content.scenarios.filter((s) => s.category === 'everyday');

  el.gridProfessional.replaceChildren(...professional.map(scenarioCard));
  el.gridEveryday.replaceChildren(...everyday.map(scenarioCard));
  el.gridTopics.replaceChildren(...content.topics.map(topicCard));
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// تب‌ها
for (const tab of el.tabs) {
  tab.addEventListener('click', () => {
    for (const t of el.tabs) {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    }
    for (const panel of el.panels) {
      panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.target);
    }
  });
}

el.warmupSkip.addEventListener('click', () => {
  el.warmupSection.hidden = true;
});

el.levelSelect.addEventListener('change', () => {
  currentLevel = el.levelSelect.value;
  store.setLevel(currentLevel);
});

// ─────────────────────────────────────────────────────────────
// جلسه‌ی تمرین
// ─────────────────────────────────────────────────────────────
function startSession(kind, data) {
  session = newSession(kind, data);
  session.ribbon.reset();

  el.sessionTitleEn.textContent = data.title_en;
  el.sessionTitleFa.textContent = data.title_fa;
  el.transcript.innerHTML = '';
  el.railCorrectionFeed.innerHTML =
    '<p class="rail-empty">وقتی چیزی برای تصحیح باشد، همین‌جا و بدون قطع کردن مکالمه نشانت می‌دهم.</p>';
  el.ribbonEl.innerHTML = '';
  el.ribbonYouPct.textContent = '0%';
  el.turnText.value = '';
  el.turnStatus.textContent = '';

  if (kind === 'scenario') {
    el.briefGoalBlock.hidden = false;
    el.briefGoalFa.textContent = data.goal_fa;
    el.briefGoalEn.textContent = data.goal_en;
    el.briefPhrasesBlock.hidden = false;
    el.briefPhrasesList.innerHTML = data.target_phrases
      .map((p) => `<li>${escapeHtml(p.en)}</li>`)
      .join('');
    el.railPhrasesSection.hidden = false;
    el.railPhrases.innerHTML = data.target_phrases
      .map(
        (p) => `<li><span class="rail-phrase-en">${escapeHtml(p.en)}</span><span class="rail-phrase-fa">${escapeHtml(p.fa)}</span></li>`
      )
      .join('');
  } else {
    el.briefGoalBlock.hidden = true;
    el.briefPhrasesBlock.hidden = true;
    el.railPhrasesSection.hidden = true;
  }

  el.sessionBrief.hidden = false;
  el.sessionBody.hidden = true;
  el.sessionControls.hidden = true;

  showScreen('session');
}

el.btnLeaveSession.addEventListener('click', () => {
  speech.stopSpeaking();
  showScreen('picker');
});

el.btnStartSession.addEventListener('click', () => {
  el.sessionBrief.hidden = true;
  el.sessionBody.hidden = false;
  el.sessionControls.hidden = false;
  requestPartnerTurn();
});

function appendBubble(role, initialText = '') {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  const label = document.createElement('p');
  label.className = 'bubble-label';
  label.textContent =
    role === 'partner'
      ? session.kind === 'scenario'
        ? session.data.partner_name
        : session.data.partner_name
      : 'You';
  const text = document.createElement('p');
  text.className = 'bubble-text';
  text.textContent = initialText;
  bubble.append(label, text);
  el.transcript.appendChild(bubble);
  el.transcript.scrollTop = el.transcript.scrollHeight;
  return { bubble, text };
}

function requestPartnerTurn() {
  session.busy = true;
  setControlsEnabled(false);
  el.turnStatus.textContent = `${session.kind === 'scenario' ? session.data.partner_name : session.data.partner_name} دارد فکر می‌کند…`;

  const { bubble, text } = appendBubble('partner');
  text.classList.add('is-streaming');
  let full = '';

  postSSE(
    '/api/turn',
    {
      mode: session.kind,
      id: session.data.id,
      history: session.transcript,
      level: currentLevel,
    },
    {
      onChunk: (chunk) => {
        full += chunk;
        text.textContent = full;
        el.transcript.scrollTop = el.transcript.scrollHeight;
      },
      onDone: () => {
        text.classList.remove('is-streaming');
        session.transcript.push({ role: 'partner', text: full });
        session.ribbon.addSegment('partner', wordCount(full));
        updateRibbonReadout();
        speech.speak(full, { level: currentLevel });
        session.busy = false;
        setControlsEnabled(true);
        el.turnStatus.textContent = '';
      },
      onError: (message) => {
        text.classList.remove('is-streaming');
        bubble.remove();
        session.busy = false;
        setControlsEnabled(true);
        el.turnStatus.textContent = '';
        toast('یک مشکل پیش آمد — دوباره امتحان کن. ' + (message || ''));
      },
    }
  );
}

function updateRibbonReadout() {
  el.ribbonYouPct.textContent = `${session.ribbon.youPercent()}%`;
}

function setControlsEnabled(enabled) {
  el.btnSend.disabled = !enabled;
  el.turnText.disabled = !enabled;
  el.btnMic.disabled = !enabled || !speech.sttAvailable;
}

function submitUserTurn(rawText) {
  const text = rawText.trim();
  if (!text || !session || session.busy) return;

  appendBubble('user', text);
  session.transcript.push({ role: 'user', text });
  session.ribbon.addSegment('user', wordCount(text));
  updateRibbonReadout();
  el.turnText.value = '';

  // مربی به‌موازات جواب طرف مقابل اجرا می‌شود — منتظرش نمی‌مانیم
  if (el.liveCorrectCheckbox.checked) {
    fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userText: text }),
    })
      .then((r) => r.json())
      .then(({ correction }) => {
        if (correction) renderLiveCorrection(correction);
      })
      .catch(() => {
        /* تصحیح زنده اختیاری است — شکستش نباید مکالمه را متوقف کند */
      });
  }

  requestPartnerTurn();
}

function renderLiveCorrection(correction) {
  const empty = el.railCorrectionFeed.querySelector('.rail-empty');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = 'correction-card';
  card.innerHTML = `
    <p class="correction-said">${escapeHtml(correction.said)}</p>
    <p class="correction-natural">${escapeHtml(correction.natural)}</p>
    <p class="correction-why">${escapeHtml(correction.why_fa)}</p>
  `;
  el.railCorrectionFeed.prepend(card);

  const lastUserBubble = [...el.transcript.querySelectorAll('.bubble.user')].pop();
  lastUserBubble?.classList.add('has-correction');
}

el.turnForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitUserTurn(el.turnText.value);
});

// ── میکروفون (push-to-talk) ──
if (speech.sttAvailable) {
  const startPress = (event) => {
    event.preventDefault();
    if (!session || session.busy) return;
    el.btnMic.setAttribute('aria-pressed', 'true');
    el.turnStatus.textContent = 'در حال گوش دادن…';
    speech.startListening({
      onInterim: (text) => {
        el.turnText.value = text;
      },
      onFinal: (text) => {
        el.turnText.value = text;
      },
      onEnd: () => {
        el.btnMic.setAttribute('aria-pressed', 'false');
        el.turnStatus.textContent = '';
        if (el.turnText.value.trim()) submitUserTurn(el.turnText.value);
      },
      onError: () => {
        el.btnMic.setAttribute('aria-pressed', 'false');
        el.turnStatus.textContent = 'میکروفون در دسترس نبود — می‌توانی تایپ کنی.';
      },
    });
  };
  const endPress = () => speech.stopListening();

  el.btnMic.addEventListener('pointerdown', startPress);
  el.btnMic.addEventListener('pointerup', endPress);
  el.btnMic.addEventListener('pointerleave', endPress);
} else {
  el.btnMic.hidden = true;
  el.turnStatus.textContent = 'میکروفون در این مرورگر پشتیبانی نمی‌شود — تایپ کن.';
}

// ─────────────────────────────────────────────────────────────
// پایان جلسه → جمع‌بندی
// ─────────────────────────────────────────────────────────────
el.btnEndSession.addEventListener('click', endSession);

async function endSession() {
  speech.stopSpeaking();
  if (!session || session.transcript.filter((t) => t.role === 'user').length === 0) {
    toast('هنوز چیزی نگفتی — یک بار حرف بزن، بعد پایان بده.');
    return;
  }

  el.turnStatus.textContent = 'در حال آماده‌سازی جمع‌بندی…';
  setControlsEnabled(false);

  try {
    const res = await fetch('/api/debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: session.kind,
        id: session.data.id,
        transcript: session.transcript,
      }),
    });
    const result = await res.json();
    renderDebrief(result);
    const added = store.addPhrasesFromDebrief(result);
    if (added > 0) toast(`${added} عبارت به بانک عبارات اضافه شد.`);
    showScreen('debrief');
  } catch {
    toast('جمع‌بندی ساخته نشد — دوباره امتحان کن.');
  } finally {
    setControlsEnabled(true);
    el.turnStatus.textContent = '';
  }
}

function renderDebrief(result) {
  el.debriefTitleEn.textContent = session.data.title_en;

  el.statGoal.classList.remove('is-achieved', 'is-missed');
  el.statGoal.classList.add(result.goal_achieved.value ? 'is-achieved' : 'is-missed');
  el.statGoalValue.textContent = result.goal_achieved.value ? '✓ رسیدی' : '↻ نزدیک بود';
  el.statGoalReason.textContent = result.goal_achieved.reason_fa;

  el.statTalktime.textContent = `${result.talk_time_percent}%`;
  el.statLevel.textContent = result.level_estimate;

  el.didWellQuote.textContent = result.did_well ? `“${result.did_well}”` : '—';

  // ارتقاها — لحظه‌ی امضادار طراحی
  el.upgradesSection.hidden = !result.upgrades?.length;
  el.upgradesList.innerHTML = (result.upgrades || [])
    .map(
      (u) => `
      <div class="upgrade-card">
        <p class="upgrade-b1">${escapeHtml(u.b1)}</p>
        <p class="upgrade-arrow">↓ ${escapeHtml(u.register)}</p>
        <p class="upgrade-new">${escapeHtml(u.upgraded)}</p>
      </div>`
    )
    .join('');

  el.correctionsSection.hidden = !result.corrections?.length;
  el.correctionsList.innerHTML = (result.corrections || [])
    .map(
      (c) => `
      <div class="correction-list-item">
        <p class="correction-said">${escapeHtml(c.said)}</p>
        <p class="correction-natural">${escapeHtml(c.natural)}</p>
        <p class="correction-why">${escapeHtml(c.why_fa)}</p>
      </div>`
    )
    .join('');

  el.missedSection.hidden = !result.missed_phrases?.length;
  el.missedList.innerHTML = (result.missed_phrases || [])
    .map(
      (m) => `
      <div class="missed-item">
        <span class="rail-phrase-en">${escapeHtml(m.phrase)}</span>
        <span class="rail-phrase-fa">${escapeHtml(m.when_to_use)}</span>
      </div>`
    )
    .join('');
}

el.btnRetry.addEventListener('click', () => {
  startSession(session.kind, session.data);
});

el.btnBackToPicker.addEventListener('click', () => {
  renderWarmup();
  showScreen('picker');
});

// ─────────────────────────────────────────────────────────────
// شروع
// ─────────────────────────────────────────────────────────────
async function init() {
  el.levelSelect.value = currentLevel;
  try {
    await loadContent();
    renderLibrary();
    renderWarmup();
  } catch {
    toast('بارگذاری محتوا با مشکل مواجه شد — صفحه را دوباره باز کن.');
  }
}

init();
