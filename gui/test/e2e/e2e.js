/*
 * gui/test/e2e/e2e.js
 * End-to-end test of the web GUI: drives the real page in headless Chrome and fails on
 * any console error or Content-Security-Policy violation. It covers the overview, register
 * (search, filters, sorting), the add and report-card drawers, the command palette and
 * keyboard shortcuts, every other page, files, theme, reduced motion, mobile layout,
 * printing and empty states.
 *
 * Needs Google Chrome or Chromium (set CHROME=/path/to/chrome if it is not found)
 * and the C bridge (make gui). Skips with exit code 0 when no browser is found.
 * Optional: SHOTS=/some/dir  saves screenshots there.
 *
 * Run:  make gui-e2e
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const c = require('./cdp.js');
const { createServer } = require('../../server.js');

let BASE;
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = (name, options) => (SHOTS ? c.shot(path.join(SHOTS, name), options) : null);

const problems = [];
let passed = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(
  () => { passed++; console.log('  ok  ', name); },
  (e) => { problems.push(name); console.log('  FAIL', name, '-', e.message.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join(' | ')); });

const ev = (x) => c.evaluate(x);
const q = (sel) => JSON.stringify(sel);
const click = (sel) => ev(`document.querySelector(${q(sel)}).click()`);
const text = (sel) => ev(`document.querySelector(${q(sel)})?.textContent ?? null`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const clickText = (sel, label) => ev(`[...document.querySelectorAll(${q(sel)})].find(e=>e.textContent.includes(${q(label)})).click()`);
const wait = async (cond, label, ms = 4000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await ev(cond)) return; await c.sleep(60); }
  throw new Error('timeout waiting for ' + label);
};
const fill = (sel, v) => ev(`(()=>{const e=document.querySelector(${q(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const key = (target, k, opts = {}) => ev(`${target}.dispatchEvent(new KeyboardEvent('keydown',{key:${q(k)},bubbles:true,cancelable:true,...${JSON.stringify(opts)}}))`);
const lastToast = () => ev('[...document.querySelectorAll(".toast")].pop()?.textContent ?? ""');
const go = async (view, ready) => { await c.goto(`${BASE}/?t=${Date.now()}#${view}`); await wait(ready, `${view} page`); };

(async () => {
  if (!c.findChrome()) {
    console.log('SKIP: Google Chrome or Chromium was not found (set CHROME=/path/to/chrome to run this test).');
    process.exit(0);
  }
  if (typeof WebSocket === 'undefined') {
    console.log('SKIP: the browser test needs Node.js 22 or newer (it uses the built-in WebSocket).');
    process.exit(0);
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-e2e-'));
  const server = createServer({ bridgePath: path.join(__dirname, '..', '..', 'student_bridge'), dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const api = (m, u, b) => fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  await api('POST', '/api/clear', {});

  await c.launch();
  await c.send('Log.enable');
  await c.viewport(1440, 900);

  console.log('Shell and empty state');
  await go('overview', 'document.querySelector(".empty")');
  await check('navigation, capacity gauge and engine status', async () => {
    assert.equal(await count('#nav a'), 6);
    assert.equal(await ev('document.querySelector("#nav a[aria-current=page]").dataset.view'), 'overview');
    await wait('document.querySelector("#engine").textContent.includes("online")', 'engine online');
    assert.match(await text('#gauge'), /0 of 100/);
    assert.match(await text('title'), /Overview/);
  });
  await check('empty overview offers to add or load the example students', async () => {
    assert.match(await text('.empty h2'), /register is empty/);
    assert.ok((await text('.empty')).includes('Load example students'));
  });
  await shot('01-empty.png');
  await check('"Load example students" fills the register and the overview animates in', async () => {
    await clickText('.empty button', 'Load example students');
    await wait('document.querySelector(".hero-figure")', 'hero');
    await wait('document.querySelector(".hero-figure span").textContent==="59.6"', 'count-up reaches 59.6', 5000);
    assert.match(await text('#gauge'), /5 of 100/);
    assert.equal(await text('#nav [data-badge=register]'), '5');
  });

  console.log('Overview');
  await check('hero, pass meter, subject averages with pass line, top three, needs attention', async () => {
    assert.match(await text('.hero-sub'), /Across 5 students: 3 passed and 2 failed\. 60\.0% of the class is passing/);
    assert.equal(await count('.hero .meter span'), 2);
    assert.equal(await count('.avg-row'), 5);
    assert.equal(await count('.avg-row .passline'), 5);
    assert.equal(await ev('[...document.querySelectorAll(".avg-row .val")].map(e=>e.textContent).join(",")'), '64.0,62.0,60.0,66.0,45.8');
    assert.equal(await ev('[...document.querySelectorAll(".mini-list:not(.attn) .nm")].map(e=>e.textContent).join(",")'), 'Asha Rao,Mina Sen,Asha Rao');
    assert.equal(await ev('[...document.querySelectorAll(".mini-list.attn .nm")].map(e=>e.textContent).join(",")'), 'Mina Sen,Omar Ali');
    assert.equal(await count('.mini-list.attn .pen'), 6, 'one circled mark for S003 and five for S004');
  });
  await check('the pen circles draw themselves on arrival (stroke animation present, then complete)', async () => {
    await go('overview', 'document.querySelector(".mini-list.attn .pen-ring path")');
    const early = await ev('getComputedStyle(document.querySelector(".mini-list.attn .pen-ring path")).animationName');
    assert.equal(early, 'pen-draw');
    await c.sleep(2400);
    assert.equal(await ev('getComputedStyle(document.querySelector(".mini-list.attn .pen-ring path")).strokeDashoffset'), '0px');
  });
  await shot('02-overview.png', { full: true });

  console.log('Register');
  await go('register', 'document.querySelectorAll("#register-table tbody tr").length===5');
  await check('table, filter chips with counts, and circled failing marks', async () => {
    assert.equal(await ev('[...document.querySelectorAll(".chip")].map(e=>e.textContent.replace(/\\s+/g," ").trim()).join("|")'), 'All5|Passing3|Failing2');
    assert.equal(await count('#register-table .pen'), 6);
    assert.equal(await ev('[...document.querySelectorAll("#register-table .stamp")].map(s=>s.textContent).join(",")'), 'Pass,Pass,Fail,Fail,Pass');
    assert.equal(await count('td.databar'), 25);
  });
  await check('chips filter the table', async () => {
    await clickText('.chip', 'Failing');
    await wait('document.querySelectorAll("#register-table tbody tr").length===2', 'two failing');
    assert.equal(await ev('document.querySelector(".chip[aria-pressed=true]").textContent.includes("Failing")'), true);
    await clickText('.chip', 'All');
    await wait('document.querySelectorAll("#register-table tbody tr").length===5', 'all');
  });
  await check('sorting by a column header (descending first for numbers), then toggling', async () => {
    await clickText('.th-btn', 'Total');
    assert.equal(await ev('[...document.querySelectorAll("#register-table tbody tr")].map(r=>r.children[0].textContent).join(",")'), 'S005,S003,S001,S002,S004');
    assert.equal(await ev('document.querySelector("th[aria-sort]").getAttribute("aria-sort")'), 'descending');
    await clickText('.th-btn', 'Total');
    assert.equal(await ev('document.querySelector("tbody tr td.id").textContent'), 'S004');
    await clickText('.th-btn', 'Name');
    assert.equal(await ev('document.querySelector("th[aria-sort]").getAttribute("aria-sort")'), 'ascending');
  });
  await check('search: name contains (any case), exact name is case-sensitive, ID, and clear', async () => {
    await fill('#search-q', 'ASHA');
    await wait('document.querySelectorAll("#register-table tbody tr").length===2', 'two Asha');
    assert.match(await text('#result-line'), /2 students whose name contains “ASHA”/);
    await ev('(()=>{const s=document.querySelector("#search-mode");s.value="name";s.dispatchEvent(new Event("change"));})()');
    await fill('#search-q', 'asha rao');
    await wait('document.querySelector("#result-line").textContent.includes("asha rao")', 'exact line');
    assert.equal(await count('#register-table tbody tr'), 0);
    assert.match(await text('#result-line'), /No student named exactly “asha rao”/);
    await ev('(()=>{const s=document.querySelector("#search-mode");s.value="id";s.dispatchEvent(new Event("change"));})()');
    await fill('#search-q', 'S004');
    await wait('document.querySelectorAll("#register-table tbody tr").length===1', 'one by id');
    await clickText('#result-line button', 'Clear search');
    await wait('document.querySelectorAll("#register-table tbody tr").length===5', 'cleared');
  });
  await shot('03-register.png');

  console.log('Add a student');
  await check('"N" opens the add drawer; every problem is shown at once; focus goes to the first', async () => {
    await key('document.body', 'n');
    await wait('document.querySelector("#add-dialog").open', 'drawer open');
    await fill('#add-id', 'S001'); await fill('#add-name', ''); await fill('#add-mark-0', '101'); await fill('#add-mark-1', 'abc');
    await click('#add-form button.primary');
    await wait('document.querySelector("#add-id-error").textContent!==""', 'errors');
    assert.match(await text('#add-id-error'), /already exists/);
    assert.match(await text('#add-name-error'), /Enter the student/);
    assert.match(await text('#add-mark-0-error'), /between 0 and 100/);
    assert.match(await text('#add-mark-1-error'), /whole number/);
    assert.equal(await count('#add-form input[aria-invalid=true]'), 7, 'id, name and five marks are flagged');
    assert.equal(await ev('document.activeElement.id'), 'add-id');
  });
  await shot('04-add-errors.png');
  await check('arrow keys step a mark (Shift for 10) and stay within 0 to 100', async () => {
    await ev('document.querySelector("#add-mark-2").focus()');
    await key('document.activeElement', 'ArrowUp');
    assert.equal(await ev('document.querySelector("#add-mark-2").value'), '0');
    await key('document.activeElement', 'ArrowUp', { shiftKey: true });
    assert.equal(await ev('document.querySelector("#add-mark-2").value'), '10');
    await fill('#add-mark-2', '95');
    await key('document.activeElement', 'ArrowUp', { shiftKey: true });
    assert.equal(await ev('document.querySelector("#add-mark-2").value'), '100');
    await key('document.activeElement', 'ArrowDown');
    assert.equal(await ev('document.querySelector("#add-mark-2").value'), '99');
  });
  await check('"Save and add another" keeps the drawer open; unicode names work', async () => {
    await fill('#add-id', 'S006'); await fill('#add-name', 'Zoë Müller 李雷');
    [70, 65, 80, 55, 90].forEach((m, i) => ev(`document.querySelector("#add-mark-${i}").value="${m}"`));
    await click('#add-form button.secondary');
    await wait('document.querySelector(".toast")', 'toast');
    assert.match(await lastToast(), /Added Zoë Müller 李雷: 72\.00%, pass/);
    assert.equal(await ev('document.querySelector("#add-dialog").open'), true);
    assert.equal(await ev('document.querySelector("#add-id").value'), '');
  });
  await check('"Save student" closes the drawer; the new row is highlighted and the count is 7; HTML in a name stays inert', async () => {
    await fill('#add-id', 'S007'); await fill('#add-name', '<img src=x onerror=alert(1)>');
    for (let i = 0; i < 5; i++) await ev(`document.querySelector("#add-mark-${i}").value="40"`);
    await click('#add-form button.primary');
    await wait('!document.querySelector("#add-dialog").open', 'drawer closed');
    await wait('document.querySelectorAll("#register-table tbody tr").length===7', '7 rows');
    assert.equal(await count('tr.row-new'), 1);
    assert.match(await text('#gauge'), /7 of 100/);
    assert.equal(await count('#main img'), 0);
    assert.ok((await text('#register-table')).includes('<img src=x onerror=alert(1)>'));
  });

  console.log('Report card');
  await check('opening S003 explains why it fails, with a stamp, pass line and circled mark', async () => {
    await ev('[...document.querySelectorAll("button.link")].find(b=>b.textContent==="S003").click()');
    await wait('document.querySelector("#detail-dialog").open', 'drawer');
    assert.match(await text('#detail-body .reason'), /Fails because Computing is below the pass mark of 40, even though the percentage is 87\.80%/);
    assert.equal(await text('#detail-body .stamp'), 'Fail');
    assert.equal(await count('#detail-body .subj'), 5);
    assert.equal(await count('#detail-body .subj .pen'), 1);
    assert.equal(await text('.card-score span'), '87.8');
  });
  await shot('05-report-card.png');
  await check('editing a mark flips the result to Pass, animates the stamp, and updates the table behind', async () => {
    await clickText('#detail-body button', 'Edit marks');
    await wait('document.querySelector("#edit-mark-4")', 'edit form');
    assert.equal(await ev('document.activeElement.id'), 'edit-mark-0');
    await fill('#edit-mark-4', '41');
    await click('#edit-form button.primary');
    await wait('document.querySelector("#detail-body .stamp")?.textContent==="Pass"', 'stamp Pass');
    assert.ok((await ev('document.querySelector("#detail-body .stamp").className')).includes('fresh'));
    assert.match(await lastToast(), /Total 439 to 441, result fail to pass/);
    await wait('[...document.querySelectorAll("#register-table tbody tr")].find(r=>r.textContent.includes("S003"))?.textContent.includes("Pass")', 'row updated');
  });
  await check('a bad mark shows the C engine message inside the drawer and changes nothing', async () => {
    await clickText('#detail-body button', 'Edit marks');
    await wait('document.querySelector("#edit-mark-0")', 'edit form');
    await fill('#edit-mark-0', '999');
    await click('#edit-form button.primary');
    await wait('document.querySelector("#edit-mark-0-error").textContent!==""', 'error');
    assert.match(await text('#edit-mark-0-error'), /between 0 and 100/);
    await click('#detail-body button.ghost');
    assert.equal(await text('#detail-body .card-stats dd'), '441 of 500');
    await ev('document.querySelector("#detail-dialog").close()');
  });
  await check('printing the report card gives one clean page', async () => {
    await ev('[...document.querySelectorAll("button.link")].find(b=>b.textContent==="S004").click()');
    await wait('document.querySelector("#detail-dialog").open', 'drawer');
    await ev('(()=>{const d=document.querySelector("#detail-dialog");d.close();d.show();document.body.classList.add("printing-card");})()');
    await c.sleep(250);
    const pdf = Buffer.from((await c.send('Page.printToPDF', { printBackground: true })).data, 'base64').toString('latin1');
    assert.equal((pdf.match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
    assert.match(await text('.print-only'), /Mark Register report card, printed/);
    await ev('(()=>{document.body.classList.remove("printing-card");const d=document.querySelector("#detail-dialog");d.close();})()');
  });

  console.log('Command palette and shortcuts');
  await go('register', 'document.querySelectorAll("#register-table tbody tr").length===7');
  await check('Ctrl+K opens the palette with pages and actions; typing a name lists students', async () => {
    await key('document', 'k', { ctrlKey: true });
    await wait('document.querySelector("#palette-dialog").open', 'palette');
    await wait('document.querySelectorAll("#palette-list [role=option]").length>=10', 'default commands');
    assert.equal(await ev('document.activeElement.id'), 'palette-q');
    await fill('#palette-q', 'asha');
    await wait('document.querySelectorAll("#palette-list [role=option]").length===2', 'two students');
    assert.ok((await text('#palette-list')).includes('Students'));
    assert.equal(await ev('document.querySelector("#palette-q").getAttribute("aria-activedescendant")'), 'pal-0');
  });
  await shot('06-palette.png');
  await check('arrow keys move the selection and Enter opens that student', async () => {
    await key('document.querySelector("#palette-q")', 'ArrowDown');
    assert.equal(await ev('document.querySelector("#palette-list [aria-selected=true]").id'), 'pal-1');
    await key('document.querySelector("#palette-q")', 'Enter');
    await wait('document.querySelector("#detail-dialog").open', 'detail from palette');
    assert.match(await text('#detail-title'), /Asha Rao/);
    assert.ok((await text('#detail-body')).includes('S005'), 'second result is S005');
    await ev('document.querySelector("#detail-dialog").close()');
  });
  await check('a palette command navigates', async () => {
    await key('document', 'k', { ctrlKey: true });
    await wait('document.querySelector("#palette-dialog").open', 'palette');
    await fill('#palette-q', 'marks');
    await wait('document.querySelectorAll("#palette-list [role=option]").length===1', 'one match');
    await key('document.querySelector("#palette-q")', 'Enter');
    await wait('location.hash==="#marks"', 'hash');
    await wait('document.querySelector("tfoot")', 'marks page');
  });
  await check('G then A goes to the analysis; "?" opens the shortcut list; "/" focuses search', async () => {
    await key('document.body', 'g'); await key('document.body', 'a');
    await wait('location.hash==="#analysis"', 'analysis');
    await key('document.body', '?');
    await wait('document.querySelector("#help-dialog").open', 'help');
    assert.ok(await count('#shortcuts dt') >= 10);
    await ev('document.querySelector("#help-dialog").close()');
    await key('document.body', '/');
    await wait('location.hash==="#register"', 'register');
    await wait('document.activeElement.id==="search-q"', 'search focused');
  });

  console.log('Marks sheet, analysis, ranking');
  await go('marks', 'document.querySelector("tfoot")');
  await check('marks sheet: heat cells, class averages, circled marks', async () => {
    assert.ok(await count('td.heat-cell') > 30);
    assert.equal(await ev('[...document.querySelectorAll("tfoot td")].slice(1).map(e=>e.textContent).join(",")'), '61.43,59.29,60.00,60.71,51.57');
    assert.equal(await count('tbody .pen'), 5, 'S004 has five zeros (S003 now passes)');
  });
  await shot('07-marks.png');
  await go('analysis', 'document.querySelector(".bandbar")');
  await check('analysis: bands, interactive legend, table view, tooltips, no [object] text', async () => {
    assert.equal(await count('.bandrow'), 5);
    assert.equal(await ev('document.querySelectorAll("details.table-view tbody tr").length'), 5);
    await ev('document.querySelector(".legend button").dispatchEvent(new PointerEvent("pointerenter"))');
    assert.equal(await ev('document.querySelector(".bands").className'), 'bands focus-0');
    await ev('document.querySelector(".legend button").dispatchEvent(new PointerEvent("pointerleave"))');
    assert.equal(await ev('document.querySelector(".bands").className'), 'bands');
    assert.match(await ev('document.querySelector(".seg").dataset.tip'), /Maths, marks 0-39: \d students? \(\d+%\)/);
    assert.equal(await ev('document.querySelector(".seg").tabIndex'), 0);
    assert.ok(!(await text('main')).includes('[object'));
    assert.match(await text('.failed-list'), /Below the pass mark in/);
  });
  await shot('08-analysis.png', { full: true });
  await go('ranking', 'document.querySelector("tbody tr")');
  await check('ranking: order, shared ranks (5, 5, then 7) and top rows', async () => {
    assert.equal(await ev('[...document.querySelectorAll("tbody tr")].map(r=>r.children[1].textContent).join(",")'), 'S005,S003,S006,S001,S002,S007,S004');
    assert.equal(await ev('[...document.querySelectorAll("tbody tr")].map(r=>r.children[0].textContent).join(",")'), '1,2,3,4,5,5,7');
    assert.equal(await count('tr.top'), 3);
  });

  console.log('Files');
  await go('files', 'document.querySelector("#save-name")');
  await check('save, clear (with confirmation), load (with confirmation)', async () => {
    await fill('#save-name', 'e2e-demo');
    await click('#save-btn');
    await wait('document.querySelector(".file-list")', 'saved file listed');
    assert.ok((await text('.file-list')).includes('e2e-demo.dat'));
    assert.match(await text('.file-list .meta'), /saved (now|in 0 seconds|\d+ seconds? ago)/);
    await clickText('button.danger', 'Clear all records');
    await wait('document.querySelector("#confirm-dialog").open', 'confirm');
    assert.match(await text('#confirm-text'), /removes 7 records/);
    await click('#confirm-ok');
    await wait('document.querySelector("#gauge").textContent.includes("0 of 100")', 'cleared');
    await clickText('.file-list button', 'Load');
    await wait('document.querySelector("#gauge").textContent.includes("7 of 100")', 'loaded back');
  });
  await check('loading while records exist asks first; Cancel changes nothing', async () => {
    await clickText('.file-list button', 'Load');
    await wait('document.querySelector("#confirm-dialog").open', 'confirm');
    assert.match(await text('#confirm-text'), /replaces the 7 records/);
    await ev('document.querySelector("#confirm-form button[value=cancel]").click()');
    await wait('!document.querySelector("#confirm-dialog").open', 'closed');
    assert.match(await text('#gauge'), /7 of 100/);
  });
  await check('CSV export offers a download that contains the data', async () => {
    await fill('#export-name', 'e2e-summary');
    await click('#export-btn');
    await wait('document.querySelector("a[download]")', 'download link');
    const csv = await (await fetch(BASE + await ev('document.querySelector("a[download]").getAttribute("href")'))).text();
    assert.ok(csv.startsWith('ID,Name,Maths'));
    assert.ok(csv.includes('Zoë Müller 李雷'));
  });
  await shot('09-files.png', { full: true });

  console.log('Theme, motion, mobile');
  await go('overview', 'document.querySelector(".hero-figure")');
  await check('theme toggle switches to dark, remembers it, and updates its label', async () => {
    const before = await ev('document.querySelector("#theme-toggle").getAttribute("aria-label")');
    await click('#theme-toggle');
    assert.notEqual(before, await ev('document.querySelector("#theme-toggle").getAttribute("aria-label")'));
    assert.equal(await ev('document.documentElement.dataset.theme'), 'dark');
    assert.equal(await ev('localStorage.getItem("theme")'), 'dark');
    assert.equal(await ev('document.querySelector("#theme-toggle").getAttribute("aria-pressed")'), 'true');
    assert.equal(await ev('getComputedStyle(document.querySelector("main")).backgroundColor'), 'rgb(18, 26, 43)');
    await shot('10-dark.png', { full: true });
    await click('#theme-toggle');
    assert.equal(await ev('document.documentElement.dataset.theme'), 'light');
  });
  await check('reduced motion: no animations, pen circles fully drawn immediately', async () => {
    const expected = (await api('GET', '/api/summary')).averagePercentage.toFixed(1);
    try {
      await c.viewport(1440, 900, { reduce: true });
      await c.goto(`${BASE}/?rm=${Date.now()}#overview`);
      await wait('document.querySelector(".mini-list.attn .pen-ring path")', 'rings');
      assert.equal(await ev('getComputedStyle(document.querySelector(".mini-list.attn .pen-ring path")).strokeDashoffset'), '0px');
      await wait(`document.querySelector(".hero-figure span").textContent==="${expected}"`, 'figure without count-up', 800);
    } finally {
      await c.viewport(1440, 900);
    }
  });
  await check('mobile: bottom navigation, short labels, no sideways scrolling, full-width drawer', async () => {
    try {
      await c.viewport(390, 844, { mobile: true });
      await c.goto(`${BASE}/?mob=${Date.now()}#marks`);
      await wait('document.querySelector("tfoot")', 'marks');
      assert.ok(await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'page scrolls sideways');
      const nav = await ev('(()=>{const r=document.querySelector("#nav").getBoundingClientRect();return {bottom:Math.round(r.bottom),h:window.innerHeight,pos:getComputedStyle(document.querySelector("#nav")).position}})()');
      assert.equal(nav.pos, 'fixed');
      assert.equal(nav.bottom, nav.h);
      assert.equal(await ev('[...document.querySelectorAll("#nav .ns")].map(e=>e.textContent).join(",")'), 'Overview,Register,Marks,Analysis,Ranking,Files');
      assert.equal(await ev('getComputedStyle(document.querySelector("#nav .nl")).display'), 'none');
      assert.equal(await ev('getComputedStyle(document.querySelector("#palette-open-mobile")).display'), 'flex');
      await shot('11-mobile-marks.png', { full: true });
      await c.goto(`${BASE}/?mob=${Date.now()}#register`);
      await wait('document.querySelector("#register-table table")', 'register');
      await ev('[...document.querySelectorAll("button.link")].find(b=>b.textContent==="S003").click()');
      await wait('document.querySelector("#detail-dialog").open', 'sheet');
      await c.sleep(450);
      assert.equal(await ev('Math.round(document.querySelector("#detail-dialog").getBoundingClientRect().width)'), 390);
      await shot('12-mobile-card.png');
      await ev('document.querySelector("#detail-dialog").close()');
      await c.viewport(1440, 900);

    } finally {
      await c.viewport(1440, 900);
    }
  });
  await check('on desktop the mobile-only search button is hidden', async () => {
    await c.goto(`${BASE}/?desk=${Date.now()}#overview`);
    await wait('document.querySelector(".hero-figure")', 'overview');
    assert.equal(await ev('getComputedStyle(document.querySelector("#palette-open-mobile")).display'), 'none');
  });

  console.log('Empty states');
  await check('every page has a helpful empty state with a way forward', async () => {
    await api('POST', '/api/clear', {});
    for (const [view, title] of [['overview', /register is empty/], ['register', /No students yet/], ['marks', /Nothing to show/], ['analysis', /Nothing to analyse/], ['ranking', /No students to rank/]]) {
      await go(view, 'document.querySelector(".empty")');
      assert.match(await text('.empty h2'), title, view);
      assert.ok((await text('.empty')).includes('Add a student') && (await text('.empty')).includes('Load example students'), view);
    }
  });
  await check('no console errors, no uncaught exceptions, no CSP violations', async () => {
    const bad = c.events.filter((e) =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level) && !/status of 422/.test(e.params.entry.text)) ||
      (e.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(e.params.type)));
    assert.equal(bad.length, 0, JSON.stringify(bad.map((e) => e.params.entry?.text || e.params.exceptionDetails?.text || e.params.args?.[0]?.value)).slice(0, 400));
  });

  await c.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} checks passed, ${problems.length} failed${problems.length ? ': ' + problems.join('; ') : ''}`);
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('ABORTED', e); process.exit(2); });
