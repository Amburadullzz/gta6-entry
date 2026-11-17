// A tiny Chrome DevTools Protocol client for the screenshot pass (a development tool, not part of
// the game): open a page in a headless Chrome, wait until the game says its frame is painted, read
// whatever the console and the page reported, and save a PNG.
//
//   node tools/capture.mjs --url "http://localhost:8080/?shot=coast&seed=7" --out screenshots/1.jpg
//
// The Chrome is started beside it, so this talks to http://127.0.0.1:9222 by default.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const url = arg('url', 'http://localhost:8080/');
const out = arg('out', 'screenshot.png');
const port = Number(arg('port', '9222'));
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '720'));
const settle = Number(arg('settle', '1200'));
const shotWait = arg('wait', '__shotReady');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target on the debugging port');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});

let nextId = 1;
const waiting = new Map();
const logs = [];
socket.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`EXCEPTION: ${d.text} ${d.exception?.description ?? ''} @${d.url ?? ''}:${d.lineNumber ?? ''}`);
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
  }
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return res.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// Collects the page's own errors before any of the game's code runs.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "window.__errs=[];addEventListener('error',function(e){window.__errs.push(String(e.message)+' @'+(e.filename||'')+':'+(e.lineno||0))});addEventListener('unhandledrejection',function(e){window.__errs.push('rejection '+String(e.reason))});",
});
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });

// Wait for the game's own readiness flag, or for the page to settle when there is none.
const deadline = Date.now() + 25000;
let ready = false;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 200));
  if (await evaluate(`Boolean(window.${shotWait})`)) {
    ready = true;
    break;
  }
}
await new Promise((r) => setTimeout(r, settle));

const errors = await evaluate('JSON.stringify(window.__errs ?? [])');
const state = await evaluate('JSON.stringify({title: document.title, ready: Boolean(window.__shotReady), game: Boolean(window.__marisol)})');
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));

console.log(JSON.stringify({ url, out, ready, state: state ? JSON.parse(state) : null, errors: errors ? JSON.parse(errors) : [], logs: logs.slice(0, 40) }, null, 2));
socket.close();
