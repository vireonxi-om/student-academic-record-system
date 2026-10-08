/* Files: save, load, export, start over. */
import { h, fill, icon, plural, timeAgo } from '../lib/dom.js';
import { get, post } from '../lib/api.js';
import { state, changed } from '../lib/state.js';
import { pageHead, setCount, toast, confirmDialog } from '../lib/ui.js';

const size = (bytes) => (bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`);

/** Run a file action: show failures as a toast, refresh on success. */
async function act(task) {
  try {
    await task();
  } catch (error) {
    toast(error.message, true);
    return false;
  }
  changed();
  return true;
}

function block(iconName, title, ...body) {
  return h('section', { class: 'file-block' }, h('span', { class: 'file-ico' }, icon(iconName, 22)), h('h2', { text: title }), h('div', { class: 'body' }, body));
}

export async function renderFiles(main) {
  const [files, list] = await Promise.all([get('/api/files'), get('/api/students')]);
  setCount(list.count);
  const empty = list.count === 0;

  const saveInput = h('input', { id: 'save-name', placeholder: 'students', autocomplete: 'off', 'aria-label': 'Save as file name', 'aria-describedby': 'save-hint' });
  const exportInput = h('input', { id: 'export-name', placeholder: 'students', autocomplete: 'off', 'aria-label': 'CSV file name' });

  const saves = files.saves.length === 0
    ? h('p', { class: 'muted', text: 'No saved files yet. Save the register first.' })
    : h('ul', { class: 'file-list' }, files.saves.map((f) => h('li', {},
      h('span', {}, h('span', { class: 'name', text: f.name }), h('span', { class: 'meta', text: `${size(f.bytes)}, saved ${timeAgo(f.modified)}` })),
      h('button', { type: 'button', class: 'btn secondary small', 'aria-label': `Load ${f.name}`, onclick: async () => {
        if (state.count > 0) {
          const ok = await confirmDialog({ title: 'Replace the records in memory?', text: `Loading ${f.name} replaces the ${plural(state.count, 'record')} currently in memory.`, okLabel: 'Load file' });
          if (!ok) return;
        }
        if (await act(() => post('/api/load', { file: f.name }))) toast(`Loaded ${f.name}`);
      } }, icon('upload', 16), 'Load'))));

  const exports = files.exports.length === 0 ? null
    : h('ul', { class: 'file-list' }, files.exports.map((f) => h('li', {},
      h('span', {}, h('span', { class: 'name', text: f.name }), h('span', { class: 'meta', text: `${size(f.bytes)}, exported ${timeAgo(f.modified)}` })),
      h('a', { class: 'btn secondary small', href: `/files/${encodeURIComponent(f.name)}`, download: f.name, 'aria-label': `Download ${f.name}` }, icon('download', 16), 'Download'))));

  fill(main,
    pageHead('Files', 'Records live in memory and disappear when the program stops. Save them to a file to keep them. Files are kept in the gui/data folder next to the server.'),
    h('div', { class: 'file-blocks' },
      block('save', 'Save the register',
        h('p', { class: 'hint', id: 'save-hint', text: 'Letters, digits, dot, dash or underscore. The .dat ending is added for you.' }),
        h('div', { class: 'file-row' }, saveInput,
          h('button', { type: 'button', class: 'btn primary', id: 'save-btn', disabled: empty, onclick: async () => {
            let result;
            if (await act(async () => { result = await post('/api/save', { file: saveInput.value }); })) toast(`Saved ${plural(result.count, 'record')} to ${result.file}`);
          } }, 'Save')),
        empty ? h('p', { class: 'hint', text: 'Add a student first.' }) : null),
      block('upload', 'Load a saved file', saves),
      block('download', 'Export a CSV summary',
        h('p', { class: 'hint', text: 'A spreadsheet-friendly list with totals, averages, percentages and results.' }),
        h('div', { class: 'file-row' }, exportInput,
          h('button', { type: 'button', class: 'btn secondary', id: 'export-btn', disabled: empty, onclick: async () => {
            let result;
            if (await act(async () => { result = await post('/api/export', { file: exportInput.value }); })) toast(`Exported ${plural(result.count, 'record')} to ${result.file}`);
          } }, 'Export')),
        exports),
      block('trash', 'Start over',
        h('p', { class: 'hint', text: 'Removes every record from memory. Saved files are not touched.' }),
        h('div', { class: 'file-row' }, h('button', { type: 'button', class: 'btn danger', disabled: empty, onclick: async () => {
          const ok = await confirmDialog({ title: 'Clear all records?', text: `This removes ${plural(state.count, 'record')} from memory. Saved files are not touched.`, okLabel: 'Clear records' });
          if (ok && await act(() => post('/api/clear'))) toast('Register cleared');
        } }, 'Clear all records')))));
}
