/* Side drawers: add a student, and one student's report card. */
import { $, $$, h, fill, icon } from './dom.js';
import { api, get, post, put, EXAMPLE_STUDENTS } from './api.js';
import { state, changed } from './state.js';
import { toast, penMark, stamp } from './ui.js';

const pct = (v) => `${v.toFixed(2)}%`;

/* ------------------------------------------------------------------ */
/* Mark inputs: select on focus, arrow keys step the value             */
/* ------------------------------------------------------------------ */
function buildMarkFields(container, prefix) {
  fill(container, h('legend', { class: 'sr-only', text: 'Marks' }),
    state.info.subjects.map((subject, i) => h('div', { class: 'field' },
      h('label', { for: `${prefix}-mark-${i}`, text: subject }),
      h('input', { id: `${prefix}-mark-${i}`, name: `mark${i}`, inputmode: 'numeric', autocomplete: 'off', placeholder: `0–${state.info.maxMark}`, 'aria-describedby': `${prefix}-mark-${i}-error` }),
      h('p', { class: 'error', id: `${prefix}-mark-${i}-error`, role: 'alert' }))));
  $$('input', container).forEach((input) => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
      const current = /^-?\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : (step > 0 ? -1 : state.info.maxMark + 1);
      input.value = String(Math.max(0, Math.min(state.info.maxMark, current + step)));
      input.select();
    });
  });
}

function clearErrors(form) {
  $$('.error', form).forEach((p) => { p.textContent = ''; });
  $$('input[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
}

/** Show every server error next to its field; returns the first input to focus. */
function showFieldError(form, prefix, error) {
  const list = error.errors.length > 0 ? error.errors : [{ field: error.field, message: error.message }];
  let first = null;
  for (const item of list) {
    const field = item.field || '';
    const id = field === 'id' ? `${prefix}-id` : field === 'name' ? `${prefix}-name` : /^mark\d$/.test(field) ? `${prefix}-mark-${field.slice(4)}` : null;
    const input = id ? $(`#${id}`, form) : null;
    const slot = input ? $(`#${id}-error`, form) : $('.form-error', form);
    if (slot) slot.textContent = item.message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!first) first = input;
    }
  }
  return first;
}

/* ------------------------------------------------------------------ */
/* Add a student                                                       */
/* ------------------------------------------------------------------ */
export function openAdd() {
  const form = $('#add-form');
  form.reset();
  clearErrors(form);
  buildMarkFields($('#add-marks'), 'add');
  const dialog = $('#add-dialog');
  if (!dialog.open) dialog.showModal();
  $('#add-id').focus();
}

export function initAddForm() {
  $('#add-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const again = event.submitter && event.submitter.dataset.again === '1';
    clearErrors(form);
    const marks = state.info.subjects.map((_, i) => $(`#add-mark-${i}`).value.trim());
    const buttons = $$('button', form);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const data = await post('/api/students', { id: $('#add-id').value, name: $('#add-name').value, marks });
      const s = data.student;
      state.freshId = s.id;
      toast(`Added ${s.name}: ${pct(s.percentage)}, ${s.pass ? 'pass' : 'fail'}`);
      if (again) {
        form.reset();
        $('#add-id').focus();
      } else {
        $('#add-dialog').close();
      }
      changed();
    } catch (error) {
      const input = showFieldError(form, 'add', error);
      if (input) input.focus();
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  });
}

/** Add the five students of the project's hand-calculated test dataset (skips IDs that already exist). */
export async function loadExamples() {
  let added = 0;
  for (const s of EXAMPLE_STUDENTS) {
    try { await post('/api/students', s); added++; } catch (error) { if (error.status !== 422) throw error; }
  }
  toast(added > 0 ? `Added ${added} example ${added === 1 ? 'student' : 'students'}` : 'The example students are already in the register');
  changed();
}

/* ------------------------------------------------------------------ */
/* Report card                                                         */
/* ------------------------------------------------------------------ */
export function openDetail(student, { fresh = false } = {}) {
  state.detail = student;
  renderDetail(false, fresh);
  const dialog = $('#detail-dialog');
  if (!dialog.open) dialog.showModal();
}

export async function openDetailById(id) {
  const data = await get(`/api/search?mode=id&q=${encodeURIComponent(id)}`);
  if (data.students.length > 0) openDetail(data.students[0]);
}

