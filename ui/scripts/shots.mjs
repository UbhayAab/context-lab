// Visual + geometry checks for the UI. Usage:
//   node scripts/shots.mjs [--base http://127.0.0.1:4318/] [--out ./shots] [--only views|live|snapshot]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:4318/');
const OUT = resolve(arg('out', './shots'));
const ONLY = arg('only', 'all');
const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
const THEMES = ['light', 'dark'];
const VIEWS = ['chat', 'evaluate', 'context', 'agents'];
mkdirSync(OUT, { recursive: true });

const report = { overflow: [], shots: [], notes: [] };

async function overflowCheck(page, label) {
  const bad = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = [];
    const scrollsX = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p).overflowX; if (s === 'auto' || s === 'scroll' || s === 'hidden') return true; } return false; };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.right > vw + 1 || r.left < -1) && !scrollsX(el)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(r.left)},${Math.round(r.right)}]`);
    }
    return { docWidth: document.documentElement.scrollWidth, vw, offenders: out.slice(0, 8) };
  });
  if (bad.docWidth > bad.vw || bad.offenders.length) report.overflow.push({ label, ...bad });
}

async function snap(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  report.shots.push(p);
}

async function open(page, hash, query = '') {
  await page.goto(`${BASE}${query}#/${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

async function views(browser) {
  for (const theme of THEMES) for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: theme, deviceScaleFactor: vp.name === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    for (const v of VIEWS) {
      await open(page, v);
      await overflowCheck(page, `${v}-${vp.name}-${theme}`);
      await snap(page, `${v}-${vp.name}-${theme}`);
    }
    // Evaluate drill-in: first cell, then first question trace.
    await open(page, 'evaluate');
    const cell = page.locator('main button:has-text("%")').first();
    if (await cell.count()) {
      await cell.click(); await page.waitForTimeout(400);
      await snap(page, `evaluate-sheet-${vp.name}-${theme}`);
      const row = page.locator('[role=dialog] li button').first();
      if (await row.count()) { await row.click(); await page.waitForTimeout(400); await snap(page, `evaluate-trace-${vp.name}-${theme}`); await overflowCheck(page, `trace-${vp.name}-${theme}`); }
    }
    // Agent picker open.
    await open(page, 'chat');
    await page.locator('textarea').first().click();
    const pill = page.locator('main button:has(svg.lucide-chevron-down)').first();
    if (await pill.count()) { await pill.click(); await page.waitForTimeout(300); await snap(page, `picker-${vp.name}-${theme}`); await overflowCheck(page, `picker-${vp.name}-${theme}`); }
    await ctx.close();
  }
}

async function chooseContext(page, version) {
  await page.locator('main button:has-text("Context ")').first().click();
  await page.locator(`[role=dialog] button:has-text("Net revenue ${version}")`).click();
}

async function live(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  await open(page, 'chat');
  await chooseContext(page, '1.1.0');
  await page.locator('textarea').fill('What is net revenue for customer C017?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=/queries|query/', { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await snap(page, 'live-streaming');
  const chip = page.locator('text=/Matches finance|Finance says/').first();
  await chip.waitFor({ timeout: 240_000 });
  await page.waitForTimeout(600);
  report.notes.push(`live chip: ${await chip.innerText()}`);
  await snap(page, 'live-done');
  const log = page.locator('main button:has-text("Worked for")').first();
  if (await log.count()) { await log.click(); await page.waitForTimeout(400); await snap(page, 'live-trace'); }
  await ctx.close();
}

async function snapshotMode(browser) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: 'light', deviceScaleFactor: vp.name === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    await open(page, 'chat', '?mode=snapshot');
    await snap(page, `snapshot-empty-${vp.name}`);
    await page.locator('main button:has-text("C017")').first().click();
    const chip = page.locator('text=/Matches finance|Finance says/').first();
    await chip.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    report.notes.push(`snapshot ${vp.name} chip: ${await chip.innerText()}`);
    await overflowCheck(page, `snapshot-chat-${vp.name}`);
    await snap(page, `snapshot-replay-${vp.name}`);
    await ctx.close();
  }
}

// Reuse the newest Chromium already downloaded if the pinned Playwright's own build is absent.
function chromePath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  if (existsSync(chromium.executablePath())) return undefined;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) { const p = join(root, d, 'chrome-win64', 'chrome.exe'); if (existsSync(p)) return p; }
  return undefined;
}

async function compare(browser) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: vp.name === 'phone' ? 'dark' : 'light', deviceScaleFactor: vp.name === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    await open(page, 'chat', '?mode=snapshot');
    await page.locator('main button[aria-pressed]').click();
    await page.locator('main button:has-text("C017")').first().click();
    await page.waitForFunction(() => document.querySelectorAll('main .shimmer-text').length === 0, null, { timeout: 60_000 });
    await page.waitForTimeout(600);
    await overflowCheck(page, `compare-${vp.name}`);
    await snap(page, `compare-${vp.name}`);
    await ctx.close();
  }
  // One live Grok run: its plan limit is exhausted, so this checks the error state renders.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await open(page, 'chat');
  await page.locator('main button:has(svg.lucide-chevron-down)').first().click();
  const grok = page.locator('[role=dialog] button:has-text("Grok")').first();
  if (await grok.isEnabled()) {
    await grok.click();
    await page.locator('textarea').fill('What is net revenue for customer C017?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('main .shimmer-text').length === 0, null, { timeout: 240_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    report.notes.push(`grok text: ${(await page.locator('main').innerText()).slice(-300).replace(/\s+/g, ' ')}`);
    await snap(page, 'grok-live');
  } else report.notes.push('grok option disabled');
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: chromePath() });
try {
  if (ONLY === 'all' || ONLY === 'views') await views(browser);
  if (ONLY === 'all' || ONLY === 'snapshot') await snapshotMode(browser);
  if (ONLY === 'all' || ONLY === 'live') await live(browser);
  if (ONLY === 'all' || ONLY === 'compare') await compare(browser);
} finally {
  await browser.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ shots: report.shots.length, overflow: report.overflow, notes: report.notes }, null, 2) + '\n');
}
