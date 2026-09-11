// Capture dashboard screenshots from a LIVE dashboard (vite :5173 with
// GITHUB_DEV_TOKEN set, hub/spoke kind clusters up). Dark theme, 2x, Inter.
// Usage: node capture-live.mjs [both|desktop|mobile]
// Run scripts/build-and-push.sh in rollout-dashboard first and capture while
// rollouts move, or use wait-and-capture.sh which does that waiting for you.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from '/home/luka/.claude/skills/gstack/node_modules/playwright-core/index.js'; const { chromium } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../static/screenshots/dashboard');
const BASE = process.env.URL_BASE || 'https://127.0.0.1:5173';
const which = process.argv[2] || 'both';
const ROUTES = [
  ['/', 'home'], ['/changes', 'changes'],
  ['/changes/github.com/littlechimera/kuberik-testing/pull/4', 'change'],
  ['/apps', 'apps'], ['/rollouts/dev/hello-dep-dev/hello-frontend-app', 'overview'],
  ['/rollouts/dev/hello-dep-dev/hello-frontend-app/history', 'history'],
  ['/activity', 'activity'],
];
export const PREP = `(async () => { if (!document.getElementById('cap-inter')) { const link=document.createElement('link'); link.id='cap-inter'; link.rel='stylesheet'; link.href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'; document.head.appendChild(link); const style=document.createElement('style'); style.textContent=":root, html, body, button, input, select, textarea, [class*='font-sans'] { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important; }"; document.head.appendChild(style);} await document.fonts.ready; await Promise.all([300,400,500,600,700].flatMap(w=>[document.fonts.load(w+' 16px Inter'),document.fonts.load(w+' 16px Montserrat')])); })()`;
const b = await chromium.launch();
const sets = [[1440, 900, '', false], [414, 896, '-mobile', true]].filter(s => which==='both' || (which==='desktop' && !s[3]) || (which==='mobile' && s[3]));
for (const [vw, vh, suffix, mobile] of sets) {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: vw, height: vh }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.evaluate(() => localStorage.setItem('theme','dark'));
  for (const [route, name] of ROUTES) {
    await p.goto(BASE + route, { waitUntil: 'load' }); await p.waitForTimeout(2500);
    if (!(await p.evaluate(() => document.documentElement.classList.contains('dark')))) { await p.click('button[aria-label^="Switch to"]'); await p.waitForTimeout(200); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500); }
    await p.evaluate(PREP); await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${name}${suffix}.png` });
    console.log(new Date().toISOString().slice(11,19), name + suffix);
  }
  await ctx.close();
}
await b.close();
