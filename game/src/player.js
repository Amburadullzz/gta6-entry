// Tavo Reyes, on foot and behind the wheel: walking and sprinting, aiming with the mouse, the
// weapons he carries, and getting into any car he can reach. One function a step reads the input
// and moves him; the mode decides whether that is his own legs or a stolen car.
import { PLAYER, STEP, WEAPONS } from './config.js';
import { addShake, screenToWorld } from './camera.js';
import { pushOutOfWalls } from './spatial.js';
import { fireBullet } from './combat.js';
import { driveCar, nearestCar } from './vehicle.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    aim: -Math.PI / 2,
    stride: 0,
    health: PLAYER.health,
    armor: PLAYER.armor,
    invuln: 0,
    mode: 'foot',
    car: null,
    weapon: 'vela',
    arsenal: {
      vela: { mag: 12, reserve: 72 },
      brisa: { mag: 0, reserve: 0 },
      costa: { mag: 0, reserve: 0 },
    },
    fireCooldown: 0,
    reloading: 0,
    aiming: false,
    shirt: '#f4efe2',
    skin: '#b47b52',
    inCarPrompt: null,
  };
}

/** Ammunition for the gun in his hands, as {mag, reserve}. */
export function heldWeapon(player) {
  return player.arsenal[player.weapon] ?? player.arsenal.vela;
}

/** Reads the keys and moves the player for one fixed step. */
export function updatePlayer(game, input, dt) {
  const p = game.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);

  // Where the mouse points, in the world.
  const target = screenToWorld(game.camera, input.mouse.x, input.mouse.y);
  p.aim = Math.atan2(target.y - p.y, target.x - p.x);

  if (input.pressed('enter')) toggleVehicle(game);
  if (input.mouse.wheel !== 0) cycleWeapon(p, input.mouse.wheel);

  if (p.mode === 'car' && p.car) updateDriving(game, input, dt);
  else updateOnFoot(game, input, dt);

  // E to get in is offered only when a car is in reach.
  if (p.mode === 'foot') {
    const car = nearestCar(game.cars, p.x, p.y, PLAYER.enterRange);
    p.inCarPrompt = car && car !== p.car ? car : null;
  } else {
    p.inCarPrompt = null;
  }
}

function updateOnFoot(game, input, dt) {
  const p = game.player;
  let ax = 0;
  let ay = 0;
  if (input.down('left')) ax -= 1;
  if (input.down('right')) ax += 1;
  if (input.down('forward')) ay -= 1;
  if (input.down('back')) ay += 1;
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;

  const speed = input.down('sprint') ? PLAYER.sprint : PLAYER.walk;
  const wantX = ax * speed;
  const wantY = ay * speed;
  p.vx += (wantX - p.vx) * Math.min(1, dt * (ax || ay ? 11 : 15));
  p.vy += (wantY - p.vy) * Math.min(1, dt * (ax || ay ? 11 : 15));
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  pushOutOfWalls(game.walls, p, PLAYER.radius);
  p.x = Math.max(24, Math.min(game.city.size - 24, p.x));
  p.y = Math.max(24, Math.min(game.city.sea.y - 30, p.y));

  const moving = Math.hypot(p.vx, p.vy);
  p.stride += dt * (moving / 90);
  if (moving > 12) p.angle = Math.atan2(p.vy, p.vx);
  else p.angle = p.aim;
  p.aiming = moving < 40;
  p.car = null;

  // Reloading, then shooting.
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) finishReload(p);
  } else if (input.pressed('reload')) {
    beginReload(p);
  }
  const weapon = WEAPONS[p.weapon];
  if (input.fire() && !weapon.melee) {
    if (p.reloading <= 0) shoot(game, p, weapon);
  }
  if (input.fire() && weapon.melee && p.fireCooldown <= 0) {
    p.fireCooldown = weapon.rate;
    game.audio?.punch(p.x, p.y);
    const reach = weapon.range;
    for (const ped of [...game.peds]) {
      if (Math.hypot(ped.x - p.x, ped.y - p.y) < reach) {
        game.hurtPed?.(ped, weapon.damage);
      }
    }
  }
  game.audio?.footstep(p.x, p.y, moving > 40 ? 1 : 0);
}

