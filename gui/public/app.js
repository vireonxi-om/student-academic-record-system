/* Mark Register - browser side.
 * Every number shown comes from the C program through /api/*.
 * Modules: lib/ (helpers, drawers, palette) and views/ (one file per page). */
import { $, $$, h, fill, icon, hydrateIcons, reducedMotion } from './lib/dom.js';
import { get } from './lib/api.js';
import { state } from './lib/state.js';
import { initTooltips, pageHead, setCount, skeletonRows } from './lib/ui.js';
import { initAddForm, openAdd } from './lib/drawers.js';
import { initPalette } from './lib/palette.js';
import { renderOverview } from './views/overview.js';
import { renderRegister, focusSearch } from './views/register.js';
import { renderMarks } from './views/marks.js';
import { renderAnalysis } from './views/analysis.js';
import { renderRanking } from './views/ranking.js';
import { renderFiles } from './views/files.js';

const VIEWS = {
  overview: { label: 'Overview', icon: 'overview', render: renderOverview },
  register: { label: 'Register', icon: 'register', render: renderRegister },
  marks: { label: 'Marks sheet', short: 'Marks', icon: 'marks', render: renderMarks },
  analysis: { label: 'Analysis', icon: 'analysis', render: renderAnalysis },
  ranking: { label: 'Ranking', icon: 'ranking', render: renderRanking },
  files: { label: 'Files', icon: 'files', render: renderFiles },
};
const GO_KEYS = { o: 'overview', r: 'register', m: 'marks', a: 'analysis', k: 'ranking', f: 'files' };
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/* ------------------------------------------------------------------ */
/* Navigation and routing                                              */
/* ------------------------------------------------------------------ */
function buildNav() {
  fill($('#nav'), Object.entries(VIEWS).map(([key, v]) => h('a', { href: `#${key}`, 'data-view': key },
    icon(v.icon, 19), h('span', { class: 'nl', text: v.label }), h('span', { class: 'ns', text: v.short || v.label }),
    key === 'register' ? h('span', { class: 'nav-badge', 'data-badge': 'register', text: '0' }) : null)));
}

let routeToken = 0;
let enterTimer = 0;

async function route({ enter = true, focusTitle = false } = {}) {
  const wanted = (location.hash || '#overview').slice(1);
  const key = VIEWS[wanted] ? wanted : 'overview';
  const main = $('#main');
  const token = ++routeToken;
  $$('#nav a').forEach((a) => { if (a.dataset.view === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = `${VIEWS[key].label} - Mark Register`;

  const paint = async () => {
    if (enter) { main.classList.add('enter'); clearTimeout(enterTimer); enterTimer = setTimeout(() => main.classList.remove('enter'), 2600); }
    try {
      await VIEWS[key].render(main);
    } catch (error) {
      fill(main, pageHead('Something went wrong'), h('p', { class: 'banner', text: error.message }));
    }
    if (token === routeToken && focusTitle) $('#view-title')?.focus({ preventScroll: true });
  };
  if (enter && document.startViewTransition && !reducedMotion()) {
    // A transition that is skipped (fast navigation) rejects these promises; that is harmless.
    const transition = document.startViewTransition(paint);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    await transition.updateCallbackDone.catch(() => {});
  } else {
    await paint();
  }
}

function goTo(key) {
  if (location.hash === `#${key}`) return route({ enter: false, focusTitle: true });
  location.hash = key;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = () => document.documentElement.dataset.theme || (systemDark() ? 'dark' : 'light');

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  const dark = currentTheme() === 'dark';
  const button = $('#theme-toggle');
  fill(button, icon(dark ? 'sun' : 'moon', 19));
  button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  button.setAttribute('aria-pressed', String(dark));
  button.dataset.tip = dark ? 'Switch to light mode' : 'Switch to dark mode';
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#090e1b' : '#0d1424');
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch { /* private mode */ }
  applyTheme(next);
}

/* ------------------------------------------------------------------ */
/* Shortcuts help                                                      */
/* ------------------------------------------------------------------ */
function showHelp() {
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows = [
    [[mod, 'K'], 'Search students, jump to a page or run an action'],
    [['/'], 'Search the register'],
    [['N'], 'Add a student'],
    [['G', 'then O'], 'Go to the overview'],
    [['G', 'then R'], 'Go to the register'],
    [['G', 'then M'], 'Go to the marks sheet'],
    [['G', 'then A'], 'Go to the analysis'],
    [['G', 'then K'], 'Go to the ranking'],
    [['G', 'then F'], 'Go to the files'],
    [['?'], 'Show this list'],
    [['Esc'], 'Close the open panel'],
  ];
  fill($('#shortcuts'), rows.map(([keys, text]) => [
    h('dt', {}, keys.map((k) => h('kbd', { class: 'kbd', text: k }))), h('dd', { text })]));
  $('#help-dialog').showModal();
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */
async function start() {
  hydrateIcons();
  // The rough-ink stamp filter is verified in Chromium; keep stamps plain in Apple's WebKit (Safari).
  if (/^Apple/.test(navigator.vendor) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent)) document.documentElement.classList.add('no-ink');
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch { /* ignore */ }
  applyTheme(saved === 'light' || saved === 'dark' ? saved : null);
  buildNav();
  initTooltips();
  fill($('#main'), pageHead('Mark Register'), skeletonRows(5));
  $('#palette-key').textContent = isMac ? '⌘ K' : 'Ctrl K';

  document.addEventListener('engine', (e) => {
    const el = $('#engine');
    el.className = `engine${e.detail.online ? '' : ' off'}`;
    el.lastElementChild.textContent = e.detail.online ? 'C engine online' : 'Server not reachable';
  });

  try {
    state.info = await get('/api/info');
  } catch (error) {
    fill($('#main'), pageHead('Cannot reach the server'), h('p', { class: 'banner', text: error.message }));
    return;
  }
  $$('[data-max-mark]').forEach((el) => { el.textContent = String(state.info.maxMark); });
  $$('[data-pass-mark]').forEach((el) => { el.textContent = String(state.info.passMark); });
  setCount(0);

  const palette = initPalette({ goTo, toggleTheme, showHelp });
  initAddForm();

  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#add-open').addEventListener('click', openAdd);
  $('#palette-open').addEventListener('click', () => palette.open());
  $('#palette-open-mobile').addEventListener('click', () => palette.open());
  $('#help-open').addEventListener('click', showHelp);
  window.addEventListener('hashchange', () => route({ focusTitle: true }));
  document.addEventListener('register:changed', () => route({ enter: false }));

  /* close buttons and backdrop clicks */
  document.addEventListener('click', (event) => {
    const closer = event.target.closest?.('[data-close]');
    if (closer) closer.closest('dialog')?.close();
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && ['detail-dialog', 'help-dialog'].includes(dialog.id)) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    }
  });

  /* keyboard shortcuts */
  let goPending = 0;
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette.toggle(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (typing || document.querySelector('dialog[open]')) return;
    if (goPending) {
      goPending = 0;
      const key = GO_KEYS[event.key.toLowerCase()];
      if (key) { event.preventDefault(); goTo(key); }
      return;
    }
    if (event.key === 'g') { goPending = 1; setTimeout(() => { goPending = 0; }, 900); }
    else if (event.key === 'n') { event.preventDefault(); openAdd(); }
    else if (event.key === '/') {
      event.preventDefault();
      if (!focusSearch()) { location.hash = 'register'; setTimeout(focusSearch, 450); }
    } else if (event.key === '?') { event.preventDefault(); showHelp(); }
  });

  await route({ focusTitle: false });
}

start();
