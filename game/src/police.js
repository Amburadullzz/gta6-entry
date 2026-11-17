// The wanted system and the police who answer it: heat from every crime, a star level from the
// heat, cars that come looking and officers who get out and shoot. Lose them by breaking line of
// sight and waiting; stand still next to one and you are busted.
import { POLICE, WANTED } from './config.js';
import { angleDelta, createCar, damageCar, driveCar } from './vehicle.js';
import { lineBlocked } from './spatial.js';
import { addFlash, spawnParticles } from './combat.js';
import { snapToRoad } from './traffic.js';

export function createWanted() {
  return { heat: 0, level: 0, calm: 0, lastCrime: -99, reason: '', flash: 0, waveTimer: 2 };
}

/** A crime, wherever it happened: it raises the heat and the stars follow it. */
export function reportCrime(game, x, y, heat, reason) {
  const wanted = game.wanted;
  const p = game.player;
  const distance = Math.hypot(p.x - x, p.y - y);
  const seen = distance < WANTED.witnessRange;
  if (!seen && reason !== 'gunfire') return;
  wanted.heat = Math.min(WANTED.stars[WANTED.max] * 1.25, wanted.heat + heat);
  wanted.lastCrime = game.time;
  wanted.calm = 0;
  wanted.reason = reason;
  const level = levelFor(wanted.heat);
  if (level > wanted.level) {
    wanted.level = level;
    wanted.flash = 3;
    game.audio?.wanted(level);
  }
}

function levelFor(heat) {
  let level = 0;
  for (let i = 1; i <= WANTED.max; i += 1) if (heat >= WANTED.stars[i]) level = i;
  return level;
}

/** Clears the stars: a bribe, a respawn, or the end of a mission. */
export function clearWanted(game) {
  game.wanted.heat = 0;
  game.wanted.level = 0;
  game.wanted.flash = 0;
  game.wanted.waveTimer = 2;
}

/** The whole force, one step: cooling off, calling cars and officers, and moving them. */
export function updatePolice(game, dt) {
  const wanted = game.wanted;
  const p = game.player;
  wanted.flash = Math.max(0, wanted.flash - dt);

  // Heat cools when nothing has happened for a while and no officer can see the player.
  const quiet = game.time - wanted.lastCrime;
  if (wanted.level > 0 && quiet > 6) {
    const watched = game.officers.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 620)
      || game.cars.some((c) => c.police && Math.hypot(c.x - p.x, c.y - p.y) < 700);
    wanted.heat -= (watched ? WANTED.cool : WANTED.coolHidden) * dt;
    if (wanted.heat <= 0) {
      wanted.heat = 0;
      wanted.level = 0;
      wanted.reason = '';
    } else {
      wanted.level = levelFor(wanted.heat);
    }
  }

  if (wanted.level === 0) {
    // With no stars, the force goes home.
    for (let i = game.officers.length - 1; i >= 0; i -= 1) {
      const o = game.officers[i];
      if (Math.hypot(o.x - p.x, o.y - p.y) > 700) game.officers.splice(i, 1);
    }
    return;
  }

  wanted.waveTimer -= dt;
  const policeCars = game.cars.filter((c) => c.police && c.health > 0).length;
  if (wanted.waveTimer <= 0) {
    wanted.waveTimer = POLICE.wave[wanted.level] ?? 4;
    if (policeCars < Math.min(POLICE.carsMax, wanted.level + 1)) spawnPoliceCar(game);
    if (wanted.level >= 2 && game.officers.length < Math.min(POLICE.officersMax, wanted.level * 2)) {
      spawnOfficers(game, 2);
    }
  }

  for (const car of game.cars) {
    if (!car.police || car.health <= 0) continue;
    stepPoliceCar(game, car, dt);
  }
  for (const cop of game.officers) stepOfficer(game, cop, dt);

  // Busted: an officer on top of you for a moment while you are on foot.
  if (p.mode === 'foot') {
    const close = game.officers.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 44);
    if (close) {
      wanted.bustTimer = (wanted.bustTimer ?? 0) + dt;
      if (wanted.bustTimer > 1.4) {
        wanted.bustTimer = 0;
        game.onBusted?.();
      }
    } else {
      wanted.bustTimer = 0;
    }
  }
}

/** A police car, put on the nearest road a little way off the player. */
function spawnPoliceCar(game) {
  const p = game.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const a = game.rng.angle();
    const d = game.rng.range(700, POLICE.spawnRange);
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (x < 100 || x > game.city.size - 100 || y < 100 || y > game.city.size - 100) continue;
    const spot = snapToRoad(game.city, x, y);
    if (!spot) continue;
    const car = createCar(game.rng, {
      x: spot.x,
      y: spot.y,
      angle: spot.dir === 0 ? 0 : spot.dir === 2 ? Math.PI : spot.dir === 1 ? Math.PI / 2 : -Math.PI / 2,
      model: 'police',
      kind: 'police',
      body: '#e9eef2',
    });
    car.health = 160;
    car.driver = 'ai';
    car.axis = spot.axis;
    car.road = spot.road;
    car.dir = spot.dir;
    car.cruise = POLICE.carSpeed;
    game.cars.push(car);
    return;
  }
}

