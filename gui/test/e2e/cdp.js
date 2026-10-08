// Minimal Chrome DevTools Protocol driver used by e2e.js (no npm packages needed).
// Finds Google Chrome / Chromium automatically; set CHROME=/path/to/chrome to override.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

let chrome;
let profile;
let PORT;
let ws;
let nextId = 1;
const waiting = new Map();
const events = [];

function findChrome() {
  const candidates = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const name of candidates) {
    if (name.includes('/') ? fs.existsSync(name) : spawnSync('which', [name]).status === 0) return name;
  }
  return null;
}
const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function launch(extra = []) {
  PORT = await freePort();
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pbl-chrome-'));
  chrome = spawn(findChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--hide-scrollbars', ...extra, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  await send('Page.enable');
  await send('Runtime.enable');
}
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, (msg) => (msg.error ? reject(new Error(method + ': ' + msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function viewport(width, height, { dark = false, mobile = false, reduce = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
    { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
}
async function goto(url) { await send('Page.navigate', { url }); await sleep(700); }
async function shot(file, { full = false } = {}) {
  let clip;
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    const size = m.cssContentSize || m.contentSize;
    clip = { x: 0, y: 0, width: size.width, height: Math.min(size.height, 3000), scale: 1 };
  }
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
}
async function close() {
  try { ws.close(); } catch { /* already closed */ }
  await new Promise((resolve) => { chrome.once('exit', resolve); chrome.kill(); setTimeout(resolve, 3000); });
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* temp folder: harmless */ }
}

module.exports = { events, findChrome, launch, send, evaluate, viewport, goto, shot, sleep, close };