function shoot(game, p, weapon) {
  const held = heldWeapon(p);
  if (p.fireCooldown > 0) return;
  if (held.mag <= 0) {
    beginReload(p);
    return;
  }
  held.mag -= 1;
  p.fireCooldown = weapon.rate;
  fireBullet(game, p, p.aim, p.weapon, 'player');
  addShake(game.camera, 1.6);
  game.stats.shots += 1;
}

function beginReload(p) {
  const weapon = WEAPONS[p.weapon];
  if (!weapon || weapon.melee) return;
  const held = heldWeapon(p);
  if (held.reserve <= 0 || held.mag >= weapon.mag) return;
  p.reloading = weapon.reload;
  p.audio?.reload?.();
}

function finishReload(p) {
  const weapon = WEAPONS[p.weapon];
  const held = heldWeapon(p);
  const need = weapon.mag - held.mag;
  const take = Math.min(need, held.reserve);
  held.mag += take;
  held.reserve -= take;
}

function cycleWeapon(p, direction) {
  const order = ['vela', 'brisa', 'costa'];
  const owned = order.filter((key) => p.arsenal[key].mag + p.arsenal[key].reserve > 0);
  if (owned.length === 0) return;
  const at = owned.indexOf(p.weapon);
  const next = owned[(at + direction + owned.length * 2) % owned.length];
  p.weapon = next;
  p.reloading = 0;
}

function updateDriving(game, input, dt) {
  const p = game.player;
  const car = p.car;
  const throttle = input.down('forward') ? 1 : input.down('back') ? -1 : 0;
  const steer = input.down('right') ? 1 : input.down('left') ? -1 : 0;
  driveCar(car, { throttle, steer, handbrake: input.down('handbrake') }, dt, game);
  car.driver = 'player';
  p.x = car.x;
  p.y = car.y;
  p.vx = car.vx;
  p.vy = car.vy;
  p.angle = car.angle;
  p.aiming = false;

  // Drive-by: a gun out of the window, in the car's own arc.
  if (input.fire() && p.fireCooldown <= 0) {
    const weapon = WEAPONS[p.weapon];
    const held = heldWeapon(p);
    if (weapon.melee) return;
    if (held.mag > 0) {
      held.mag -= 1;
      p.fireCooldown = weapon.rate * 1.35;
      fireBullet(game, car, p.aim, p.weapon, 'player');
      addShake(game.camera, 1.2);
    } else {
      beginReload(p);
    }
  }
}

/** E: into the nearest car, or out of the one he is in. */
function toggleVehicle(game) {
  const p = game.player;
  if (p.mode === 'car') {
    const car = p.car;
    if (!car) return;
    p.mode = 'foot';
    p.car = null;
    car.driver = null;
    // Step out on the left of the car, clear of the body.
    const outAngle = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(outAngle) * 26;
    p.y = car.y + Math.sin(outAngle) * 26;
    p.vx = 0;
    p.vy = 0;
    pushOutOfWalls(game.walls, p, PLAYER.radius);
    game.audio?.door(p.x, p.y);
    return;
  }
  const car = nearestCar(game.cars, p.x, p.y, PLAYER.enterRange);
  if (!car) return;
  p.mode = 'car';
  p.car = car;
  car.driver = 'player';
  car.kind = car.kind === 'parked' ? 'stolen' : car.kind;
  game.audio?.door(p.x, p.y);
  if (car.kind !== 'police') game.reportCrime?.(car.x, car.y, 34, 'vehicle theft');
}

/** Puts the player back at the safehouse after a wasted or a bust, keeping what he owns. */
export function revivePlayer(game) {
  const p = game.player;
  p.mode = 'foot';
  p.car = null;
  p.health = 100;
  p.armor = 0;
  p.vx = 0;
  p.vy = 0;
  p.invuln = 2;
  p.x = game.city.landmarks.safehouse.x;
  p.y = game.city.landmarks.safehouse.y;
  const held = heldWeapon(p);
  held.mag = WEAPONS[p.weapon].mag;
  void STEP;
}
