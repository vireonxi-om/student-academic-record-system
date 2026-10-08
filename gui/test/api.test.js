/*
 * gui/test/api.test.js
 * End-to-end tests of the GUI back end: HTTP -> server.js -> student_bridge (C).
 * Expected numbers come from the hand-calculated dataset S001-S005 in
 * docs/proposal.md, not from the program's own output.
 *
 * Run:  make gui-test      (or: node --test gui/test/)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.js');

const BRIDGE = path.join(__dirname, '..', 'student_bridge');
const GUIDE = [
  ['S001', 'Asha Rao', [80, 70, 60, 90, 50]],
  ['S002', 'Ravi Das', [40, 40, 40, 40, 40]],
  ['S003', 'Mina Sen', [100, 100, 100, 100, 39]],
  ['S004', 'Omar Ali', [0, 0, 0, 0, 0]],
  ['S005', 'Asha Rao', [100, 100, 100, 100, 100]],
];

let server;
let base;
let dataDir;

test.before(async () => {
  assert.ok(fs.existsSync(BRIDGE), 'build the bridge first: make gui');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-gui-'));
  server = createServer({ bridgePath: BRIDGE, dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method, url, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + url, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const get = (url) => call('GET', url);
const post = (url, body) => call('POST', url, body ?? {});
const add = (id, name, marks) => post('/api/students', { id, name, marks });

async function loadGuide() {
  await post('/api/clear');
  for (const [id, name, marks] of GUIDE) {
    const r = await add(id, name, marks);
    assert.equal(r.status, 200, `adding ${id}: ${r.text}`);
  }
}

/* ------------------------------------------------------------------ */

test('info describes the rules in force', async () => {
  const r = await get('/api/info');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.subjects, ['Maths', 'Physics', 'Chemistry', 'English', 'Computing']);
  assert.equal(r.json.passMark, 40);
  assert.equal(r.json.maxMark, 100);
  assert.equal(r.json.capacity, 100);
  assert.deepEqual(r.json.bands, ['0-39', '40-59', '60-79', '80-100']);
});

test('empty register: every report is safe', async () => {
  await post('/api/clear');
  assert.equal((await get('/api/students')).json.count, 0);
  assert.equal((await get('/api/extremes')).json.empty, true);
  const summary = (await get('/api/summary')).json;
  assert.equal(summary.passPercentage, null);
  assert.equal(summary.averagePercentage, null);
  assert.equal(summary.passed + summary.failed, 0);
  assert.deepEqual((await get('/api/ranking')).json.ranking, []);
  assert.equal((await get('/api/marks')).json.classAverage[0], null);
  assert.equal((await get('/api/search?mode=partial&q=x')).json.found, false);
});

test('adding the guide dataset gives the hand-calculated results', async () => {
  await post('/api/clear');
  const expected = [
    [350, 70.0, 70.0, true], [200, 40.0, 40.0, true], [439, 87.8, 87.8, false],
    [0, 0, 0, false], [500, 100, 100, true],
  ];
  for (let i = 0; i < GUIDE.length; i++) {
    const [id, name, marks] = GUIDE[i];
    const r = await add(id, name, marks);
    const s = r.json.student;
    const [total, average, percentage, pass] = expected[i];
    assert.equal(r.status, 200);
    assert.equal(s.id, id);
    assert.equal(s.total, total, `${id} total`);
    assert.equal(s.average, average, `${id} average`);
    assert.equal(s.percentage, percentage, `${id} percentage`);
    assert.equal(s.pass, pass, `${id} pass`);
  }
  const s3 = (await get('/api/search?mode=id&q=S003')).json.students[0];
  assert.deepEqual(s3.failedSubjects, [4], 'S003 fails only in Computing');
  assert.equal((await get('/api/students')).json.count, 5);
});

