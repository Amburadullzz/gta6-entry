// The four scenes behind ?shot=chase|beach|downtown|club. Each one places the player somewhere in
// Marisol, hands the real simulation a scripted set of keys, and lets it run for a fixed number of
// steps — so the frame a screenshot catches is the game playing itself, the same frame every time
// the same seed is asked for.
import { STEP } from './config.js';
import { createCar } from './vehicle.js';
import { createPed } from './pedestrians.js';
import { startMission, MISSIONS } from './missions.js';
import { clearWanted, reportCrime } from './police.js';
import { updateWorld } from './world.js';
import { roadCenter } from './city.js';
import { addFlash } from './combat.js';

/** A key set the simulation can read, driven by the scene rather than by a person. */
function scriptedInput(held = {}) {
  const mouse = { x: 640, y: 360, down: false, clicked: false, wheel: 0 };
  return {
    mouse,
    down: (action) => Boolean(held[action]),
    pressed: () => false,
    fire: () => Boolean(held.fire),
    raw: new Set(),
    endFrame() {
      mouse.clicked = false;
      mouse.wheel = 0;
    },
  };
}

/** Puts the camera exactly where the player is, so the first frame is already framed. */
function snapCamera(game) {
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.camera.zoom = game.player.mode === "car" ? 0.95 : 1;
}

/** Drops the job title card, so a screenshot shows the objective and the street, not a banner. */
function quiet(game) {
  game.toastFor = 0;
  game.toastText = '';
}

const DIRS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

/** Traffic placed along a direction from a point, in the lane that direction keeps. */
function addTraffic(game, x, y, dir, count, spacing) {
  const d = DIRS[dir];
  for (let i = 0; i < count; i += 1) {
    const car = createCar(game.rng, {
      x: x + d.x * spacing * i,
      y: y + d.y * spacing * i,
      angle: Math.atan2(d.y, d.x),
      kind: 'traffic',
    });
    car.axis = d.y === 0 ? 'h' : 'v';
    car.road = Math.round(((d.y === 0 ? car.y : car.x) - 70) / 640);
    car.dir = dir;
    game.cars.push(car);
  }
}

/** Cruisers behind the player, their lights already turning. */
function addPolice(game, x, y, dir, count, spacing = 160) {
  const d = DIRS[dir];
  for (let i = 0; i < count; i += 1) {
    const car = createCar(game.rng, {
      x: x + d.x * spacing * i,
      y: y + d.y * spacing * i,
      angle: Math.atan2(d.y, d.x),
      model: 'police',
      kind: 'police',
      body: '#e9eef2',
    });
    car.health = 160;
    car.lightPhase = i * 0.5;
    car.axis = d.y === 0 ? 'h' : 'v';
    car.road = Math.round(((d.y === 0 ? car.y : car.x) - 70) / 640);
    car.dir = dir;
    car.speed = 240;
    game.cars.push(car);
  }
}

function addCrowd(game, x, y, count, radius, block) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + 0.7;
    const ped = createPed(game.rng, x + Math.cos(a) * radius, y + Math.sin(a) * radius, block ?? game.city.blocks[0]);
    ped.angle = a + Math.PI;
    game.peds.push(ped);
  }
}

/** The crew a job is fought against: armed, marked, and coming at the player. */
function crew(game, x, y, count, radius) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    game.peds.push({
      x: x + Math.cos(a) * radius,
      y: y + Math.sin(a) * radius,
      vx: 0,
      vy: 0,
      angle: a + Math.PI,
      stride: i,
      shirt: '#3f3a52',
      skin: game.rng.pick(['#8d5a3b', '#b47b52', '#6b4229', '#d9a273']),
      health: 58,
      hostile: true,
      armed: true,
      fireCooldown: 0.2 + i * 0.15,
      state: 'hunt',
    });
  }
}

function blockAt(game, x, y) {
  for (const block of game.city.blocks) {
    if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) return block;
  }
  return game.city.blocks[0];
}

/** Runs the simulation forward with a fixed key set. */
function run(game, held, steps) {
  const input = scriptedInput(held);
  for (let i = 0; i < steps; i += 1) updateWorld(game, input, STEP);
}

/** Empties a lane ahead of the player, so a chase shot is a chase and not a traffic jam. */
function clearLane(game, x, y, ahead, behind) {
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const other = game.cars[i];
    if (other === game.player.car) continue;
    if (Math.abs(other.y - y) < 80 && other.x > x - behind && other.x < x + ahead) game.cars.splice(i, 1);
  }
}

