/* Shared interface pieces: the red pen, stamps, meters, toasts, tooltips, empty states. */
import { $, h, svg, fill, icon, plural, reducedMotion } from './dom.js';
import { state } from './state.js';

/* ------------------------------------------------------------------ */
/* The red pen                                                         */
/* ------------------------------------------------------------------ */
const RING_PATH = 'M52 7C44 1 17 0 8 11C-1 22 12 33 33 32C55 31 64 17 55 8C50 3 38 2 25 4';
const TILTS = [-4, 2, -2, 3, -5, 1, -3, 4];

/** A number circled in red pen. `index` staggers the drawing animation and varies the tilt. */
export function penMark(text, index = 0, title) {
  const ring = svg('svg', { class: 'pen-ring', viewBox: '0 0 64 34', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: RING_PATH, pathLength: '1' }));
  const el = h('span', { class: 'pen', title }, String(text), ring);
  el.style.setProperty('--rot', `${TILTS[index % TILTS.length]}deg`);
  el.style.setProperty('--i', String(index % 12));
  return el;
}

/** A mark: circled in red pen when it is below the pass mark. */
export function markValue(value, index = 0) {
  return value < state.info.passMark
    ? penMark(value, index, `Below the pass mark of ${state.info.passMark}`)
    : h('span', { text: String(value) });
}

export const stamp = (pass, { big = false, fresh = false } = {}) =>
  h('span', { class: `stamp ${pass ? 'pass' : 'fail'}${big ? ' big' : ''}${fresh ? ' fresh' : ''}`, text: pass ? 'Pass' : 'Fail' });

/* ------------------------------------------------------------------ */
/* Meter, headings, empty states                                       */
/* ------------------------------------------------------------------ */
export function meter(passed, failed) {
  const total = passed + failed;
  if (total === 0) return null;
  const parts = [];
  if (passed > 0) parts.push(h('span', { class: 'm-pass', 'data-tip': `${plural(passed, 'student')} passed (${((passed * 100) / total).toFixed(1)}%)` }));
  if (failed > 0) parts.push(h('span', { class: 'm-fail', 'data-tip': `${plural(failed, 'student')} failed (${((failed * 100) / total).toFixed(1)}%)` }));
  if (passed > 0) parts[0].style.flex = `${passed} 1 0`;
  if (failed > 0) parts[parts.length - 1].style.flex = `${failed} 1 0`;
  return h('div', {},
    h('div', { class: 'meter', role: 'img', 'aria-label': `${passed} passed and ${failed} failed` }, parts),
    h('div', { class: 'meter-key' },
      h('span', {}, h('i', { class: 'dot pass' }), h('b', { text: String(passed) }), ' passed'),
      h('span', {}, h('i', { class: 'dot fail' }), h('b', { text: String(failed) }), ' failed')));
}

export function pageHead(title, lede) {
  return h('header', { class: 'page-head' }, h('h1', { text: title, tabindex: '-1', id: 'view-title' }), lede ? h('p', { class: 'lede', text: lede }) : null);
}

/** A blank ledger with a pen-circled tick, drawn inline. */
function ledgerArt() {
  return svg('svg', { class: 'art', viewBox: '0 0 190 150', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { x: '10', y: '10', width: '170', height: '130', rx: '16', stroke: 'currentColor', 'stroke-width': '2', opacity: '0.55' }),
    svg('path', { d: 'M46 10v130M52 10v130', stroke: '#f26d6d', 'stroke-width': '1.5', opacity: '0.7' }),
    [42, 62, 82, 102, 122].map((y) => svg('path', { d: `M64 ${y}h98`, stroke: 'currentColor', 'stroke-width': '1.5', opacity: '0.28' })),
    svg('path', { d: 'M70 74l9 9 17-19', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.8' }),
    svg('path', { d: 'M104 55C94 46 66 48 60 66c-5 15 12 27 31 25 21-2 30-17 21-30-4-5-12-8-22-8', stroke: '#f26d6d', 'stroke-width': '2.6', 'stroke-linecap': 'round' }));
}

export function emptyState({ title, text, actions }) {
  return h('div', { class: 'empty' }, ledgerArt(), h('div', {}, h('h2', { text: title }), h('p', { text }), h('div', { class: 'row' }, actions)));
}

export function skeletonRows(n = 5) {
  return h('div', { 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => {
    const row = h('div', { class: 'skeleton' });
    row.style.height = i === 0 ? '18px' : '40px';
    row.style.margin = i === 0 ? '28px 0 14px' : '10px 0';
    row.style.width = i === 0 ? '40%' : '100%';
    return row;
  }));
}

/* ------------------------------------------------------------------ */
/* Number count-up (once per page visit)                               */
/* ------------------------------------------------------------------ */
export function countUp(el, target, { decimals = 1, duration = 1100 } = {}) {
  if (reducedMotion()) { el.textContent = target.toFixed(decimals); return; }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  el.textContent = (0).toFixed(decimals);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = (target * ease(t)).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
export function toast(message, bad = false) {
  const box = $('#toasts');
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = h('div', { class: `toast${bad ? ' bad' : ''}`, role: bad ? 'alert' : 'status' },
    h('span', { class: 't-ico' }, icon(bad ? 'alert' : 'check', 14)), h('span', { text: message }));
  box.append(el);
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 230); };
  setTimeout(close, bad ? 6500 : 3800);
  el.addEventListener('click', close);
}

/* ------------------------------------------------------------------ */
/* Tooltip (pointer and keyboard)                                      */
/* ------------------------------------------------------------------ */
export function initTooltips() {
  const tip = $('#tip');
  const place = (x, y) => {
    const box = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 12), window.innerWidth - box.width - 8);
    const top = y + 24 + box.height > window.innerHeight ? y - box.height - 12 : y + 24;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };
  const show = (target, x, y) => { tip.textContent = target.dataset.tip; tip.hidden = false; place(x, y); };
  document.addEventListener('pointerover', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) show(t, e.clientX, e.clientY); });
  document.addEventListener('pointermove', (e) => { if (!tip.hidden) place(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest?.('[data-tip]')) tip.hidden = true; });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return;
    const box = t.getBoundingClientRect();
    show(t, box.left + box.width / 2, box.top);
  });
  document.addEventListener('focusout', () => { tip.hidden = true; });
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog                                                 */
/* ------------------------------------------------------------------ */
export function confirmDialog({ title, text, okLabel }) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.returnValue = 'cancel';
    dialog.showModal();
  });
}

/* ------------------------------------------------------------------ */
/* Capacity gauge and Register badge                                   */
/* ------------------------------------------------------------------ */
export function setCount(count) {
  state.count = count;
  const cap = state.info.capacity;
  fill($('#gauge'),
    h('div', { class: 'gauge-row' }, h('span', { text: 'Register capacity' }), h('b', { text: `${count} of ${cap}` })),
    h('div', { class: 'gauge-track', role: 'img', 'aria-label': `${count} of ${cap} records used` }, h('i')));
  requestAnimationFrame(() => { $('#gauge .gauge-track i').style.width = `${Math.min(100, (count * 100) / cap)}%`; });
  const badge = $('#nav [data-badge="register"]');
  if (badge) badge.textContent = String(count);
}
