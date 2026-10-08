/* Analysis: highest and lowest, marks by band, pass and fail. */
import { h, fill, icon, plural } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state } from '../lib/state.js';
import { pageHead, meter, emptyState, setCount, stamp, penMark, markValue } from '../lib/ui.js';
import { openAdd, openDetailById, loadExamples } from '../lib/drawers.js';

const pct = (v) => `${v.toFixed(2)}%`;

function holders(list, limit = 4) {
  const shown = list.slice(0, limit).map((s) => `${s.id} ${s.name}`).join(', ');
  return list.length > limit ? `${shown} and ${list.length - limit} more` : shown;
}

function extremesSection(ex) {
  const info = state.info;
  const maxTotal = info.subjects.length * info.maxMark;
  const rows = [h('tr', {},
    h('th', { scope: 'row', text: 'Overall total' }),
    h('td', { class: 'holders' }, h('b', { text: `${ex.highest.total} of ${maxTotal}` }), ` (${pct(ex.highest.percentage)})`),
    h('td', { class: 'holders', text: holders(ex.highest.students) }),
    h('td', { class: 'holders' }, h('b', { text: `${ex.lowest.total} of ${maxTotal}` }), ` (${pct(ex.lowest.percentage)})`),
    h('td', { class: 'holders', text: holders(ex.lowest.students) }))];
  ex.subjects.forEach((s, i) => rows.push(h('tr', {},
    h('th', { scope: 'row', text: s.name }),
    h('td', { class: 'holders' }, h('b', { text: String(s.highest.mark) })), h('td', { class: 'holders', text: holders(s.highest.students) }),
    h('td', { class: 'holders' }, markValue(s.lowest.mark, i)), h('td', { class: 'holders', text: holders(s.lowest.students) }))));
  return h('section', { class: 'section' },
    h('h2', { text: 'Highest and lowest' }),
    h('p', { class: 'lede', text: 'Students who share a top or bottom result are all listed.' }),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), h('th', { scope: 'col', text: 'Highest' }), h('th', { scope: 'col', text: 'Held by' }), h('th', { scope: 'col', text: 'Lowest' }), h('th', { scope: 'col', text: 'Held by' }))),
      h('tbody', {}, rows))));
}

function frequencySection(freq) {
  const info = state.info;
  const total = freq.count;
  const bands = h('div', { class: 'bands' });

  const setFocus = (band) => { bands.className = band === null ? 'bands' : `bands focus-${band}`; };
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'Mark bands. Hover or focus one to highlight it.' }, info.bands.map((band, i) =>
    h('button', {
      type: 'button', 'aria-label': `Highlight marks ${band}`,
      onpointerenter: () => setFocus(i), onpointerleave: () => setFocus(null), onfocus: () => setFocus(i), onblur: () => setFocus(null),
    }, h('i', { class: `band-${i}` }), i === 0 ? `${band} (below the pass mark)` : band)));

  freq.subjects.forEach((s, rowIndex) => {
    const bar = h('div', { class: 'bandbar', role: 'img', 'aria-label': `${s.name}: ${s.counts.map((c, i) => `${c} in ${info.bands[i]}`).join(', ')}` });
    s.counts.forEach((count, i) => {
      if (count === 0) return;
      const share = (count * 100) / total;
      const seg = h('div', {
        class: `seg band-${i}`, tabindex: '0',
        'data-tip': `${s.name}, marks ${info.bands[i]}: ${plural(count, 'student')} (${share.toFixed(0)}%)`,
        text: share >= 9 ? String(count) : null,
      });
      seg.style.flex = `${count} 1 0`;
      seg.style.setProperty('--i', String(rowIndex));
      bar.append(seg);
    });
    bands.append(h('div', { class: 'bandrow' }, h('span', { class: 'label', text: s.name }), bar));
  });

  const tableView = h('details', { class: 'table-view' },
    h('summary', { text: 'Show the same numbers as a table' }),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Subject' }), info.bands.map((b) => h('th', { scope: 'col', class: 'num', text: b })), h('th', { scope: 'col', class: 'num', text: 'Students' }))),
      h('tbody', {}, freq.subjects.map((s) => h('tr', {}, h('th', { scope: 'row', text: s.name }),
        s.counts.map((c) => h('td', { class: 'num', text: String(c) })), h('td', { class: 'num', text: String(s.counts.reduce((a, b) => a + b, 0)) })))))));

  return h('section', { class: 'section' },
    h('h2', { text: 'Marks by band' }),
    h('p', { class: 'lede', text: `How many students scored in each range. Each bar is one subject and adds up to ${plural(total, 'student')}.` }),
    legend, bands, tableView);
}

function summarySection(sum) {
  const failed = sum.failedStudents.map((s) => h('li', {},
    h('span', {}, stamp(false)),
    h('span', {}, h('button', { type: 'button', class: 'link', text: s.name, onclick: () => openDetailById(s.id) }), h('span', { class: 'muted', text: `  ID ${s.id}, ${pct(s.percentage)}` })),
    h('span', { class: 'why' }, 'Below the pass mark in ', s.belowPass.map((b, i) => [i > 0 ? ', ' : '', `${b.subject} `, penMark(b.mark, i)]))));
  return h('section', { class: 'section' },
    h('h2', { text: 'Pass and fail' }),
    h('p', { class: 'lede', text: `${sum.passPercentage.toFixed(2)}% of the class passed.` }),
    meter(sum.passed, sum.failed),
    sum.failed === 0 ? h('p', { class: 'chart-note', text: 'No student has failed.' }) : h('ul', { class: 'failed-list' }, failed));
}

export async function renderAnalysis(main) {
  const [ex, freq, sum] = await Promise.all([get('/api/extremes'), get('/api/frequency'), get('/api/summary')]);
  setCount(sum.count);
  if (ex.empty) {
    fill(main, pageHead('Analysis'), emptyState({
      title: 'Nothing to analyse yet',
      text: 'Add students to see highest and lowest results, mark bands and pass rates.',
      actions: [h('button', { type: 'button', class: 'btn primary', onclick: openAdd }, icon('plus'), 'Add a student'),
        h('button', { type: 'button', class: 'btn secondary', onclick: loadExamples }, icon('sparkle'), 'Load example students')],
    }));
    return;
  }
  fill(main, pageHead('Analysis', 'How the class is doing, calculated from the marks in the register.'),
    extremesSection(ex), frequencySection(freq), summarySection(sum));
}
