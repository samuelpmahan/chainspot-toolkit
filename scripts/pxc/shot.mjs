/**
 * Screenshots of a page at deep links, so an agent can look at a render (Sam: "we want to make visual inspection
 * automatic"). Headless Chromium through playwright; full page.
 *   node scripts/pxc.mjs shot <file.html> <outdir> "<hash>" ["<hash>" ...]
 *   e.g. node scripts/pxc.mjs shot attempts/state/inspector.html /tmp/shots "course=heritage&cell=S4tees&filter=rec&obj=S4 Tee ca"
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export async function shot(file, outDir, hashes, { width = 1600, height = 1000 } = {}) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const exe = process.env.PLAYWRIGHT_CHROMIUM ?? undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width, height } });
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const h of hashes) {
    await page.goto(`file://${resolve(file)}#${h}`); await page.waitForTimeout(600);
    const out = resolve(outDir, `shot-${h.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.png`);
    await page.screenshot({ path: out, fullPage: true }); written.push(out);
  }
  await browser.close();
  return written;
}
