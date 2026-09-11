// Capture the rollout history page with the newest deployment expanded so its
// commit changelist (PR title, author, lines changed) is visible.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from '/home/luka/.claude/skills/gstack/node_modules/playwright-core/index.js'; const { chromium } = pkg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../static/screenshots/dashboard');
const BASE = process.env.URL_BASE || 'https://127.0.0.1:5173';
const url = BASE + (process.argv[2] || '/rollouts/dev/hello-multi-dev/hello-multi-app/history');
const PREP = `(async()=>{ if(!document.getElementById('cap-inter')){const l=document.createElement('link');l.id='cap-inter';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';document.head.appendChild(l);const s=document.createElement('style');s.textContent=":root, html, body, button, input, select, textarea, [class*='font-sans'] { font-family:'Inter', ui-sans-serif, system-ui, sans-serif !important; }";document.head.appendChild(s);} await document.fonts.ready; await Promise.all([300,400,500,600,700].flatMap(w=>[document.fonts.load(w+' 16px Inter'),document.fonts.load(w+' 16px Montserrat')])); })()`;
const b = await chromium.launch();
for (const [vw,vh,suffix,mobile] of [[1440,900,'',false],[414,896,'-mobile',true]]) {
  const ctx = await b.newContext({ ignoreHTTPSErrors:true, viewport:{width:vw,height:vh}, deviceScaleFactor:2, colorScheme:'dark', isMobile:mobile, hasTouch:mobile });
  const p = await ctx.newPage(); await p.goto(BASE+'/',{waitUntil:'load'}); await p.evaluate(()=>localStorage.setItem('theme','dark'));
  await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(3000);
  if (!(await p.evaluate(()=>document.documentElement.classList.contains('dark')))) { await p.click('button[aria-label^="Switch to"]'); await p.reload({waitUntil:'load'}); await p.waitForTimeout(3000); }
  const btns = await p.$$('button[aria-expanded="false"]'); console.log(suffix||'desktop', 'expanders', btns.length);
  // expand the first deployment row (skip range presets: they are not aria-expanded)
  for (const bt of btns) { const box = await bt.boundingBox(); if (box && box.y > 500) { await bt.click(); break; } }
  await p.waitForTimeout(3500); await p.evaluate(PREP); await p.waitForTimeout(800);
  const txt = await p.evaluate(()=>document.body.innerText); console.log('commits visible:', /commit|Changed|files|\+\d+ ?[−-]\d+/i.test(txt));
  await p.screenshot({ path:`${OUT}/history${suffix}.png` }); await ctx.close();
}
await b.close();