test('validation: every bad input is rejected with a useful message and nothing changes', async () => {
  await loadGuide();
  const cases = [
    [['S001', 'Dup Name', [1, 1, 1, 1, 1]], 'id', /already exists/],
    [['', 'No Id', [1, 1, 1, 1, 1]], 'id', /Enter a student ID/],
    [['S 9', 'Space Id', [1, 1, 1, 1, 1]], 'id', /spaces/],
    [['A'.repeat(20), 'Long Id', [1, 1, 1, 1, 1]], 'id', /at most 19/],
    [['N1', '', [1, 1, 1, 1, 1]], 'name', /Enter the student/],
    [['N2', 'N'.repeat(80), [1, 1, 1, 1, 1]], 'name', /at most 79/],
    [['N3', 'Ok Name', [1, 101, 1, 1, 1]], 'mark1', /between 0 and 100/],
    [['N4', 'Ok Name', [-1, 1, 1, 1, 1]], 'mark0', /between 0 and 100/],
    [['N5', 'Ok Name', [1, 1, 'abc', 1, 1]], 'mark2', /whole number/],
    [['N6', 'Ok Name', [1, 1, 1, '42abc', 1]], 'mark3', /whole number/],
    [['N7', 'Ok Name', [1, 1, 1, 1, '4.5']], 'mark4', /whole number/],
    [['N8', 'Ok Name', [1, 1, 1, 1, '99999999999999999999']], 'mark4', /between 0 and 100/],
    [['N9', 'Ok Name', [1, 1, 1, 1, '']], 'mark4', /whole number/],
  ];
  for (const [[id, name, marks], field, message] of cases) {
    const r = await add(id, name, marks);
    assert.equal(r.status, 422, `${id}/${name.slice(0, 5)} should be rejected: ${r.text}`);
    assert.equal(r.json.field, field, `field for ${id}`);
    assert.match(r.json.error, message);
  }
  assert.equal((await get('/api/students')).json.count, 5, 'count unchanged after every rejection');
  assert.equal((await get('/api/search?mode=id&q=S001')).json.students[0].name, 'Asha Rao', 'original preserved');

  const many = await add('S001', '', [101, 'x', 1, 1, 1]);
  assert.equal(many.status, 422);
  assert.deepEqual(many.json.errors.map((e) => e.field), ['id', 'name', 'mark0', 'mark1'], 'every problem is reported at once');
  assert.equal(many.json.field, 'id', 'the first problem is also exposed as error/field');
  const manyUpdate = await call('PUT', '/api/students', { id: 'S001', marks: [-5, 1, 1, 1, 'abc'] });
  assert.deepEqual(manyUpdate.json.errors.map((e) => e.field), ['mark0', 'mark4']);

  const tab = await add('T1', 'Tab\tName', [1, 1, 1, 1, 1]);
  assert.equal(tab.status, 400);
  const tooFew = await post('/api/students', { id: 'F1', name: 'Few', marks: [1, 2] });
  assert.equal(tooFew.status, 422);
});

test('boundary marks 0 and 100 and exactly 40 are accepted', async () => {
  await post('/api/clear');
  assert.equal((await add('Z', 'Zero', [0, 0, 0, 0, 0])).json.student.pass, false);
  assert.equal((await add('H', 'Hundred', [100, 100, 100, 100, 100])).json.student.pass, true);
  assert.equal((await add('F', 'Forty', [40, 40, 40, 40, 40])).json.student.pass, true);
  assert.equal((await add('T', 'ThirtyNine', [100, 100, 100, 100, 39])).json.student.pass, false);
});

test('capacity: the 100th is accepted and the 101st is refused', async () => {
  await post('/api/clear');
  for (let i = 1; i <= 100; i++) {
    const r = await add(`C${i}`, 'Capacity Test', [50, 50, 50, 50, 50]);
    assert.equal(r.status, 200, `student ${i}`);
  }
  const extra = await add('EXTRA', 'One Too Many', [50, 50, 50, 50, 50]);
  assert.equal(extra.status, 422);
  assert.match(extra.json.error, /full/);
  assert.equal((await get('/api/students')).json.count, 100);
  const freq = (await get('/api/frequency')).json;
  assert.ok(freq.subjects.every((s) => s.counts.reduce((a, b) => a + b, 0) === 100));
});

