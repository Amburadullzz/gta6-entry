// A play-test driven through the browser: it presses the real keys, moves the real mouse and reads
// the game's own state back, so the things a player does — start, walk, steal a car, drive, shoot,
// take a job — are checked against the code that runs, not against a description of it.
//
//   node tools/playtest.mjs            (with serve.ts running and Chrome on --remote-debugging-port)
import { argv } from 'node:process';

const port = Number(argv[2] ?? 9222);
const base = argv[3] ?? 'http://localhost:8080/';

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});
let nextId = 1;
const waiting = new Map();
const problems = [];
socket.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') problems.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''));
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push('console.error ' + JSON.stringify(msg.params.args.map((a) => a.value)));
});

const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  waiting.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.text + ' ' + (res.result.exceptionDetails.exception?.description ?? ''));
  return res.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEY_CODES = {
  Enter: { key: 'Enter', vk: 13 },
  KeyW: { key: 'w', vk: 87 },
  KeyS: { key: 's', vk: 83 },
  KeyA: { key: 'a', vk: 65 },
  KeyD: { key: 'd', vk: 68 },
  KeyE: { key: 'e', vk: 69 },
  Escape: { key: 'Escape', vk: 27 },
  KeyM: { key: 'm', vk: 77 },
  ShiftLeft: { key: 'Shift', vk: 16 },
};

const keyDown = (code) => send('Input.dispatchKeyEvent', {
  type: 'keyDown', code, key: KEY_CODES[code].key, windowsVirtualKeyCode: KEY_CODES[code].vk, nativeVirtualKeyCode: KEY_CODES[code].vk,
});
const keyUp = (code) => send('Input.dispatchKeyEvent', {
  type: 'keyUp', code, key: KEY_CODES[code].key, windowsVirtualKeyCode: KEY_CODES[code].vk, nativeVirtualKeyCode: KEY_CODES[code].vk,
});
const hold = async (code, steps = 8) => {
  await keyDown(code);
  await evaluate(`window.__marisol.pump(${steps})`);
  await keyUp(code);
  await evaluate('window.__marisol.pump(1)');
};

/** Runs the simulation forward by n fixed steps, as the loop would. */
const pump = (steps) => evaluate(`window.__marisol.pump(${steps})`);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: "window.__errs=[];addEventListener('error',function(e){window.__errs.push(String(e.message)+' @'+(e.filename||'')+':'+(e.lineno||0))});addEventListener('unhandledrejection',function(e){window.__errs.push('rejection '+String(e.reason))});",
});
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base + '?seed=7' });
await sleep(2500);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const started = await evaluate('Boolean(window.__marisol)');
check('boot: the game module runs', started === true);
if (!started) {
  console.log(JSON.stringify({ problems, errors: await evaluate('window.__errs ?? []') }, null, 2));
  process.exit(1);
}

// The simulation must advance a fixed step at a time when the loop or the test drives it.
const t0 = await evaluate('window.__marisol.game.time');
await pump(60);
const t1 = await evaluate('window.__marisol.game.time');
check('clock: steps advance only once the run is live', t1 >= t0, `time ${t0?.toFixed(2)} -> ${t1?.toFixed(2)}`);

const titleState = await evaluate('JSON.stringify({screen: window.__marisol.screen, cars: window.__marisol.game.cars.length, peds: window.__marisol.game.peds.length, blocks: window.__marisol.game.city.blocks.length, buildings: window.__marisol.game.city.buildings.length})');
const title = JSON.parse(titleState);
check('city: generated with blocks, buildings, cars and people', title.blocks === 81 && title.buildings > 150 && title.cars > 20 && title.peds > 10, JSON.stringify(title));

await hold('Enter', 4);
const screen = await evaluate('window.__marisol.screen');
check('start: Enter leaves the title screen', screen === 'play', `screen=${screen}`);

// Walk: on foot, W should move the player up the screen.
const before = await evaluate('JSON.stringify({x: window.__marisol.game.player.x, y: window.__marisol.game.player.y, mode: window.__marisol.game.player.mode})');
await hold('KeyW', 60);
const after = await evaluate('JSON.stringify({x: window.__marisol.game.player.x, y: window.__marisol.game.player.y, mode: window.__marisol.game.player.mode})');
const b = JSON.parse(before);
const a = JSON.parse(after);
check('walk: the player moves on foot', Math.hypot(a.x - b.x, a.y - b.y) > 40 && a.mode === 'foot', `moved ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)}px`);

