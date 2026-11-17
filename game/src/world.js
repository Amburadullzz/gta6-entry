// The world itself: one object that holds the city, the player, everyone else, the story, the
// wanted level and the clock, and one function that moves all of it a fixed step forward. The
// renderer, the HUD and the menus only ever read this; nothing else keeps state.
import { CAMERA, ECONOMY, PLAYER, RADIO, STEP, WANTED } from './config.js';
import { createRandom } from './rng.js';
import { generateCity } from './city.js';
import { buildWallIndex, pushOutOfWalls } from './spatial.js';
import { createCamera, followTarget } from './camera.js';
import { createPlayer, updatePlayer } from './player.js';
import { createCar, driveCar, wreck } from './vehicle.js';
import { maintainTraffic, separateCars, spawnParkedCars, stepTrafficCar } from './traffic.js';
import { maintainPeds, stepPed } from './pedestrians.js';
import { clearWanted, createWanted, reportCrime, updatePolice } from './police.js';
import { addDecal, explodeCar, fireBullet, hurtPed, hurtPlayer, spawnParticles, updateParticles, updatePickups, updateProjectiles, updateWrecks } from './combat.js';
import { createMissionState, missionMarker, startMission, stepHostiles, stepRunner, updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import { saveGame } from './save.js';

/** A whole Marisol, ready to play. `seed` fixes the city and everyone in it. */
export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = generateCity(rng);
  const spawn = city.landmarks.safehouse;
  const player = createPlayer(spawn.x, spawn.y);
  const camera = createCamera(1280, 720);
  camera.x = player.x;
  camera.y = player.y;

  const game = {
    seed,
    rng,
    city,
    walls: buildWallIndex(city.buildings),
    player,
    camera,
    cars: [],
    peds: [],
    officers: [],
    bullets: [],
    particles: [],
    flashes: [],
    decals: [],
    pickups: [],
    wanted: createWanted(),
    mission: createMissionState(),
    audio: createAudio(),
    money: ECONOMY.startMoney,
    clock: 17.4,
    time: 0,
    waypoint: null,
    state: 'title',
    toastText: '',
    toastFor: 0,
    stats: { kills: 0, shots: 0, distance: 0 },
    music: true,
    radioName: RADIO[0].name,
    radioMood: RADIO[0].mood,
    finished: false,
    hudMap: null,
    markerForMap: null,
  };

  spawnParkedCars(game, rng);
  // A little life already on the street when the player first looks.
  for (let i = 0; i < 10; i += 1) maintainTraffic(game, 0, rng);
  for (let i = 0; i < 18; i += 1) maintainPeds(game, 0, rng);

  game.toast = (text, seconds = 2.4) => {
    game.toastText = text;
    game.toastFor = seconds;
  };
  game.reportCrime = (x, y, heat, reason) => reportCrime(game, x, y, heat, reason);
  game.hurtPed = (ped, amount) => hurtPed(game, ped, amount);
  game.save = () => saveGame(game);
  game.markerForMap = () => missionMarker(game);
  game.spawnPoliceBullet = (shooter, angle) => fireBullet(game, shooter, angle, 'vela', 'police');
  game.spawnEnemyBullet = (shooter, angle) => fireBullet(game, shooter, angle, 'brisa', 'enemy');
  game.onCarDestroyed = (car) => {
    if (car === game.player.car) game.player.mode = 'car';
  };
  game.onImpact = (car, impact) => {
    game.audio.crash(car.x, car.y);
    if (impact > 220) game.camera.shake = Math.min(18, game.camera.shake + 6);
  };
  game.onCarCrash = (one, two, closing) => {
    game.audio.crash(one.x, one.y);
    if (closing > 260) game.camera.shake = Math.min(16, game.camera.shake + 4);
  };
  game.onWasted = () => {
    if (game.state !== 'play') return;
    game.state = 'wasted';
    game.deathTimer = 0;
    game.money = Math.max(0, game.money - 120);
  };
  game.onBusted = () => {
    if (game.state !== 'play') return;
    game.state = 'busted';
    game.deathTimer = 0;
    game.money = Math.max(0, game.money - 90);
    if (game.player.mode === 'car' && game.player.car) {
      game.player.car.driver = null;
      game.player.mode = 'foot';
      game.player.car = null;
    }
  };

  return game;
}