/** Puts the player in a car of the scene's choosing, at the head of a clear lane. */
function takeCar(game, model, x, y, angle, body) {
  const car = createCar(game.rng, { x, y, angle, model, kind: 'stolen' });
  car.body = body;
  car.driver = 'player';
  game.cars.push(car);
  game.player.mode = 'car';
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

/**
 * Stages a named scene on a fresh world and returns the key set it ended holding, so the loop can
 * keep the scene moving while the screenshot is taken.
 */
export function stageShot(name, game) {
  const p = game.player;

  if (name === 'chase') {
    // The cover: a stolen Meridian at speed down the Neon Mile at dusk, two cruisers on its tail,
    // the crew it is going to meet waiting on the pavement, everything on the HUD at once.
    const y = roadCenter(4) + 34;
    const x = roadCenter(2) + 40;
    takeCar(game, 'meridian', x, y, 0, '#b8402f');
    clearLane(game, x, y, 520, 60);
    addTraffic(game, x + 250, y, 0, 2, 210);
    addTraffic(game, x + 120, y - 68, 2, 2, 220);
    addPolice(game, x - 360, y, 0, 2, 175);
    crew(game, x + 300, y - 150, 3, 40);
    addCrowd(game, x + 190, y + 150, 4, 60, blockAt(game, x + 190, y + 150));
    reportCrime(game, x, y, 560, 'vehicle theft');
    startMission(game, MISSIONS.indexOf(MISSIONS[3]));
    game.mission.step = 1;
    game.mission.objective = 'Clear the club (5 left)';
    game.mission.subtitle = { speaker: 'Prine', text: 'I want the whole station off the air.' };
    game.mission.subtitleFor = 6;
    game.clock = 18.6;
    quiet(game);
    snapCamera(game);
    run(game, { forward: true }, 58);
    return { forward: true };
  }

  if (name === 'beach') {
    // The look of the place: on the sand at Verano Beach at noon, the sea past the last block,
    // umbrellas and palms, the coast road with traffic just behind.
    const y = roadCenter(8) + 400;
    const x = roadCenter(4);
    takeCar(game, 'coral', x, y, 0, '#2f8f9e');
    clearLane(game, x, y, 420, 40);
    addTraffic(game, x + 250, roadCenter(8) + 34, 0, 2, 200);
    addTraffic(game, x + 110, roadCenter(8) - 34, 2, 2, 210);
    addCrowd(game, x + 180, y + 120, 8, 110, blockAt(game, x + 180, y + 120));
    addCrowd(game, x - 160, y + 60, 5, 90, blockAt(game, x - 160, y + 60));
    game.clock = 11.4;
    game.money = 4820;
    quiet(game);
    snapCamera(game);
    run(game, { forward: true }, 52);
    return { forward: true };
  }

  if (name === 'downtown') {
    // On foot on the Neon Mile: the pavement, the crowd, the parked cars, a gun in his hand.
    const x = roadCenter(4) - 96;
    const y = roadCenter(4) + 210;
    p.x = x;
    p.y = y;
    p.mode = 'foot';
    p.angle = -0.5;
    p.aim = -0.35;
    addCrowd(game, x + 70, y - 30, 8, 95, blockAt(game, x + 70, y - 30));
    addTraffic(game, x + 40, roadCenter(4) + 34, 0, 2, 190);
    addTraffic(game, x - 40, roadCenter(4) - 34, 2, 2, 200);
    game.money = 2480;
    game.clock = 15.2;
    quiet(game);
    snapCamera(game);
    run(game, { right: true }, 34);
    return { right: true };
  }

  if (name === 'club') {
    // Club Vela: the job from Static, the crew coming out of the door, the player shooting back.
    const club = game.city.landmarks.club;
    p.x = club.x - 40;
    p.y = club.y + 130;
    p.mode = 'foot';
    p.weapon = 'brisa';
    p.arsenal.brisa = { mag: 24, reserve: 90 };
    p.aim = -Math.PI / 2;
    crew(game, club.x + 10, club.y + 10, 5, 64);
    addCrowd(game, club.x - 190, club.y + 180, 4, 70, blockAt(game, club.x - 190, club.y + 180));
    startMission(game, MISSIONS.indexOf(MISSIONS[3]));
    game.mission.step = 1;
    game.mission.objective = 'Clear the club (5 left)';
    game.mission.subtitle = { speaker: 'Prine', text: 'I want the whole station off the air.' };
    game.mission.subtitleFor = 6;
    game.wanted.level = 2;
    game.wanted.heat = 260;
    game.clock = 21.4;
    quiet(game);
    snapCamera(game);
    addFlash(game, p.x, p.y - 30, 70);
    run(game, { fire: true }, 26);
    return { fire: true };
  }

  // An unknown name: a plain run, so a mistyped query still shows the game.
  clearWanted(game);
  snapCamera(game);
  run(game, { forward: true }, 30);
  return { forward: true };
}
