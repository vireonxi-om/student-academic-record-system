/* Talking to the server (and, through it, to the C program). */

export class ApiError extends Error {
  constructor(message, field, status, errors) {
    super(message);
    this.field = field;
    this.status = status;
    this.errors = errors || [];
  }
}

const announce = (online) => document.dispatchEvent(new CustomEvent('engine', { detail: { online } }));

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    announce(false);
    throw new ApiError('Cannot reach the server. Check that it is still running in the terminal.', null, 0);
  }
  announce(true);
  let data = null;
  try { data = await res.json(); } catch { /* leave null */ }
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError((data && data.error) || `The request failed (${res.status}).`, data && data.field, res.status, data && data.errors);
  }
  return data;
}

export const get = (url) => api('GET', url);
export const post = (url, body = {}) => api('POST', url, body);
export const put = (url, body) => api('PUT', url, body);

/** The five students from the project's hand-calculated test dataset. */
export const EXAMPLE_STUDENTS = [
  { id: 'S001', name: 'Asha Rao', marks: [80, 70, 60, 90, 50] },
  { id: 'S002', name: 'Ravi Das', marks: [40, 40, 40, 40, 40] },
  { id: 'S003', name: 'Mina Sen', marks: [100, 100, 100, 100, 39] },
  { id: 'S004', name: 'Omar Ali', marks: [0, 0, 0, 0, 0] },
  { id: 'S005', name: 'Asha Rao', marks: [100, 100, 100, 100, 100] },
];
