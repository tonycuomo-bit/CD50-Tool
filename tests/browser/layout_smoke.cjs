// Browser smoke test for cd50-layout/cd50-layout.html, run by tests/test_layout_browser.py.
// Opens the built page from disk in Chromium and prints one JSON object of results; the Python test asserts on it.
// Usage: node layout_smoke.cjs <page.html> <work dir with ge.jpg, ge.kmz, sk.png>
const path = require('path'), fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log(JSON.stringify({ skip: 'playwright not installed' })); process.exit(0); }
const [page_, dir] = process.argv.slice(2), url = 'file://' + path.resolve(page_);
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })).catch(() => null);
  if (!b) { console.log(JSON.stringify({ skip: 'no chromium' })); return; }
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }), out = { errors: [] };
  p.on('pageerror', e => out.errors.push(e.message));
  await p.route(/^https?:/, r => r.abort());   // offline: fonts and anything else outside the file must not matter
  const go = async (auto) => { await p.goto(url); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('cd50layout'); }); await p.reload(); await p.waitForTimeout(500);
    if (!auto) await p.uncheck('#sk-auto'); await p.fill('#addr', '1201 Main St, Golden, CO'); await p.press('#addr', 'Enter'); await p.waitForTimeout(300); };
  const shadow = (sel) => p.evaluate(s => { const e = document.getElementById('sketchview').shadowRoot.querySelector(s); return e && (e.value !== undefined ? e.value : e.textContent); }, sel);

  // 1. the address switches to Aerial Site Sketch with the address filled in; Back returns
  await go(true);
  out.sketchOpened = await p.evaluate(() => document.body.classList.contains('sk'));
  out.sketchAddress = await shadow('#address');
  out.libs = await p.evaluate(() => !!(window.jspdf && window.JSZip));
  await p.locator('#sketchview').locator('#sk-back').click(); await p.waitForTimeout(200);
  out.backToLayout = await p.evaluate(() => !document.body.classList.contains('sk'));

  // 2. a sketch result (example round, picked B) comes back at its scale into the layout area and the sketch slot
  await p.click('#b-sketchapp'); await p.waitForTimeout(200);
  await p.evaluate(() => document.getElementById('sketchview').shadowRoot.querySelector('#pickB').disabled = false);
  await p.locator('#sketchview').locator('#pickB').click(); await p.waitForTimeout(300);
  await p.locator('#sketchview').locator('#send-layout').click(); await p.waitForTimeout(2000);
  out.sent = await p.evaluate(() => ({ layout: !document.body.classList.contains('sk'), slot: !!document.querySelector('.photo[data-slot="sketch"] img'),
    note: document.getElementById('photonote').textContent, scale: document.getElementById('scalestat').textContent }));

  // 3. reload: the layout and its images come back from browser storage (images from IndexedDB, not localStorage)
  await p.reload(); await p.waitForTimeout(1200);
  out.reload = await p.evaluate(() => ({ bg: (document.querySelector('#plan image') || {}).getAttribute?.('href')?.slice(0, 15) || null,
    slot: !!document.querySelector('.photo[data-slot="sketch"] img'), lsBytes: (localStorage.getItem('cd50layout') || '').length + (localStorage.getItem('cd50photos') || '').length,
    warn: !document.getElementById('storewarn').hidden }));

  // 4. every kind of item drags without panning, from Select and from Crop view
  await go(false);
  for (const id of ['pk-stalls', 'pk-addsign', 'ls-add']) { const el = await p.$('#' + id); if (el) await el.click(); }
  await p.waitForTimeout(200);
  const vb = () => p.$eval('#plan', s => s.getAttribute('viewBox'));
  async function drag(sel) {
    for (const el of await p.$$(sel)) {
      const r = await el.boundingBox(); if (!r) continue;
      const [n, v] = await el.evaluate(e => { const a = [...e.attributes].find(a => a.name.startsWith('data-')); return [a.name, a.value]; });
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (!await p.evaluate(([x, y, n, v]) => { const h = document.elementFromPoint(x, y); const c = h && h.closest('[' + n + ']'); return !!c && c.getAttribute(n) === v; }, [cx, cy, n, v])) continue;
      const v0 = await vb(); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 25, cy + 15, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(80);
      const r2 = await (await p.$(`[${n}="${v}"]`)).boundingBox();
      return { moved: Math.hypot(r2.x - r.x, r2.y - r.y) > 5, panned: v0 !== await vb(), select: await p.$eval('#m-select', e => e.getAttribute('aria-pressed')) === 'true' };
    }
    return null;
  }
  out.drag = { item: await drag('#plan [data-item]'), parking: await drag('#plan [data-pk]'), bollard: await drag('#plan [data-boll]') };
  await p.click('#m-crop'); out.drag.fromCrop = await drag('#plan [data-item]');
  await p.click('#m-crop'); await p.keyboard.press('Escape'); out.escSelect = await p.$eval('#m-select', e => e.getAttribute('aria-pressed')) === 'true';

  // 5. Google Earth: image alone shows at once (unscaled); with the KMZ it is scaled and pinned with no clicks (estimated)
  await go(false);
  await p.setInputFiles('#gefile', [path.join(dir, 'ge.jpg')]); await p.waitForTimeout(600);
  out.geImage = await p.$eval('#scalestat', e => e.textContent);
  await p.setInputFiles('#gefile', [path.join(dir, 'ge.kmz')]); await p.waitForTimeout(600);
  out.geKmz = { stat: await p.$eval('#scalestat', e => e.textContent), refine: await p.$eval('#b-gecal', e => !e.hidden), select: await p.$eval('#m-select', e => e.getAttribute('aria-pressed')) === 'true' };

  // 6. Set scale from stalls: 2 stalls apart = 18 ft, marked measured
  await p.click('#m-scale'); const pr = await (await p.$('#plan')).boundingBox();
  await p.mouse.click(pr.x + 400, pr.y + 400); await p.mouse.click(pr.x + 500, pr.y + 400); await p.waitForTimeout(100);
  await p.fill('#scalestalls', '2'); await p.dispatchEvent('#scalestalls', 'input');
  out.stallFt = await p.$eval('#scaleft', e => e.value);
  await p.click('#scaleok'); await p.waitForTimeout(200);
  out.stallStat = await p.$eval('#scalestat', e => e.textContent);
  out.frameScale = await p.evaluate(() => JSON.parse(localStorage.getItem('cd50layout')).img.scale);

  // 7. Sketch view pulls the image in the Aerial sketch result slot
  await p.evaluate(() => document.querySelector('.photo[data-slot="sketch"] .pv').click()).catch(() => {});
  await p.setInputFiles('#photofile', [path.join(dir, 'sk.png')]); await p.waitForTimeout(700);
  out.sketchView = await p.evaluate(() => ({ pressed: document.getElementById('b-sketch').getAttribute('aria-pressed'), href: document.querySelector('#plan image').getAttribute('href').slice(0, 22) }));

  console.log(JSON.stringify(out)); await b.close();
})().catch(e => { console.log(JSON.stringify({ fatal: String(e && e.stack || e) })); process.exit(0); });
