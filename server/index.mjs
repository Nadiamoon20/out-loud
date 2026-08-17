#!/usr/bin/env node
/**
 * سرور «بلند بگو» — یک فایل node:http ساده، بدون فریم‌ورک.
 *
 * مسیرها:
 *   GET  /                 → فایل‌های استاتیک public/
 *   GET  /api/content       → کتابخانه‌ی سناریوها و موضوعات (بارگذاری‌شده در حافظه)
 *   POST /api/turn           → جواب طرف مقابل، به‌صورت استریم SSE
 *   POST /api/coach          → تصحیح فوری یک جمله (یا null)
 *   POST /api/debrief        → جمع‌بندی پایان جلسه
 *
 * کلید API فقط اینجا — سمت سرور — خوانده می‌شود؛ هیچ‌وقت به مرورگر نمی‌رود.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEngine } from './engine/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const CONTENT_DIR = join(ROOT, 'content');

// ─────────────────────────────────────────────────────────────
// بارگذاری .env بدون وابستگی به بسته‌ی dotenv
// ─────────────────────────────────────────────────────────────
async function loadEnv() {
  try {
    const text = await readFile(join(ROOT, '.env'), 'utf8');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // فایل .env نیست — عیبی ندارد، پیش‌فرض‌ها (ENGINE=mock) اعمال می‌شود
  }
}

// ─────────────────────────────────────────────────────────────
// محتوا — یک بار در شروع بارگذاری می‌شود
// ─────────────────────────────────────────────────────────────
let scenariosById = new Map();
let topicsById = new Map();
let contentPayload = null;

async function loadContent() {
  const [scenariosRaw, topicsRaw] = await Promise.all([
    readFile(join(CONTENT_DIR, 'scenarios.json'), 'utf8'),
    readFile(join(CONTENT_DIR, 'topics.json'), 'utf8'),
  ]);
  const { scenarios } = JSON.parse(scenariosRaw);
  const { topics } = JSON.parse(topicsRaw);
  scenariosById = new Map(scenarios.map((s) => [s.id, s]));
  topicsById = new Map(topics.map((t) => [t.id, t]));
  contentPayload = JSON.stringify({ scenarios, topics });
}

function resolveItem({ mode, id }) {
  if (mode === 'scenario') {
    const scenario = scenariosById.get(id);
    if (!scenario) throw new HttpError(404, `سناریوی «${id}» پیدا نشد.`);
    return { scenario, topic: undefined };
  }
  if (mode === 'topic') {
    const topic = topicsById.get(id);
    if (!topic) throw new HttpError(404, `موضوع «${id}» پیدا نشد.`);
    return { scenario: undefined, topic };
  }
  throw new HttpError(400, 'mode باید scenario یا topic باشد.');
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────
// فایل‌های استاتیک
// ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const safeRel = normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safeRel);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error('directory');
    const body = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('پیدا نشد — 404');
  }
}

// ─────────────────────────────────────────────────────────────
// بدنه‌ی درخواست JSON
// ─────────────────────────────────────────────────────────────
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new HttpError(413, 'درخواست خیلی بزرگ است.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, 'JSON نامعتبر است.'));
      }
    });
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────
// مسیرهای API
// ─────────────────────────────────────────────────────────────
async function handleContent(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(contentPayload);
}

async function handleTurn(req, res) {
  const body = await readJsonBody(req);
  const { mode, id, history = [], level = 'B1' } = body;
  const { scenario, topic } = resolveItem({ mode, id });
  const engine = getEngine();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of engine.streamTurn({ scenario, topic, history, level })) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write('event: done\ndata: {}\n\n');
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function handleCoach(req, res) {
  const body = await readJsonBody(req);
  const { userText } = body;
  if (!userText || !userText.trim()) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ correction: null }));
    return;
  }
  const engine = getEngine();
  const correction = await engine.coach({ userText });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ correction }));
}

async function handleDebrief(req, res) {
  const body = await readJsonBody(req);
  const { mode, id, transcript = [] } = body;
  const { scenario, topic } = resolveItem({ mode, id });
  const engine = getEngine();
  const result = await engine.debrief({ scenario, topic, transcript });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result));
}

// ─────────────────────────────────────────────────────────────
// مسیریابی اصلی
// ─────────────────────────────────────────────────────────────
async function main() {
  await loadEnv();
  await loadContent();

  const engineMode = (process.env.ENGINE || 'mock').toLowerCase();
  const port = Number(process.env.PORT) || 5173;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === '/api/content' && req.method === 'GET') {
        return await handleContent(req, res);
      }
      if (url.pathname === '/api/turn' && req.method === 'POST') {
        return await handleTurn(req, res);
      }
      if (url.pathname === '/api/coach' && req.method === 'POST') {
        return await handleCoach(req, res);
      }
      if (url.pathname === '/api/debrief' && req.method === 'POST') {
        return await handleDebrief(req, res);
      }
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'مسیر پیدا نشد.' }));
        return;
      }
      return await serveStatic(req, res, url.pathname);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ error: err.message || 'خطای سرور' }));
      if (status === 500) console.error(err);
    }
  });

  server.listen(port, () => {
    console.log(`\n  بلند بگو — Out Loud`);
    console.log(`  موتور: ${engineMode}${engineMode === 'claude' && !process.env.ANTHROPIC_API_KEY ? '  ⚠ ANTHROPIC_API_KEY تنظیم نشده!' : ''}`);
    console.log(`  http://localhost:${port}\n`);
  });
}

main().catch((err) => {
  console.error('✗ سرور بالا نیامد:', err);
  process.exit(1);
});
