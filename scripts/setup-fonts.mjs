#!/usr/bin/env node
/**
 * دانلود یک‌باره‌ی فونت‌های لاتین (Instrument Serif و Schibsted Grotesk).
 *
 * وزیرمتن از قبل در public/fonts هست و دانلود نمی‌شود.
 *
 * چرا self-host؟ اپ باید آفلاین هم کار کند. اگر فونت از CDN بیاید، یک روز
 * که اینترنت کند است متن با فونت fallback رندر می‌شود و کل طراحی خراب
 * می‌شود — بی‌آنکه خطایی ببینیم.
 *
 * هر سه فونت با لایسنس آزاد OFL منتشر شده‌اند.
 */
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts');

// از fontsource — فایل‌های استاتیک woff2 با ساب‌ست لاتین
const FONTSOURCE = [
  {
    file: 'SchibstedGrotesk-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/schibsted-grotesk@5/files/schibsted-grotesk-latin-400-normal.woff2',
  },
  {
    file: 'SchibstedGrotesk-Medium.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/schibsted-grotesk@5/files/schibsted-grotesk-latin-500-normal.woff2',
  },
  {
    file: 'SchibstedGrotesk-Bold.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/schibsted-grotesk@5/files/schibsted-grotesk-latin-700-normal.woff2',
  },
  {
    file: 'InstrumentSerif-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5/files/instrument-serif-latin-400-normal.woff2',
  },
  {
    file: 'InstrumentSerif-Italic.woff2',
    url: 'https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5/files/instrument-serif-latin-400-italic.woff2',
  },
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download({ file, url }) {
  const dest = join(FONT_DIR, file);
  if (await exists(dest)) {
    console.log(`  ✓ ${file} (از قبل هست)`);
    return true;
  }
  process.stdout.write(`  ↓ ${file} ... `);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`${(buf.length / 1024).toFixed(0)}KB`);
    return true;
  } catch (err) {
    console.log(`✗ ${err.message}`);
    return false;
  }
}

async function main() {
  await mkdir(FONT_DIR, { recursive: true });
  console.log('\nفونت‌های لاتین:');

  let ok = 0;
  for (const font of FONTSOURCE) {
    if (await download(font)) ok++;
  }

  const vazir = await exists(join(FONT_DIR, 'Vazirmatn-Regular.woff2'));
  console.log(`\nوزیرمتن: ${vazir ? '✓ موجود' : '✗ پیدا نشد'}`);

  if (ok < FONTSOURCE.length) {
    console.log(
      '\n⚠  بعضی فونت‌ها دانلود نشدند. اپ کار می‌کند ولی با فونت جایگزین\n' +
        '   رندر می‌شود. اینترنت را چک کن و دوباره  npm run setup:fonts  را بزن.'
    );
  } else {
    console.log('\n✓ همه‌ی فونت‌ها آماده‌اند.\n');
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
