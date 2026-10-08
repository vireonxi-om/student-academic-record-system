/* Shared state for the page. */
export const state = {
  info: null,          // rules from the C program: subjects, pass mark, capacity, bands
  count: 0,            // students in the register
  search: { mode: 'partial', q: '' },
  filter: 'all',       // all | pass | fail
  sort: { key: null, dir: 'asc' },
  freshId: null,       // an ID that was just added or changed (stamp / row highlight)
  detail: null,
};

/** Tell the current view that records changed. */
export const changed = () => document.dispatchEvent(new CustomEvent('register:changed'));
