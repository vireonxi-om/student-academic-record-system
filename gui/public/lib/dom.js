/* DOM helpers. User text is only ever inserted with textContent / text nodes, never as HTML. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
}
function appendAll(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
}

/** Create an HTML element: h('button', { class: 'btn', onclick }, 'Label', childNode) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendAll(el, children);
  return el;
}

/** Create an SVG element. */
export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendAll(el, children);
  return el;
}

/** Replace an element's children, skipping null/false and flattening arrays. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
}

/* Outline icons on a 24px grid (own geometry, drawn for this project). */
const ICONS = {
  overview: ['M4 4h7v9H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 15h7v5H4z'],
  register: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  marks: ['M4 5h16v14H4z', 'M4 10h16', 'M4 15h16', 'M10 5v14', 'M15 5v14'],
  analysis: ['M3 20h18', 'M6 20v-8', 'M12 20V5', 'M18 20v-5'],
  ranking: ['M3 20h18', 'M5 20v-5h4v5', 'M10 20V8h4v12', 'M15 20v-9h4v9'],
  files: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2.5v2', 'M12 19.5v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  alert: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4', 'M12 17h.01'],
  download: ['M12 4v11', 'M7 11l5 5 5-5', 'M5 20h14'],
  upload: ['M12 16V5', 'M7 9l5-5 5 5', 'M5 20h14'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  pencil: ['M4 20l4-1 11-11-3-3L5 16z', 'M14 7l3 3'],
  printer: ['M7 9V4h10v5', 'M7 17H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2', 'M7 14h10v6H7z'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  sparkle: ['M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', 'M19 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'],
  up: ['M7 14l5-5 5 5'],
  down: ['M7 10l5 5 5-5'],
  sort: ['M8 9l4-4 4 4', 'M8 15l4 4 4-4'],
  keyboard: ['M3 6h18v12H3z', 'M7 10h.01', 'M11 10h.01', 'M15 10h.01', 'M7 14h10'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 20c1-4 4-6 8-6s7 2 8 6'],
};

export function icon(name, size = 18) {
  return svg('svg', { class: 'ico', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    (ICONS[name] || []).map((d) => svg('path', { d })));
}

/** Fill every [data-icon] placeholder under root with its icon. */
export function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => {
    if (el.dataset.iconDone) return;
    el.prepend(icon(el.dataset.icon, Number(el.dataset.iconSize) || 18));
    el.dataset.iconDone = '1';
  });
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const pct = (value) => `${value.toFixed(2)}%`;
export const pct1 = (value) => `${value.toFixed(1)}%`;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(ms) {
  const seconds = Math.round((ms - Date.now()) / 1000);
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