/** Two officers out of the nearest police car, on the pavement beside it. */
function spawnOfficers(game, count) {
  const p = game.player;
  for (let i = 0; i < count; i += 1) {
    const a = game.rng.angle();
    const d = game.rng.range(240, 480);
    game.officers.push({
      x: p.x + Math.cos(a) * d,
      y: p.y + Math.sin(a) * d,
      vx: 0,
      vy: 0,
      angle: a,
      stride: game.rng.range(0, 9),
      shirt: '#dfe6ec',
      skin: game.rng.pick(['#8d5a3b', '#b47b52', '#6b4229', '#d9a273']),
      health: 62,
      armed: true,
      fireCooldown: game.rng.range(0.3, 1.4),
      state: 'chase',
    });
  }
}

/** A cruiser: drive at the player, ram when close, and let the officers out. */
function stepPoliceCar(game, car, dt) {
  const p = game.player;
  const targetX = p.x + (p.vx ?? 0) * 0.22;
  const targetY = p.y + (p.vy ?? 0) * 0.22;
  const want = Math.atan2(targetY - car.y, targetX - car.x);
  const d = angleDelta(car.angle, want);
  const distance = Math.hypot(p.x - car.x, p.y - car.y);
  const steer = Math.max(-1, Math.min(1, d * 2.2));
  const throttle = distance < 70 ? -0.5 : 1;
  driveCar(car, { throttle, steer, handbrake: false }, dt, game);

  // Close enough, and stopped enough, to put boots on the pavement.
  if (distance < 110 && Math.abs(car.speed) < 70 && game.officers.length < POLICE.officersMax) {
    if (game.rng.chance(dt * 1.6)) {
      const cop = {
        x: car.x + game.rng.range(-30, 30),
        y: car.y + game.rng.range(-30, 30),
        vx: 0,
        vy: 0,
        angle: want,
        stride: game.rng.range(0, 9),
        shirt: '#dfe6ec',
        skin: game.rng.pick(['#8d5a3b', '#b47b52', '#6b4229', '#d9a273']),
        health: 62,
        armed: true,
        fireCooldown: game.rng.range(0.4, 1.2),
        state: 'chase',
      };
      game.officers.push(cop);
    }
  }

  // Ramming hurts the player's car and both bodies of paint.
  if (p.mode === 'car' && p.car && distance < 46) {
    const speed = Math.abs(car.speed);
    if (speed > 90 && car.hitCooldown <= 0) {
      damageCar(p.car, 6 + speed * 0.05, game);
      damageCar(car, 4, game);
      car.hitCooldown = 0.8;
      addFlash(game, car.x, car.y, 60);
      game.audio?.crash(car.x, car.y);
    }
  }
  if (distance > POLICE.despawnRange) {
    const at = game.cars.indexOf(car);
    if (at >= 0) game.cars.splice(at, 1);
  }
}

/** An officer on foot: close the distance, then shoot from cover range. */
function stepOfficer(game, cop, dt) {
  const p = game.player;
  const dx = p.x - cop.x;
  const dy = p.y - cop.y;
  const distance = Math.hypot(dx, dy) || 1;
  cop.angle = Math.atan2(dy, dx);
  cop.stride += dt * 1.4;

  const wantDistance = 170;
  const speed = distance > wantDistance ? POLICE.officerSpeedChase : distance < 90 ? -POLICE.officerSpeed * 0.5 : 0;
  cop.x += (dx / distance) * speed * dt;
  cop.y += (dy / distance) * speed * dt;
  cop.vx = (dx / distance) * speed;
  cop.vy = (dy / distance) * speed;
  cop.x = Math.max(24, Math.min(game.city.size - 24, cop.x));
  cop.y = Math.max(24, Math.min(game.city.size - 24, cop.y));

  cop.fireCooldown -= dt;
  const clear = !lineBlocked(game.walls, cop.x, cop.y, p.x, p.y, 9);
  if (cop.fireCooldown <= 0 && distance < POLICE.shootRange && clear) {
    cop.fireCooldown = game.rng.range(0.65, 1.35);
    const spread = game.rng.range(-0.09, 0.09);
    game.spawnPoliceBullet?.(cop, Math.atan2(dy, dx) + spread);
  }

  if (distance > POLICE.despawnRange) {
    const at = game.officers.indexOf(cop);
    if (at >= 0) game.officers.splice(at, 1);
  }
  if (game.rng.chance(dt * 0.2)) spawnParticles(game, cop.x, cop.y, 1, 'rgba(210, 210, 200, 0.4)', 12, 2);
}
