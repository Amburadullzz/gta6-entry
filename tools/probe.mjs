// A scratch probe (development only): checks the two things the play-test says are broken — the
// police response and the Escape key — by reading the game's own state around each one.
const port = Number(process.argv[2] ?? 9222);
const url = process.argv[3] ?? 'http://localhost:8080/?seed=7';

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => socket.addEventListener('open', r));
let nextId = 1;
const waiting = new Map();
socket.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.result?.exceptionDetails) return 'ERR ' + res.result.exceptionDetails.text + ' ' + (res.result.exceptionDetails.exception?.description ?? '');
  return res.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 1800));

await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
await ev('window.__marisol.pump(3)');
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
console.log('screen', await ev('window.__marisol.screen'));

// Escape.
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
console.log('raw after escape down', await ev('JSON.stringify([...window.__marisol.input.raw])'));
console.log('pump', await ev('window.__marisol.pump(2)'));
console.log('screen', await ev('window.__marisol.screen'));
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await ev('window.__marisol.pump(1)');
console.log('screen after keyup', await ev('window.__marisol.screen'));

// Police: a crime, then watch the force.
await ev('window.__marisol.pump(2)');
await ev(`(() => { const g = window.__marisol.game; g.reportCrime(g.player.x, g.player.y, 300, "gunfire"); return 1; })()`);
console.log('wanted', await ev('JSON.stringify({level: window.__marisol.game.wanted.level, heat: window.__marisol.game.wanted.heat, wave: window.__marisol.game.wanted.waveTimer, time: window.__marisol.game.time, last: window.__marisol.game.wanted.lastCrime})'));
for (let i = 0; i < 5; i += 1) {
  await ev('window.__marisol.pump(30)');
  console.log('tick', i, await ev('JSON.stringify({level: window.__marisol.game.wanted.level, heat: Math.round(window.__marisol.game.wanted.heat), wave: window.__marisol.game.wanted.waveTimer.toFixed(2), police: window.__marisol.game.cars.filter((c) => c.police).length, officers: window.__marisol.game.officers.length})'));
}
console.log('errors', await ev('JSON.stringify(window.__errs ?? [])'));
socket.close();
