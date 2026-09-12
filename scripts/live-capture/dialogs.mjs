// Captures that need a click first:
//   held-schedule.png  rollout held by a deploy window, schedule popover open
//   held-approval.png  the same rollout's newer builds, a HELD chip opened (approval + window)
//   change-version.png the Change Version dialog opened on a build, commits and diffstat visible
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from '/home/luka/.claude/skills/gstack/node_modules/playwright-core/index.js'; const { chromium } = pkg;
// Same font prep as capture-live.mjs (not imported: importing would run its capture).
const PREP = `(async () => { if (!document.getElementById('cap-inter')) { const link=document.createElement('link'); link.id='cap-inter'; link.rel='stylesheet'; link.href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'; document.head.appendChild(link); const style=document.createElement('style'); style.textContent=":root, html, body, button, input, select, textarea, [class*='font-sans'] { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important; }"; document.head.appendChild(style);} await document.fonts.ready; await Promise.all([300,400,500,600,700].flatMap(w=>[document.fonts.load(w+' 16px Inter'),document.fonts.load(w+' 16px Montserrat')])); })()`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../static/screenshots/dashboard');
const BASE = process.env.URL_BASE || 'https://127.0.0.1:5173';
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const SHOTS = [
  { name: 'held-schedule', route: process.env.HELD_ROUTE || '/rollouts/prod/hello-world-prod/hello-world-app', click: 'button:has-text("rule")' },
  { name: 'held-approval', route: process.env.HELD_ROUTE || '/rollouts/prod/hello-world-prod/hello-world-app', click: 'button:has-text("HELD by 2 rules")' },
  { name: 'change-version', route: process.env.CV_ROUTE || '/rollouts/prod/hello-world-prod/hello-world-app', click: 'button:has-text("Change Version")', then: '[role="dialog"] >> text=/newer$/' },
];
const b = await chromium.launch();
for (const [vw, vh, suffix, mobile] of [[1440, 900, '', false], [414, 896, '-mobile', true]]) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: vw, height: vh }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.evaluate(() => localStorage.setItem('theme', 'dark'));
  for (const s of SHOTS.filter(x => !only.length || only.includes(x.name))) {
    await p.goto(BASE + s.route, { waitUntil: 'load' }); await p.waitForTimeout(4000);
    if (!(await p.evaluate(() => document.documentElement.classList.contains('dark')))) { await p.click('button[aria-label^="Switch to"]'); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(4000); }
    await p.mouse.move(0, 0);
    const btn = p.locator(s.click).first();
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(3000); } else { console.log('no button for', s.name); }
    if (s.then) { const nx = p.locator(s.then).first(); if (await nx.count()) { await nx.click(); await p.waitForTimeout(3500); } else { console.log('no follow-up for', s.name); } }
    await p.evaluate(PREP); await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${s.name}${suffix}.png` });
    console.log(new Date().toISOString().slice(11, 19), s.name + suffix);
  }
  await ctx.close();
}
await b.close();
