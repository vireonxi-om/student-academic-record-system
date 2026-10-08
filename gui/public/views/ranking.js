/* Ranking: by total marks, ties share a rank. */
import { h, fill, icon } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { pageHead, emptyState, setCount, stamp } from '../lib/ui.js';
import { openAdd, openDetail, loadExamples } from '../lib/drawers.js';

export async function renderRanking(main) {
  const data = await get('/api/ranking');
  setCount(data.count);
  if (data.count === 0) {
    fill(main, pageHead('Ranking'), emptyState({
      title: 'No students to rank',
      text: 'Add students to rank them by total marks.',
      actions: [h('button', { type: 'button', class: 'btn primary', onclick: openAdd }, icon('plus'), 'Add a student'),
        h('button', { type: 'button', class: 'btn secondary', onclick: loadExamples }, icon('sparkle'), 'Load example students')],
    }));
    return;
  }
  const maxTotal = data.ranking[0].student.maxTotal;
  const rows = data.ranking.map(({ rank, student: s }, r) => {
    const fillEl = h('span', { class: 'fill', 'data-tip': `${s.name}: ${s.total} of ${maxTotal}` });
    fillEl.style.width = `${(s.total * 100) / maxTotal}%`;
    const track = h('span', { class: 'track' }, fillEl);
    const tr = h('tr', { class: rank <= 3 ? 'top' : null },
      h('td', { class: 'num' }, h('span', { class: 'rank-n', text: String(rank) })),
      h('td', { class: 'id' }, h('button', { type: 'button', class: 'link', text: s.id, 'aria-label': `Open report card of ${s.name}, ID ${s.id}`, onclick: () => openDetail(s) })),
      h('td', { class: 'name', text: s.name }),
      h('td', {}, h('div', { class: 'rankbar' }, track, h('span', { class: 'val', text: String(s.total) }))),
      h('td', { class: 'num', text: `${s.percentage.toFixed(2)}%` }),
      h('td', {}, stamp(s.pass)));
    tr.style.setProperty('--i', String(r));
    return tr;
  });
  fill(main, pageHead('Ranking', 'Highest total first. Students with the same total share a rank, and the next rank is skipped.'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('caption', { class: 'sr-only', text: 'Students ranked by total marks' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'num', text: 'Rank' }), h('th', { scope: 'col', text: 'ID' }), h('th', { scope: 'col', text: 'Name' }),
        h('th', { scope: 'col', text: `Total (out of ${maxTotal})` }), h('th', { scope: 'col', class: 'num', text: 'Percent' }), h('th', { scope: 'col', text: 'Result' }))),
      h('tbody', {}, rows))));
}