function subjectRow(subject, value, index) {
  const info = state.info;
  const failing = value < info.passMark;
  const fillEl = h('span', { class: 'fill' });
  fillEl.style.width = `${(value * 100) / info.maxMark}%`;
  if (failing) fillEl.style.background = 'var(--pen)';
  const line = h('span', { class: 'passline', 'data-tip': `Pass mark ${info.passMark}` });
  line.style.left = `${(info.passMark * 100) / info.maxMark}%`;
  return h('div', { class: 'subj' },
    h('span', { class: 'label', text: subject }),
    h('span', { class: 'track' }, fillEl, line),
    h('span', { class: 'val' }, failing ? penMark(value, index) : String(value)));
}

function renderDetail(editing, fresh = false) {
  const s = state.detail;
  const info = state.info;
  const body = $('#detail-body');
  const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', 'data-close': '', onclick: () => $('#detail-dialog').close() }, icon('x'));
  const head = h('header', { class: 'drawer-head' },
    h('div', {}, h('h2', { id: 'detail-title', text: s.name }), h('p', { class: 'hint', text: `Student ID ${s.id}` })), close);
  const printLine = h('p', { class: 'print-only', text: `Mark Register report card, printed ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}` });

  if (!editing) {
    const failedNames = s.failedSubjects.map((i) => info.subjects[i]);
    const passedSubjects = info.subjects.length - failedNames.length;
    const content = h('div', { class: 'drawer-body' },
      h('div', { class: 'card-hero' },
        h('div', { class: 'card-score' }, h('span', { text: s.percentage.toFixed(1) }), h('small', { text: 'percent' })),
        stamp(s.pass, { big: true, fresh })),
      h('dl', { class: 'card-stats' },
        h('div', {}, h('dt', { text: 'Total' }), h('dd', { text: `${s.total} of ${s.maxTotal}` })),
        h('div', {}, h('dt', { text: 'Average' }), h('dd', { text: s.average.toFixed(2) })),
        h('div', {}, h('dt', { text: 'Subjects passed' }), h('dd', { text: `${passedSubjects} of ${info.subjects.length}` }))),
      info.subjects.map((subject, i) => subjectRow(subject, s.marks[i], i)),
      s.pass ? null : h('p', { class: 'reason', text: `Fails because ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(failedNames)} ${failedNames.length === 1 ? 'is' : 'are'} below the pass mark of ${info.passMark}${s.percentage >= (info.passMark * 100) / info.maxMark ? `, even though the percentage is ${pct(s.percentage)}` : ''}.` }));
    const foot = h('footer', { class: 'drawer-foot' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => printCard() }, icon('printer'), 'Print report card'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => renderDetail(true) }, icon('pencil'), 'Edit marks'));
    fill(body, printLine, head, content, foot);
    return;
  }

  const form = h('form', { novalidate: true, id: 'edit-form' });
  const set = h('fieldset', { class: 'marks-fields' });
  buildMarkFields(set, 'edit');
  $$('input', set).forEach((input, i) => { input.value = String(s.marks[i]); });
  const content = h('div', { class: 'drawer-body' },
    h('p', { class: 'hint', text: `Change any marks (0–${info.maxMark}). The total and the result are recalculated by the C program when you save.` }),
    set, h('p', { class: 'error form-error', role: 'alert' }));
  const foot = h('footer', { class: 'drawer-foot' },
    h('button', { type: 'button', class: 'btn ghost', onclick: () => renderDetail(false) }, 'Cancel'),
    h('button', { type: 'submit', class: 'btn primary' }, 'Save marks'));
  form.append(content, foot);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(form);
    const marks = info.subjects.map((_, i) => $(`#edit-mark-${i}`, form).value.trim());
    try {
      const data = await put('/api/students', { id: s.id, marks });
      state.detail = data.student;
      state.freshId = s.id;
      const flipped = data.before.pass !== data.student.pass;
      renderDetail(false, flipped);
      toast(`Marks saved. Total ${data.before.total} to ${data.student.total}, result ${data.before.pass ? 'pass' : 'fail'} to ${data.student.pass ? 'pass' : 'fail'}.`);
      changed();
    } catch (error) {
      const input = showFieldError(form, 'edit', error);
      if (input) input.focus();
    }
  });
  fill(body, head, form);
  queueMicrotask(() => { const first = $('input', form); if (first) first.focus(); });
}

/*
 * Print the open report card. A modal dialog lives in the browser's "top layer", which ignores
 * normal page flow when printing, so it is reopened as a plain (non-modal) dialog for the print
 * and restored afterwards.
 */
function printCard() {
  const dialog = $('#detail-dialog');
  dialog.close();
  dialog.show();
  document.body.classList.add('printing-card');
  const done = () => {
    window.removeEventListener('afterprint', done);
    document.body.classList.remove('printing-card');
    dialog.close();
    dialog.showModal();
  };
  window.addEventListener('afterprint', done);
  window.print();
}
