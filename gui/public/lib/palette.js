/* Command palette: jump to a page, run an action, or open a student. */
import { $, h, fill, icon } from './dom.js';
import { get } from './api.js';
import { openAdd, openDetail, loadExamples } from './drawers.js';

const PAGES = [
  ['overview', 'Overview', 'g o'], ['register', 'Register', 'g r'], ['marks', 'Marks sheet', 'g m'],
  ['analysis', 'Analysis', 'g a'], ['ranking', 'Ranking', 'g k'], ['files', 'Files', 'g f'],
];

export function initPalette({ goTo, toggleTheme, showHelp }) {
  const dialog = $('#palette-dialog');
  const input = $('#palette-q');
  const list = $('#palette-list');
  let items = [];
  let active = 0;
  let token = 0;
  let timer = 0;

  const commands = () => [
    ...PAGES.map(([key, label, hint]) => ({ group: 'Go to', label, icon: key, hint, run: () => goTo(key) })),
    { group: 'Actions', label: 'Add a student', icon: 'plus', hint: 'N', run: openAdd },
    { group: 'Actions', label: 'Load example students', icon: 'sparkle', run: loadExamples },
    { group: 'Actions', label: 'Switch theme', icon: 'sun', run: toggleTheme },
    { group: 'Actions', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: showHelp },
  ];

  function render() {
    const nodes = [];
    let group = null;
    items.forEach((item, i) => {
      if (item.group !== group) {
        group = item.group;
        nodes.push(h('li', { class: 'pal-group', role: 'presentation', text: group }));
      }
      const li = h('li', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === active) },
        icon(item.icon, 18),
        h('span', { class: 'pal-text' }, item.label, item.detail ? h('small', { text: item.detail }) : null),
        item.hint ? h('span', { class: 'kbd', text: item.hint }) : null);
      li.addEventListener('click', () => run(i));
      li.addEventListener('pointermove', () => { if (active !== i) { active = i; mark(); } });
      nodes.push(li);
    });
    if (items.length === 0) nodes.push(h('li', { class: 'pal-empty', role: 'presentation', text: 'No matches. Try a student’s name or ID.' }));
    fill(list, nodes);
    input.setAttribute('aria-activedescendant', items.length ? `pal-${active}` : '');
  }

  function mark() {
    list.querySelectorAll('[role="option"]').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  async function update() {
    const q = input.value.trim();
    const mine = ++token;
    let students = [];
    if (q) {
      try {
        const [byName, byId] = await Promise.all([
          get(`/api/search?mode=partial&q=${encodeURIComponent(q)}`), get(`/api/search?mode=id&q=${encodeURIComponent(q)}`)]);
        const seen = new Set();
        students = [...byId.students, ...byName.students].filter((s) => !seen.has(s.id) && seen.add(s.id)).slice(0, 6)
          .map((s) => ({ group: 'Students', label: s.name, detail: `ID ${s.id}, ${s.percentage.toFixed(1)}%`, icon: 'user', run: () => openDetail(s) }));
      } catch { /* the page shows connection problems elsewhere */ }
      if (mine !== token) return;
    }
    const needle = q.toLowerCase();
    items = [...students, ...commands().filter((c) => !q || c.label.toLowerCase().includes(needle))];
    active = 0;
    render();
  }

  function run(i) {
    const item = items[i];
    if (!item) return;
    dialog.close();
    item.run();
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 110); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      mark();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  return {
    open() {
      if (dialog.open) return;
      input.value = '';
      dialog.showModal();
      update();
      input.focus();
    },
    toggle() { if (dialog.open) dialog.close(); else this.open(); },
  };
}
