/* Register: every student, with search, filter chips and sortable columns. */
import { $, $$, h, fill, icon, plural } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state } from '../lib/state.js';
import { pageHead, emptyState, setCount, stamp, markValue, skeletonRows } from '../lib/ui.js';
import { openAdd, openDetail, loadExamples } from '../lib/drawers.js';

const NUMERIC = (key) => /^m\d$/.test(key) || key === 'total' || key === 'percent';
const SORTERS = {
  id: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }),
  name: (a, b) => a.name.localeCompare(b.name),
  total: (a, b) => a.total - b.total,
  percent: (a, b) => a.percentage - b.percentage,
  result: (a, b) => Number(a.pass) - Number(b.pass),
};
for (let i = 0; i < 5; i++) SORTERS[`m${i}`] = (a, b) => a.marks[i] - b.marks[i];

let rows = [];          // students returned by the last search
let timer = 0;

function visibleRows() {
  let list = rows;
  if (state.filter === 'pass') list = list.filter((s) => s.pass);
  if (state.filter === 'fail') list = list.filter((s) => !s.pass);
  const { key, dir } = state.sort;
  if (key) {
    list = [...list].sort(SORTERS[key]);
    if (dir === 'desc') list.reverse();
  }
  return list;
}

function header(key, label, extra = '') {
  const active = state.sort.key === key;
  const th = h('th', { scope: 'col', class: extra, 'aria-sort': active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : null },
    h('button', { type: 'button', class: 'th-btn', onclick: () => {
      if (state.sort.key === key) state.sort = { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' };
      else state.sort = { key, dir: NUMERIC(key) ? 'desc' : 'asc' };
      renderTable();
    } }, label, icon(active ? (state.sort.dir === 'asc' ? 'up' : 'down') : 'sort', 14)));
  return th;
}

function studentTable(list) {
  const info = state.info;
  const head = h('tr', {},
    header('id', 'ID'), header('name', 'Name'),
    info.subjects.map((s, i) => header(`m${i}`, s, 'num')),
    header('total', 'Total', 'num'), header('percent', 'Percent', 'num'), header('result', 'Result'));
  const body = list.map((s, r) => {
    const fresh = s.id === state.freshId;
    const tr = h('tr', { class: fresh ? 'row-new' : null },
      h('td', { class: 'id' }, h('button', { type: 'button', class: 'link', text: s.id, 'aria-label': `Open report card of ${s.name}, ID ${s.id}`, onclick: () => openDetail(s) })),
      h('td', { class: 'name', text: s.name }),
      s.marks.map((m, i) => {
        const td = h('td', { class: `num databar${m < info.passMark ? ' low' : ''}` }, markValue(m, r * 5 + i));
        td.style.setProperty('--v', String((m * 100) / info.maxMark));
        return td;
      }),
      h('td', { class: 'num', text: String(s.total) }),
      h('td', { class: 'num', text: `${s.percentage.toFixed(2)}%` }),
      h('td', {}, stamp(s.pass, { fresh })));
    return tr;
  });
  return h('div', { class: 'table-wrap' }, h('table', {}, h('caption', { class: 'sr-only', text: 'Students and their results' }), h('thead', {}, head), h('tbody', {}, body)));
}

function chip(key, label, count) {
  return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; renderTable(); } },
    label, h('span', { class: 'count', text: String(count) }));
}

function renderTable() {
  const holder = $('#register-table');
  if (!holder) return;
  const list = visibleRows();
  const { mode, q } = state.search;

  fill($('#chips'),
    chip('all', 'All', rows.length),
    chip('pass', 'Passing', rows.filter((s) => s.pass).length),
    chip('fail', 'Failing', rows.filter((s) => !s.pass).length));

  const line = $('#result-line');
  if (q !== '') {
    const how = { partial: 'whose name contains', name: 'named exactly', id: 'with ID' }[mode];
    fill(line, rows.length === 0
      ? `No student ${how} “${q}”. `
      : `${plural(rows.length, 'student')} ${how} “${q}”. `,
    h('button', { type: 'button', class: 'link', text: 'Clear search', onclick: () => { $('#search-q').value = ''; state.search.q = ''; load(); } }));
  } else {
    fill(line);
  }

  if (rows.length === 0 && q === '') {
    fill(holder, emptyState({
      title: 'No students yet',
      text: 'Add the first student to start the register, or load the five example students to explore.',
      actions: [
        h('button', { type: 'button', class: 'btn primary', onclick: openAdd }, icon('plus'), 'Add a student'),
        h('button', { type: 'button', class: 'btn secondary', onclick: loadExamples }, icon('sparkle'), 'Load example students'),
      ],
    }));
  } else if (list.length === 0) {
    fill(holder, rows.length === 0 ? null : h('p', { class: 'result-line', text: `No ${state.filter === 'pass' ? 'passing' : 'failing'} students in this list.` }));
  } else {
    fill(holder, studentTable(list));
  }
  if (state.freshId) { const id = state.freshId; setTimeout(() => { if (state.freshId === id) state.freshId = null; }, 2600); }
}

async function load() {
  const { mode, q } = state.search;
  try {
    const data = await get(`/api/search?mode=${mode}&q=${encodeURIComponent(q)}`);
    if (state.search.q !== q || state.search.mode !== mode) return;     // a newer search is running
    rows = data.students;
    renderTable();
  } catch (error) {
    fill($('#register-table'), h('p', { class: 'banner', text: error.message }));
  }
}

export async function renderRegister(main) {
  const summary = await get('/api/summary');
  setCount(summary.count);
  const info = state.info;

  const select = h('select', { id: 'search-mode', 'aria-label': 'Search by' },
    h('option', { value: 'partial', text: 'Name contains' }), h('option', { value: 'name', text: 'Exact name' }), h('option', { value: 'id', text: 'ID' }));
  select.value = state.search.mode;
  const input = h('input', { id: 'search-q', type: 'search', placeholder: 'Search the register', autocomplete: 'off', 'aria-label': 'Search text' });
  input.value = state.search.q;
  const run = () => { state.search = { mode: select.value, q: input.value.trim() }; load(); };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  select.addEventListener('change', run);

  const lede = summary.count === 0
    ? 'Everyone enrolled, with marks, totals and results.'
    : `${plural(summary.count, 'student')}: ${summary.passed} passing and ${summary.failed} failing. A student passes only when every subject is at least ${info.passMark}.`;

  fill(main,
    pageHead('Register', lede),
    h('div', { class: 'toolbar' },
      h('div', { class: 'chips', id: 'chips', role: 'group', 'aria-label': 'Filter by result' }),
      h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); run(); } },
        select, h('div', { class: 'field-wrap' }, icon('search'), input))),
    h('p', { class: 'result-line', id: 'result-line', 'aria-live': 'polite' }),
    h('div', { id: 'register-table' }, skeletonRows(4)));
  await load();
}

export function focusSearch() {
  const el = $('#search-q');
  if (el) { el.focus(); el.select(); return true; }
  return false;
}
