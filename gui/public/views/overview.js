/* Overview: the class at a glance. */
import { h, fill, icon, plural } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { state } from '../lib/state.js';
import { pageHead, meter, emptyState, setCount, countUp, stamp, penMark } from '../lib/ui.js';
import { openAdd, openDetail, openDetailById, loadExamples } from '../lib/drawers.js';

export async function renderOverview(main) {
  const [summary, marks, ranking] = await Promise.all([get('/api/summary'), get('/api/marks'), get('/api/ranking')]);
  const info = state.info;
  setCount(summary.count);

  if (summary.count === 0) {
    fill(main, pageHead('Overview', 'How the class is doing, at a glance.'),
      emptyState({
        title: 'Your register is empty',
        text: 'Add your first student, or load the five example students from the project’s test dataset to explore every page.',
        actions: [
          h('button', { type: 'button', class: 'btn primary', onclick: openAdd }, icon('plus'), 'Add a student'),
          h('button', { type: 'button', class: 'btn secondary', onclick: loadExamples }, icon('sparkle'), 'Load example students'),
        ],
      }));
    return;
  }

  /* hero */
  const figure = h('span', { 'aria-hidden': 'true', text: '0.0' });
  const hero = h('section', { class: 'hero', 'aria-label': 'Class average' },
    h('p', { class: 'hero-label', text: 'Class average' }),
    h('p', { class: 'hero-figure' }, figure, h('span', { class: 'unit', 'aria-hidden': 'true', text: '%' }),
      h('span', { class: 'sr-only', text: `${summary.averagePercentage.toFixed(1)} percent` })),
    h('p', { class: 'hero-sub', text: `Across ${plural(summary.count, 'student')}: ${summary.passed} passed and ${summary.failed} failed. ${summary.passPercentage.toFixed(1)}% of the class is passing.` }),
    meter(summary.passed, summary.failed));
  // count up only when arriving at the page, not on every data refresh
  if (main.classList.contains('enter')) requestAnimationFrame(() => countUp(figure, summary.averagePercentage, { decimals: 1 }));
  else figure.textContent = summary.averagePercentage.toFixed(1);

  /* subject averages with the pass line */
  const rows = info.subjects.map((subject, i) => {
    const avg = marks.classAverage[i];
    const fillEl = h('span', { class: 'fill', 'data-tip': `${subject}: class average ${avg.toFixed(2)} out of ${info.maxMark}` });
    fillEl.style.width = `${(avg * 100) / info.maxMark}%`;
    const line = h('span', { class: 'passline', 'data-tip': `Pass mark ${info.passMark}` });
    line.style.left = `${(info.passMark * 100) / info.maxMark}%`;
    const row = h('div', { class: 'avg-row' }, h('span', { class: 'label', text: subject }), h('span', { class: 'track' }, fillEl, line), h('span', { class: 'val', text: avg.toFixed(1) }));
    row.style.setProperty('--i', String(i));
    return row;
  });
  const averages = h('section', { class: 'section' },
    h('h2', { text: 'Subject averages' }),
    h('p', { class: 'lede', text: `The class average in each subject, out of ${info.maxMark}.` }),
    rows,
    h('p', { class: 'avg-note' }, h('i'), `Pass mark of ${info.passMark}`));

  /* top of the class */
  const top = ranking.ranking.slice(0, 3);
  const topList = h('ul', { class: 'mini-list' }, top.map(({ rank, student: s }) => h('li', {},
    h('span', { class: 'rank', text: String(rank) }),
    h('div', { class: 'who' }, h('button', { type: 'button', class: 'link nm', text: s.name, onclick: () => openDetail(s) }), h('span', { text: `ID ${s.id}, ${s.percentage.toFixed(1)}%` })),
    stamp(s.pass))));
  const topSection = h('section', { class: 'section' },
    h('h2', { text: 'Top of the class' }),
    h('p', { class: 'lede', text: 'Highest totals first. Tied totals share a rank.' }),
    topList,
    h('p', { class: 'more' }, h('a', { class: 'link', href: '#ranking', text: 'See the full ranking' })));

  /* needs attention */
  const failed = summary.failedStudents.slice(0, 4);
  const attention = failed.length === 0
    ? h('p', { class: 'ok-note' }, icon('check'), 'Nobody is below the pass mark.')
    : h('ul', { class: 'mini-list attn' }, failed.map((s) => h('li', {},
      h('span', {}, stamp(false)),
      h('div', { class: 'who' }, h('button', { type: 'button', class: 'link nm', text: s.name, onclick: () => openDetailById(s.id) }), h('span', { text: `ID ${s.id}, ${s.percentage.toFixed(1)}%` })),
      h('div', { class: 'why' }, 'Below the pass mark in ', s.belowPass.map((b, i) => [i > 0 ? ', ' : '', `${b.subject} `, penMark(b.mark, i)])))));
  const attentionSection = h('section', { class: 'section' },
    h('h2', { text: 'Needs attention' }),
    h('p', { class: 'lede', text: `Students with a subject below the pass mark of ${info.passMark}.` }),
    attention,
    summary.failedStudents.length > 4 ? h('p', { class: 'more' }, h('a', { class: 'link', href: '#analysis', text: `See all ${summary.failedStudents.length} in the analysis` })) : null);

  fill(main, pageHead('Overview'), hero, averages, h('div', { class: 'cols' }, topSection, attentionSection));
}
