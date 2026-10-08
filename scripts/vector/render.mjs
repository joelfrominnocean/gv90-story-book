// Render SVG style frames to PNG for review (Playwright + Chromium).
//   node scripts/vector/render.mjs <svgDir> <pngDir> [scale]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [svgDir = 'docs/style-frames', pngDir = 'docs/style-frames/png', scaleArg = '2'] = process.argv.slice(2);
fs.mkdirSync(pngDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(scaleArg), reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
for (const f of fs.readdirSync(svgDir).filter((x) => x.endsWith('.svg'))) {
  await page.goto(pathToFileURL(path.resolve(svgDir, f)).href);
  await page.waitForTimeout(150);
  const out = path.join(pngDir, f.replace(/\.svg$/, '.png'));
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