// Steal a car: stand beside the nearest one and press E.
const parked = await evaluate(`(() => {
  const g = window.__marisol.game;
  const car = g.cars.find((c) => c.kind === 'parked' && c.health > 0) || g.cars[0];
  g.player.x = car.x + 30; g.player.y = car.y; g.player.mode = 'foot'; g.player.car = null;
  return JSON.stringify({model: car.model, x: car.x, y: car.y});
})()`);
await pump(2);
await hold('KeyE', 3);
const inCar = await evaluate('JSON.stringify({mode: window.__marisol.game.player.mode, car: window.__marisol.game.player.car?.model ?? null})');
const carState = JSON.parse(inCar);
check('steal: E puts the player in a car', carState.mode === 'car' && carState.car === JSON.parse(parked).model, JSON.stringify(carState));

// Drive: W should build speed and move the car.
const carBefore = await evaluate('JSON.stringify({x: window.__marisol.game.player.car.x, y: window.__marisol.game.player.car.y, speed: window.__marisol.game.player.car.speed})');
await hold('KeyW', 70);
const carAfter = await evaluate('JSON.stringify({x: window.__marisol.game.player.car.x, y: window.__marisol.game.player.car.y, speed: window.__marisol.game.player.car.speed, health: window.__marisol.game.player.car.health})');
const cb = JSON.parse(carBefore);
const ca = JSON.parse(carAfter);
check('drive: the car accelerates and moves', ca.speed > 40 && Math.hypot(ca.x - cb.x, ca.y - cb.y) > 60, `speed ${ca.speed.toFixed(0)}, moved ${Math.hypot(ca.x - cb.x, ca.y - cb.y).toFixed(0)}px`);

// Shooting: click the canvas, the gun spends a round.
await hold('KeyE', 3);
await pump(2);
const ammoBefore = await evaluate('window.__marisol.game.player.arsenal.vela.mag');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 300, button: 'left', clickCount: 1 });
await pump(4);
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 300, button: 'left', clickCount: 1 });
await pump(2);
const ammoAfter = await evaluate('window.__marisol.game.player.arsenal.vela.mag');
check('shoot: a click fires a round', ammoAfter === ammoBefore - 1, `mag ${ammoBefore} -> ${ammoAfter}`);

// Wanted: a crime near the player raises the heat and the stars.
const heat = await evaluate(`(() => {
  const g = window.__marisol.game;
  g.reportCrime(g.player.x, g.player.y, 260, 'gunfire');
  return JSON.stringify({heat: g.wanted.heat, level: g.wanted.level});
})()`);
check('wanted: a crime raises the stars', JSON.parse(heat).level >= 1, heat);

// Police respond: after a few seconds at that level there is a cruiser on the road.
await pump(200);
const police = await evaluate('JSON.stringify({cars: window.__marisol.game.cars.filter((c) => c.police).length, officers: window.__marisol.game.officers.length})');
check('police: cruisers answer the wanted level', JSON.parse(police).cars >= 1, police);

// A job: stand in the marker by the safehouse and it starts.
await evaluate(`(() => {
  const g = window.__marisol.game;
  g.wanted.heat = 0; g.wanted.level = 0;
  g.player.mode = 'foot'; g.player.car = null;
  g.player.x = g.city.landmarks.safehouse.x;
  g.player.y = g.city.landmarks.safehouse.y - 130;
  return true;
})()`);
await pump(50);
const missionState = await evaluate('JSON.stringify({active: window.__marisol.game.mission.active?.id ?? null, objective: window.__marisol.game.mission.objective})');
check('missions: the marker by the safehouse starts a job', JSON.parse(missionState).active !== null, missionState);

// Pause and the map.
await hold('Escape', 3);
const paused = await evaluate('window.__marisol.screen');
await hold('KeyM', 3);
const mapScreen = await evaluate('window.__marisol.screen');
check('menus: Esc pauses and M opens the map', paused === 'paused' && (mapScreen === 'map' || mapScreen === 'paused'), `paused=${paused} map=${mapScreen}`);

// A save survives a reload.
await evaluate('window.__marisol.game.money = 1234; window.__marisol.game.save();');
const saved = await evaluate('localStorage.getItem("marisol.suncoast.save.v1") !== null');
check('save: the run is written to storage', saved === true);

const errs = await evaluate('window.__errs ?? []');
check('no page errors during play', errs.length === 0 && problems.length === 0, JSON.stringify(errs.concat(problems)));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