/** One fixed step of everything. */
export function updateWorld(game, input, dt) {
  game.time += dt;
  game.clock = (game.clock + dt * 0.02) % 24;
  if (game.toastFor > 0) game.toastFor -= dt;

  updatePlayer(game, input, dt);
  const p = game.player;
  game.audio.setListener(p.x, p.y);

  // Traffic, runners and the player's own car.
  for (const car of game.cars) {
    if (car === p.car) continue;
    if (car.health <= 0) continue;
    if (car.runner) stepRunner(game, car, dt);
    else if (car.kind === 'traffic') stepTrafficCar(car, dt, game);
    else if (car.kind === 'police') {
      // Police cars are driven in the police update, which knows where the player is.
    } else if (car.driver === 'ai') {
      driveCar(car, { throttle: 0.6, steer: 0, handbrake: false }, dt, game);
    }
  }

  for (const ped of game.peds) {
    if (!ped.hostile) stepPed(ped, dt, game);
  }
  stepHostiles(game, dt);

  updatePolice(game, dt);
  updateProjectiles(game, dt);
  updateParticles(game, dt);
  updatePickups(game, dt);
  updateWrecks(game, dt);
  tyreMarks(game, dt);
  separateCars(game);
  runOverPeople(game, dt);
  maintainTraffic(game, dt, game.rng);
  maintainPeds(game, dt, game.rng);
  updateMissions(game, dt);
  checkMissionStart(game);

  // Nothing burns forever.
  for (const car of game.cars) {
    if (car.burning > 0.7 && !car.exploded) explodeCar(game, car);
  }

  const zoom = p.mode === 'car'
    ? (game.wanted.level >= 3 ? CAMERA.zoomChase : CAMERA.zoomDriving)
    : CAMERA.zoom;
  followTarget(game.camera, { x: p.x, y: p.y, vx: p.vx, vy: p.vy }, dt, game.city, zoom);
  game.audio.update(dt, game);
  if (game.state === 'play' && Math.floor(game.time * 10) % 600 === 0) game.save();
}

/**
 * The marks a tyre leaves: a skid where a car is sliding sideways, and a puff of smoke off the
 * back wheels, so a chase reads as a chase even in a still frame.
 */
function tyreMarks(game, dt) {
  for (const car of game.cars) {
    if (car.health <= 0) continue;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 110) continue;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const lateral = -car.vx * fy + car.vy * fx;
    if (Math.abs(lateral) > 48) {
      if (game.rng.chance(dt * 26)) {
        addDecal(game, car.x - fx * car.len * 0.3, car.y - fy * car.len * 0.3, 'skid', 'rgba(26, 22, 24, 0.3)', car.angle, 4);
      }
      if (game.rng.chance(dt * 14)) {
        spawnParticles(game, car.x - fx * car.len * 0.4, car.y - fy * car.len * 0.4, 1, 'rgba(214, 208, 196, 0.55)', 46, 4);
      }
    } else if (speed > 240 && game.rng.chance(dt * 7)) {
      // Dust and grit off the tyres at speed: the cheapest way to show that a car is flying.
      spawnParticles(game, car.x - fx * car.len * 0.5, car.y - fy * car.len * 0.5, 1, 'rgba(226, 216, 196, 0.4)', 30, 5);
    }
  }
}

/** A car at speed over a person: they go down, the car loses a little of its own momentum. */
function runOverPeople(game, dt) {
  const p = game.player;
  for (const car of game.cars) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 90 || car.health <= 0) continue;
    const reach = car.len * 0.5;
    for (const ped of [...game.peds]) {
      if (Math.hypot(ped.x - car.x, ped.y - car.y) > reach) continue;
      hurtPed(game, ped, speed * 0.55);
      car.vx *= 0.86;
      car.vy *= 0.86;
      game.audio.crash(car.x, car.y);
      if (car === p.car) game.reportCrime?.(car.x, car.y, 90, 'hit and run');
    }
    if (p.mode === 'foot' && Math.hypot(p.x - car.x, p.y - car.y) < reach && car !== p.car) {
      hurtPlayer(game, speed * 0.22);
    }
  }
  void dt;
}

/** Walking into the marker by the safehouse opens the next job. */
function checkMissionStart(game) {
  if (game.mission.active) return;
  if (game.mission.index >= 6) return;
  const marker = missionMarker(game);
  if (!marker || marker.kind !== 'mission') return;
  const p = game.player;
  if (Math.hypot(p.x - marker.x, p.y - marker.y) < marker.radius) {
    startMission(game, game.mission.index);
  }
}

/** Puts a wreck back on the road: used by the screenshots and by a respawn after a bust. */
export function clearStreet(game, radius) {
  const p = game.player;
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car === p.car) continue;
    if (car.kind === 'parked') continue;
    if (Math.hypot(car.x - p.x, car.y - p.y) < radius) game.cars.splice(i, 1);
  }
  void wreck;
  void clearWanted;
  void WANTED;
  void PLAYER;
  void STEP;
}

/** Back on the pavement after a wasted or a bust: health, a clear record, no stars. */
export function respawn(game) {
  const p = game.player;
  p.mode = 'foot';
  p.car = null;
  p.health = 100;
  p.armor = 0;
  p.invuln = 2.5;
  p.x = game.city.landmarks.safehouse.x;
  p.y = game.city.landmarks.safehouse.y;
  p.vx = 0;
  p.vy = 0;
  clearWanted(game);
  for (const car of game.cars) if (car.police) car.health = 0;
  game.officers.length = 0;
  game.bullets.length = 0;
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.mission.timer = 0;
  pushOutOfWalls(game.walls, p, PLAYER.radius);
  game.state = 'play';
}

/** The car the player is in, if any, made ready for a screenshot or a cut. */
export function parkPlayerCar(game, model, x, y, angle) {
  const car = createCar(game.rng, { x, y, angle, model, kind: 'stolen' });
  car.driver = 'player';
  car.body = '#c8452f';
  game.cars.push(car);
  game.player.mode = 'car';
  game.player.car = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}