test('summary, frequency, extremes, marks and ranking match the guide', async () => {
  await loadGuide();

  const summary = (await get('/api/summary')).json;
  assert.equal(summary.passed, 3);
  assert.equal(summary.failed, 2);
  assert.equal(summary.passPercentage, 60);
  assert.equal(summary.averagePercentage, 59.56, 'mean of the five percentages: (70+40+87.8+0+100)/5');
  const mina = summary.failedStudents.find((s) => s.id === 'S003');
  assert.deepEqual(mina.belowPass, [{ subject: 'Computing', mark: 39 }]);

  const freq = (await get('/api/frequency')).json;
  assert.deepEqual(freq.subjects[0].counts, [1, 1, 0, 3], 'Maths bands');
  assert.deepEqual(freq.subjects[4].counts, [2, 2, 0, 1], 'Computing bands');
  for (const s of freq.subjects) assert.equal(s.counts.reduce((a, b) => a + b, 0), 5);

  const ex = (await get('/api/extremes')).json;
  assert.equal(ex.highest.total, 500);
  assert.deepEqual(ex.highest.students.map((s) => s.id), ['S005']);
  assert.equal(ex.lowest.total, 0);
  assert.deepEqual(ex.lowest.students.map((s) => s.id), ['S004']);
  assert.deepEqual(ex.subjects[0].highest.students.map((s) => s.id), ['S003', 'S005'], 'ties are all listed');
  assert.deepEqual(ex.subjects[4].highest.students.map((s) => s.id), ['S005']);

  const marks = (await get('/api/marks')).json;
  assert.deepEqual(marks.classAverage, [64, 62, 60, 66, 45.8]);

  const rank = (await get('/api/ranking')).json.ranking;
  assert.deepEqual(rank.map((r) => r.student.id), ['S005', 'S003', 'S001', 'S002', 'S004']);
  assert.deepEqual(rank.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

test('ranking: tied totals share a rank and the next rank is skipped', async () => {
  await post('/api/clear');
  await add('A', 'Low', [10, 10, 10, 10, 10]);
  await add('B', 'High', [90, 90, 90, 90, 90]);
  await add('C', 'Tie1', [70, 70, 70, 70, 70]);
  await add('D', 'Tie2', [70, 70, 70, 70, 70]);
  const rank = (await get('/api/ranking')).json.ranking;
  assert.deepEqual(rank.map((r) => [r.student.id, r.rank]), [['B', 1], ['C', 2], ['D', 2], ['A', 4]]);
  const tie = (await add('E', 'Top', [90, 90, 90, 90, 90]));
  assert.equal(tie.status, 200);
  const ex = (await get('/api/extremes')).json;
  assert.deepEqual(ex.highest.students.map((s) => s.id), ['B', 'E'], 'tied highest are both listed');
});

test('search: ID, exact name (case-sensitive) and partial name (case-insensitive)', async () => {
  await loadGuide();
  const byId = (await get('/api/search?mode=id&q=S004')).json;
  assert.equal(byId.found, true);
  assert.equal(byId.students[0].name, 'Omar Ali');
  assert.equal((await get('/api/search?mode=id&q=S999')).json.found, false);
  assert.equal((await get('/api/search?mode=id&q=s001')).json.found, false, 'ID search is case-sensitive');

  const exact = (await get('/api/search?mode=name&q=' + encodeURIComponent('Asha Rao'))).json;
  assert.deepEqual(exact.students.map((s) => s.id), ['S001', 'S005']);
  assert.equal((await get('/api/search?mode=name&q=asha%20rao')).json.found, false);

  assert.equal((await get('/api/search?mode=partial&q=ASHA')).json.students.length, 2);
  assert.equal((await get('/api/search?mode=partial&q=sen')).json.students.length, 1);
  assert.equal((await get('/api/search?mode=partial&q=zzz')).json.found, false);
  assert.equal((await get('/api/search?mode=partial&q=')).json.count, 5, 'empty query lists everyone');
  assert.equal((await get('/api/search?mode=bogus&q=x')).status, 400);
  assert.equal((await get('/api/students')).json.count, 5, 'searching changes nothing');
});

test('update: marks change, the result is recalculated, bad input changes nothing', async () => {
  await loadGuide();
  const r = await call('PUT', '/api/students', { id: 'S003', marks: [100, 100, 100, 100, 40] });
  assert.equal(r.status, 200);
  assert.equal(r.json.before.pass, false);
  assert.equal(r.json.before.total, 439);
  assert.equal(r.json.student.total, 440);
  assert.equal(r.json.student.pass, true);
  assert.equal((await get('/api/summary')).json.passed, 4);

  const bad = await call('PUT', '/api/students', { id: 'S003', marks: [1, 2, 3, 4, 101] });
  assert.equal(bad.status, 422);
  assert.equal((await get('/api/search?mode=id&q=S003')).json.students[0].total, 440, 'unchanged');
  assert.equal((await call('PUT', '/api/students', { id: 'NOPE', marks: [1, 1, 1, 1, 1] })).status, 422);
});

test('files: save, clear, load, export, download and rejection of unsafe names', async () => {
  await loadGuide();
  await add('S006', 'Rao, Asha "A"', [10, 20, 30, 40, 50]);

  const saved = await post('/api/save', { file: 'class' });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.file, 'class.dat');
  assert.ok(fs.existsSync(path.join(dataDir, 'class.dat')));

  await post('/api/clear');
  assert.equal((await get('/api/students')).json.count, 0);
  const loaded = await post('/api/load', { file: 'class.dat' });
  assert.equal(loaded.json.count, 6);
  assert.equal((await get('/api/search?mode=id&q=S006')).json.students[0].name, 'Rao, Asha "A"');

  const files = (await get('/api/files')).json;
  assert.deepEqual(files.saves.map((f) => f.name), ['class.dat']);
  assert.ok(files.saves[0].bytes > 0 && Math.abs(files.saves[0].modified - Date.now()) < 60000, 'size and modified time are reported');

  const exported = await post('/api/export', { file: 'summary' });
  assert.equal(exported.status, 200);
  const csv = await get('/files/summary.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.match(csv.text, /^ID,Name,Maths,Physics,Chemistry,English,Computing,Total,Average,Percentage,Result\n/);
  assert.match(csv.text, /S003,Mina Sen,100,100,100,100,39,439,87\.80,87\.80,Fail/);
  assert.match(csv.text, /S006,"Rao, Asha ""A""",10,20,30,40,50,150,30\.00,30\.00,Fail/);

  fs.writeFileSync(path.join(dataDir, 'bad.dat'), 'garbage\n');
  const bad = await post('/api/load', { file: 'bad.dat' });
  assert.equal(bad.status, 422);
  assert.match(bad.json.error, /not a valid save file/);
  assert.equal((await get('/api/students')).json.count, 6, 'a corrupt file leaves memory untouched');

  assert.equal((await post('/api/load', { file: 'missing.dat' })).status, 422);
  for (const evil of ['../evil', '..\\evil', '/etc/passwd', 'a/b', '.hidden', 'x'.repeat(70), 'bad name']) {
    assert.equal((await post('/api/save', { file: evil })).status, 400, `rejects ${evil}`);
  }
  assert.equal((await get('/files/..%2Fserver.js')).status, 404);
  assert.equal((await get('/files/nothing.csv')).status, 404);
  assert.ok(!fs.existsSync(path.join(dataDir, '..', 'evil.dat')));
});

test('security: foreign Host or Origin, wrong content type, bad JSON and big bodies are refused', async () => {
  const raw = (headers, body, method = 'POST', url = '/api/clear') => new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, path: url, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.end(body);
  });

  assert.equal((await raw({ Host: 'evil.example' }, undefined, 'GET', '/api/info')).status, 403);
  assert.equal((await raw({ Host: new URL(base).host, Origin: 'http://evil.example', 'Content-Type': 'application/json' }, '{}')).status, 403);
  assert.equal((await post('/api/save', undefined)).status, 200, 'default file name is allowed');
  assert.equal((await call('POST', '/api/students', 'id=1', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await call('POST', '/api/students', '{not json')).status, 400);
  assert.equal((await call('POST', '/api/students', JSON.stringify({ id: 'X', name: 'Y'.repeat(40000), marks: [] }))).status, 413);
  assert.equal((await call('POST', '/api/students', '[]')).status, 400);
  assert.equal((await get('/api/nope')).status, 404);
  assert.equal((await call('DELETE', '/api/students')).status, 404);
  const sec = await get('/api/info');
  assert.match(sec.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(sec.headers.get('x-content-type-options'), 'nosniff');
});

test('static files are served only from public/', async () => {
  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.equal((await get('/app.js')).status, 200);
  assert.equal((await get('/style.css')).status, 200);
  assert.equal((await get('/lib/dom.js')).status, 200);
  const font = await get('/fonts/geist-latin.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.equal((await get('/..%2Fserver.js')).status, 404);
  assert.equal((await get('/%2e%2e/server.js')).status, 404);
  assert.equal((await get('/../server.js')).status, 404);
  assert.equal((await get('/missing.html')).status, 404);
  assert.equal((await call('POST', '/')).status, 405);
});

test('if the C bridge dies, the next request restarts it with an empty register', async () => {
  await loadGuide();
  server.bridge.child.kill('SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const r = await get('/api/students');
  assert.equal(r.status, 200);
  assert.equal(r.json.count, 0);
  assert.equal((await add('A1', 'After Restart', [50, 50, 50, 50, 50])).status, 200);
});
