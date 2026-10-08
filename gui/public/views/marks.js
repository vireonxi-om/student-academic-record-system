/* Marks sheet: every student against every subject, as a heat map. */
import { h, fill, icon } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state } from '../lib/state.js';
import { pageHead, emptyState, setCount, markValue } from '../lib/ui.js';
import { loadExamples, openAdd } from '../lib/drawers.js';

const heatBin = (value) => Math.min(6, Math.floor(value / 15));

export async function renderMarks(main) {
  const data = await get('/api/marks');
  setCount(data.count);
  const info = state.info;

  if (data.count === 0) {
    fill(main, pageHead('Marks sheet'), emptyState({
      title: 'Nothing to show yet',
      text: 'Add students and their marks will appear here, subject by subject.',
      actions: [h('button', { type: 'button', class: 'btn primary', onclick: openAdd }, icon('plus'), 'Add a student'),
        h('button', { type: 'button', class: 'btn secondary', onclick: loadExamples }, icon('sparkle'), 'Load example students')],
    }));
    return;
  }

  const head = h('tr', {}, h('th', { scope: 'col', text: 'ID' }), h('th', { scope: 'col', text: 'Name' }),
    info.subjects.map((s) => h('th', { scope: 'col', class: 'heat-cell', text: s })));
  const rows = data.students.map((s, r) => h('tr', {},
    h('td', { class: 'id', text: s.id }), h('td', { class: 'name', text: s.name }),
    s.marks.map((m, i) => h('td', { class: `heat-cell heat-${heatBin(m)}` }, markValue(m, r * 5 + i)))));
  const averages = h('tr', {}, h('td', { colspan: '2', text: 'Class average' }),
    data.classAverage.map((a) => h('td', { class: `heat-cell heat-${heatBin(a)}` }, h('span', { text: a.toFixed(2) }))));
  const ramp = h('span', { class: 'ramp', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5, 6].map((i) => h('i', { class: `heat-${i}` })));

  fill(main,
    pageHead('Marks sheet', `Every student against every subject. Darker means higher marks, and marks below ${info.passMark} are circled in red pen.`),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('caption', { class: 'sr-only', text: 'Marks by student and subject' }),
      h('thead', {}, head), h('tbody', {}, rows), h('tfoot', {}, averages))),
    h('div', { class: 'heat-key' }, '0', ramp, String(info.maxMark)));
}
