// Boot and the loop. The world advances in fixed 1/60 s steps whatever the display's rate, the
// screens (title, play, paused, map, wasted, busted, finished) decide what a key means, and the
// renderer paints the world while the HUD paints over it.
//
// ?seed=N fixes the city; ?shot=coast|downtown|chase|club stages one of the four screenshot scenes
// and stops, setting window.__shotReady once the frame is painted.
import { STEP, WORLD } from './config.js';
import { hashSeed } from './rng.js';
import { createWorld, respawn, updateWorld } from './world.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { drawEndCard, drawMap, drawPause, drawRunStats, drawTitle } from './menus.js';
import { stageShot } from './shots.js';
import { RADIO } from './config.js';
import { applySave, loadGame, saveGame } from './save.js';
import { resizeCamera } from './camera.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : hashSeed(WORLD.seedName);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const game = createWorld(seed);
const hud = createHud(game.city);
const input = createInput(canvas);
game.hudMap = hud.map;
let screen = shotName ? 'play' : 'title';
let accumulator = 0;
let last = performance.now();
let clock = 0;

function announce(text) {
  if (status) status.textContent = text;
}

function fit() {
  const width = Math.max(640, Math.floor(window.innerWidth));
  const height = Math.max(420, Math.floor(window.innerHeight));
  renderer.resize(width, height, 1);
  resizeCamera(game.camera, width, height);
}

window.addEventListener('resize', fit);
fit();

function startRun(loadSaved) {
  if (loadSaved) {
    const data = loadGame();
    if (data) applySave(game, data);
  }
  game.state = 'play';
  screen = 'play';
  game.audio.unlock();
  announce('Marisol: walk with WASD, drive with the same keys, E to get in a car, click to shoot.');
  game.toast(loadSaved ? 'Back on the street' : 'Welcome to Marisol', 3);
}

function readKeys() {
  // Sound needs one gesture before the browser will let it play.
  if (input.raw.size > 0 || input.mouse.down) game.audio.unlock();

  if (screen === 'title') {
    if (input.pressed('confirm')) startRun(false);
    else if (input.raw.has('KeyC') && loadGame()) startRun(true);
    else if (input.pressed('map')) screen = 'map';
    return;
  }
  if (screen === 'map') {
    if (input.pressed('map') || input.pressed('pause') || input.pressed('confirm')) screen = game.state === 'title' ? 'title' : 'play';
    return;
  }
  if (screen === 'paused') {
    if (input.pressed('pause')) screen = 'play';
    if (input.pressed('confirm')) screen = 'play';
    return;
  }
  if (screen === 'wasted' || screen === 'busted') {
    game.deathTimer = (game.deathTimer ?? 0) + 1;
    if (input.pressed('confirm') || (game.deathTimer > 140 && game.deathTimer % 140 === 0)) {
      respawn(game);
      screen = 'play';
    }
    return;
  }
  if (screen === 'finished') {
    if (input.pressed('confirm')) screen = 'title';
    return;
  }

  // Playing.
  if (input.pressed('pause')) {
    screen = 'paused';
    saveGame(game);
    return;
  }
  if (input.pressed('map')) {
    screen = 'map';
    return;
  }
  if (input.pressed('radio')) {
    const station = game.audio.setStation(game.audio.stationIndex + 1);
    game.radioName = station.name;
    game.radioMood = station.mood;
    game.toast(station.name, 1.6);
  }
  if (input.pressed('mute')) {
    game.toast(game.audio.toggleMute() ? 'Sound off' : 'Sound on', 1.4);
  }
  if (input.pressed('help')) game.toast('Esc pauses and lists the controls', 2.4);
}

function step(dt) {
  readKeys();
  if (screen === 'play' || screen === 'map') {
    if (screen === 'play') updateWorld(game, input, dt);
    else updateWorld(game, input, 0);
  } else if (screen === 'title') {
    game.clock = (game.clock + dt * 0.02) % 24;
    game.audio.update(dt, game);
  }
  if (game.state === 'wasted' && screen === 'play') {
    screen = 'wasted';
    game.deathTimer = 0;
    game.audio.explosion(game.player.x, game.player.y);
  }
  if (game.state === 'busted' && screen === 'play') {
    screen = 'busted';
    game.deathTimer = 0;
  }
  if (game.finished && screen === 'play' && !game.mission.active) {
    screen = 'finished';
  }
  input.endFrame();
}

function paint() {
  renderer.draw(game);
  const ctx = renderer.ctx;
  const { width, height } = renderer;

  if (screen === 'title') {
    drawTitle(ctx, width, height, clock, Boolean(loadGame()));
    return;
  }
  hud.draw(ctx, game, width, height);
  if (screen === 'map') drawMap(ctx, game, width, height);
  if (screen === 'paused') drawPause(ctx, game, width, height);
  if (screen === 'wasted') {
    drawEndCard(ctx, width, height, 'WASTED', 'Marisol does not miss you yet.', 'Enter to get up', 'rgba(72, 10, 12, 0.55)');
    drawRunStats(ctx, game, width, height);
  }
  if (screen === 'busted') {
    drawEndCard(ctx, width, height, 'BUSTED', 'The Alacranes will hear about this.', 'Enter to walk out', 'rgba(10, 24, 52, 0.55)');
    drawRunStats(ctx, game, width, height);
  }
  if (screen === 'finished') {
    drawEndCard(ctx, width, height, 'MARISOL IS YOURS', 'Six jobs, one courier, a whole coast.', 'Enter for the title screen', 'rgba(28, 20, 34, 0.6)');
    drawRunStats(ctx, game, width, height);
  }
}

function loop(now) {
  const delta = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  clock += delta;
  accumulator += delta;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    step(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  paint();
  requestAnimationFrame(loop);
}

if (shotName) {
  // A screenshot scene: staged once, painted twice, then held still.
  game.audio.toggleMute();
  const held = stageShot(shotName, game);
  screen = 'play';
  const shotInput = {
    mouse: { x: renderer.width * 0.62, y: renderer.height * 0.4, down: Boolean(held.fire), clicked: false, wheel: 0 },
    down: (action) => Boolean(held[action]),
    pressed: () => false,
    fire: () => Boolean(held.fire),
    raw: new Set(),
    endFrame() {},
  };
  let painted = 0;
  const holdShot = () => {
    // A few more steps, so the scene is moving, not a still life.
    for (let i = 0; i < 2; i += 1) updateWorld(game, shotInput, STEP);
    paint();
    painted += 1;
    if (painted < 3) requestAnimationFrame(holdShot);
    else window.__shotReady = true;
  };
  window.__marisol = {
    game,
    input,
    seed,
    get screen() {
      return screen;
    },
    pump(steps = 1) {
      for (let i = 0; i < steps; i += 1) step(STEP);
      paint();
      return game.time;
    },
  };
  requestAnimationFrame(holdShot);
} else {
  window.__marisol = {
    game,
    input,
    seed,
    get screen() {
      return screen;
    },
    pump(steps = 1) {
      for (let i = 0; i < steps; i += 1) step(STEP);
      paint();
      return game.time;
    },
  };
  requestAnimationFrame(loop);
  announce('Marisol: Sun Coast Crime. Press Enter to start.');
}
