// Loads the built site from a non-localhost origin and records every request it makes.
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const url = process.argv[2];
const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const exe = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((d) => join(root, d, 'chrome-win64', 'chrome.exe')).find(existsSync);
const browser = await chromium.launch({ executablePath: existsSync(chromium.executablePath()) ? undefined : exe });
for (const q of ['', '?connect=1']) {
  const page = await browser.newPage();
  const hits = [];
  page.on('request', (r) => hits.push(r.url()));
  await page.goto(url + q, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const loopback = hits.filter((h) => /127\.0\.0\.1|localhost/.test(h));
  const banner = await page.getByText('Recorded runs only').count();
  console.log(JSON.stringify({ query: q || '(none)', requests: hits.length, loopbackRequests: loopback, recordedBanner: banner > 0 }));
  await page.close();
}
await browser.close();
