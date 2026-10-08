#!/usr/bin/env node
/*
 * gui/server.js
 * Local web server for the Mark Register GUI. No npm packages are needed.
 *
 *   browser (public/) <--HTTP/JSON--> server.js <--stdin/stdout--> student_bridge (C)
 *
 * The C program (gui/bridge.c, built with "make gui") holds the records in
 * memory and does every calculation. This file only translates HTTP requests
 * into bridge commands, serves the static page, and keeps files inside
 * gui/data/.
 *
 * Safety: listens on 127.0.0.1 only; rejects requests whose Host or Origin
 * is not this server (blocks DNS-rebinding and cross-site requests); limits
 * request size; only reads/writes plain file names inside gui/data/.
 *
 * Run:  node gui/server.js        (PORT=9000 node gui/server.js for another port)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 32 * 1024;
const BRIDGE_TIMEOUT_MS = 10000;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* ------------------------------------------------------------------ */
/* Bridge: one long-running C process, one command at a time           */
/* ------------------------------------------------------------------ */
class Bridge {
  constructor(binary) {
    this.binary = binary;
    this.child = null;
    this.pending = null;      // { resolve, reject, timer }
    this.queue = [];          // commands waiting for the current one to finish
    this.buffer = '';
  }

  start() {
    if (!fs.existsSync(this.binary)) {
      throw new Error(`Bridge program not found: ${this.binary}\nBuild it first with:  make gui`);
    }
    this.child = spawn(this.binary, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.onData(chunk));
    this.child.on('exit', () => {
      const failed = this.pending;
      this.child = null;
      this.pending = null;
      this.buffer = '';
      if (failed) {
        clearTimeout(failed.timer);
        failed.reject(new Error('The C bridge stopped unexpectedly. Records in memory were lost.'));
      }
      this.next();
    });
    this.child.stdin.on('error', () => { /* handled by the exit event */ });
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      const current = this.pending;
      if (!current) continue;
      this.pending = null;
      clearTimeout(current.timer);
      try {
        current.resolve(JSON.parse(line));
      } catch (error) {
        current.reject(new Error('The C bridge sent an unreadable reply.'));
      }
      this.next();
    }
  }

  /** Send one command (an array of text fields) and resolve with the parsed JSON reply. */
  send(fields) {
    for (const f of fields) {
      if (typeof f !== 'string' || /[\t\n\r\0]/.test(f)) {
        return Promise.reject(Object.assign(new Error('Text fields cannot contain tabs, line breaks or control characters.'), { status: 400 }));
      }
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ line: fields.join('\t') + '\n', resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.pending || this.queue.length === 0) return;
    if (!this.child) {
      try { this.start(); } catch (error) {
        const all = this.queue.splice(0);
        all.forEach((item) => item.reject(error));
        return;
      }
    }
    const item = this.queue.shift();
    const timer = setTimeout(() => {
      if (this.pending && this.pending.resolve === item.resolve) {
        this.pending = null;
        item.reject(new Error('The C bridge did not answer in time.'));
        if (this.child) this.child.kill();
      }
    }, BRIDGE_TIMEOUT_MS);
    this.pending = { resolve: item.resolve, reject: item.reject, timer };
    this.child.stdin.write(item.line);
  }

  stop() {
    if (this.child) this.child.kill();
  }
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (type !== 'application/json') {
      reject(Object.assign(new Error('Send JSON (Content-Type: application/json).'), { status: 415 }));
      return;
    }
    let size = 0;
    const parts = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.pause();                       // stop reading; the connection is closed after the reply
        reject(Object.assign(new Error('Request too large.'), { status: 413, closeConnection: true }));
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
        resolve(value);
      } catch (error) {
        reject(Object.assign(new Error('The request body is not valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Turn a bridge failure message into text a person can act on. */
const tidy = (text) => String(text).replace(/^Error:\s*/, '').replace(/\s+/g, ' ').trim();

function createServer({ bridgePath, dataDir }) {
  const bridge = new Bridge(bridgePath);
  fs.mkdirSync(dataDir, { recursive: true });

  const text = (value) => (value === undefined || value === null ? '' : String(value));
  const trimmed = (value) => text(value).trim();

  /** Validate a plain file name and return its full path inside dataDir. */
  function dataFile(name, extension) {
    let file = trimmed(name);
    if (file === '') file = `students${extension}`;
    if (!path.extname(file)) file += extension;
    if (!FILE_NAME.test(file)) {
      throw Object.assign(new Error('Use a plain file name: letters, digits, dot, dash or underscore (up to 64 characters).'), { status: 400 });
    }
    return { file, full: path.join(dataDir, file) };
  }

  function marksOf(body) {
    const marks = Array.isArray(body.marks) ? body.marks : [];
    return marks.map(text);
  }

  async function relay(res, fields) {
    const reply = await bridge.send(fields);
    if (reply.ok === false) reply.error = tidy(reply.error);
    sendJson(res, reply.ok === false ? 422 : 200, reply);
  }

  async function handleApi(req, res, url) {
    const route = `${req.method} ${url.pathname}`;
    const query = url.searchParams;

    switch (route) {
      case 'GET /api/info':      return relay(res, ['INFO']);
      case 'GET /api/students':  return relay(res, ['LIST']);
      case 'GET /api/marks':     return relay(res, ['MARKS']);
      case 'GET /api/extremes':  return relay(res, ['EXTREMES']);
      case 'GET /api/frequency': return relay(res, ['FREQUENCY']);
      case 'GET /api/summary':   return relay(res, ['SUMMARY']);
      case 'GET /api/ranking':   return relay(res, ['RANKING']);
      case 'GET /api/search': {
        const mode = query.get('mode') || 'partial';
        const q = trimmed(query.get('q'));
        const verbs = { id: 'SEARCH_ID', name: 'SEARCH_NAME', partial: 'SEARCH_PARTIAL' };
        if (!verbs[mode]) return sendJson(res, 400, { ok: false, error: 'Unknown search mode.' });
        if (q === '') return relay(res, ['LIST']);
        return relay(res, [verbs[mode], q]);
      }
      case 'POST /api/students': {
        const body = await readJson(req);
        return relay(res, ['ADD', trimmed(body.id), trimmed(body.name), ...marksOf(body)]);
      }
      case 'PUT /api/students': {
        const body = await readJson(req);
        return relay(res, ['UPDATE', trimmed(body.id), ...marksOf(body)]);
      }
      case 'POST /api/clear': return relay(res, ['CLEAR']);
      case 'GET /api/files': {
        const names = fs.readdirSync(dataDir).filter((n) => FILE_NAME.test(n));
        const stat = (n) => {
          const info = fs.statSync(path.join(dataDir, n));
          return { name: n, bytes: info.size, modified: Math.round(info.mtimeMs) };
        };
        return sendJson(res, 200, {
          ok: true,
          saves: names.filter((n) => n.endsWith('.dat')).sort().map(stat),
          exports: names.filter((n) => n.endsWith('.csv')).sort().map(stat),
        });
      }
      case 'POST /api/save': {
        const { file, full } = dataFile((await readJson(req)).file, '.dat');
        const reply = await bridge.send(['SAVE', full]);
        if (reply.ok === false) reply.error = tidy(reply.error);
        return sendJson(res, reply.ok === false ? 422 : 200, { ...reply, file });
      }
      case 'POST /api/export': {
        const { file, full } = dataFile((await readJson(req)).file, '.csv');
        const reply = await bridge.send(['EXPORT', full]);
        if (reply.ok === false) reply.error = tidy(reply.error);
        return sendJson(res, reply.ok === false ? 422 : 200, { ...reply, file });
      }
      case 'POST /api/load': {
        const { file, full } = dataFile((await readJson(req)).file, '.dat');
        const reply = await bridge.send(['LOAD', full]);
        if (reply.ok === false) reply.error = tidy(reply.error);
        return sendJson(res, reply.ok === false ? 422 : 200, { ...reply, file });
      }
      default:
        return sendJson(res, 404, { ok: false, error: 'Not found.' });
    }
  }

  function serveStatic(res, pathname) {
    const wanted = pathname === '/' ? '/index.html' : pathname;
    const full = path.normalize(path.join(PUBLIC_DIR, wanted));
    if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return sendJson(res, 404, { ok: false, error: 'Not found.' });
    }
    const isFont = path.extname(full) === '.woff2';
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': isFont ? 'public, max-age=604800, immutable' : 'no-store',
    });
    return fs.createReadStream(full).pipe(res);
  }

  function serveDownload(res, pathname) {
    let name;
    try {
      name = decodeURIComponent(pathname.slice('/files/'.length));
    } catch (error) {
      return sendJson(res, 404, { ok: false, error: 'File not found.' });
    }
    if (!FILE_NAME.test(name) || !fs.existsSync(path.join(dataDir, name))) {
      return sendJson(res, 404, { ok: false, error: 'File not found.' });
    }
    res.writeHead(200, {
      'Content-Type': name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    });
    return fs.createReadStream(path.join(dataDir, name)).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");

    try {
      // Only talk to a browser that reached us as localhost / 127.0.0.1 (anti DNS-rebinding).
      const host = (req.headers.host || '').toLowerCase();
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden host.' });
      }
      // Cross-site requests carry a foreign Origin: refuse state-changing ones.
      const origin = req.headers.origin;
      if (origin && req.method !== 'GET' && origin !== `http://${req.headers.host}`) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden origin.' });
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
      if (url.pathname.startsWith('/files/')) return serveDownload(res, url.pathname);
      return serveStatic(res, url.pathname);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error.closeConnection) {
        res.setHeader('Connection', 'close');
        res.on('finish', () => req.destroy());
      }
      return sendJson(res, error.status || 500, { ok: false, error: error.message || 'Server error.' });
    }
  });
  server.on('close', () => bridge.stop());
  server.bridge = bridge;
  return server;
}

module.exports = { createServer, Bridge };

if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  const server = createServer({
    bridgePath: path.join(__dirname, 'student_bridge'),
    dataDir: path.join(__dirname, 'data'),
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Mark Register is running at http://127.0.0.1:${server.address().port}`);
    console.log('Press Ctrl+C to stop. Records live in memory: save them from the Files page.');
  });
  const stop = () => { server.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
