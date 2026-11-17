// Bullets, sparks, smoke, fire and the things people drop: the violence and the noise of Marisol.
// Everything here works on the game's own arrays, so the renderer draws them and the police hear
// them; a shot is also a crime, and every shot tells the wanted system where it happened.
import { WEAPONS } from './config.js';
import { pointInWall } from './spatial.js';
import { damageCar, wreck } from './vehicle.js';

/** One round, from a muzzle toward a point a long way off. */
export function fireBullet(game, shooter, angle, weaponKey, owner) {
  const weapon = WEAPONS[weaponKey] ?? WEAPONS.vela;
  const pellets = weapon.pellets ?? 1;
  for (let i = 0; i < pellets; i += 1) {
    const spread = (game.rng.next() * 2 - 1) * weapon.spread;
    const a = angle + spread;
    game.bullets.push({
      x: shooter.x + Math.cos(a) * 16,
      y: shooter.y + Math.sin(a) * 16,
      vx: Math.cos(a) * weapon.speed,
      vy: Math.sin(a) * weapon.speed,
      life: 0.75,
      damage: weapon.damage,
      owner,
      color: weapon.tracer,
    });
  }
  addFlash(game, shooter.x + Math.cos(angle) * 18, shooter.y + Math.sin(angle) * 18, 46);
  spawnParticles(game, shooter.x + Math.cos(angle) * 18, shooter.y + Math.sin(angle) * 18, 3, '#ffd98a', 90);
  game.audio?.shot(weaponKey, shooter.x, shooter.y);
  // Only the player's own gunfire is a crime on his record; the crew's shots are just noise.
  if (owner === 'player') game.reportCrime?.(shooter.x, shooter.y, 26, 'gunfire');
}

/** Moves every round, stops it on a wall or a body, and leaves a mark where it lands. */
export function updateProjectiles(game, dt) {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) {
      game.bullets.splice(i, 1);
      continue;
    }
    if (pointInWall(game.walls, b.x, b.y)) {
      spawnParticles(game, b.x, b.y, 4, '#d9d2c0', 110);
      game.bullets.splice(i, 1);
      continue;
    }
    let hit = false;

    // The player, if someone else fired it.
    if (!hit && b.owner !== 'player') {
      const p = game.player;
      if (Math.hypot(p.x - b.x, p.y - b.y) < 14) {
        hurtPlayer(game, b.damage);
        spawnParticles(game, b.x, b.y, 6, '#c2453c', 120);
        hit = true;
      }
    }
    if (!hit) {
      for (const ped of game.peds) {
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
          hurtPed(game, ped, b.damage);
          spawnParticles(game, b.x, b.y, 6, '#a8322c', 130);
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (const cop of game.officers) {
        if (Math.hypot(cop.x - b.x, cop.y - b.y) < 12) {
          hurtOfficer(game, cop, b.damage);
          spawnParticles(game, b.x, b.y, 6, '#a8322c', 130);
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (const car of game.cars) {
        if (car.health <= 0) continue;
        if (Math.hypot(car.x - b.x, car.y - b.y) < Math.max(car.len, car.wid) * 0.42) {
          damageCar(car, b.damage * 0.55, game);
          spawnParticles(game, b.x, b.y, 4, '#ffd98a', 140);
          if (b.owner === 'player') game.reportCrime?.(car.x, car.y, 12, 'gunfire');
          hit = true;
          break;
        }
      }
    }
    if (hit) game.bullets.splice(i, 1);
  }
}

/** Blood, sparks, dust, smoke: one pool of round motes with a colour and a drift. */
export function spawnParticles(game, x, y, count, color, speed, size = 3) {
  for (let i = 0; i < count; i += 1) {
    if (game.particles.length > 460) break;
    const a = game.rng.angle();
    const v = speed * game.rng.range(0.3, 1);
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: game.rng.range(0.3, 0.8),
      maxLife: 0.8,
      size: size * game.rng.range(0.6, 1.4),
      color,
      drag: 2.4,
    });
  }
}

export function updateParticles(game, dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const p = game.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx -= p.vx * Math.min(1, p.drag * dt);
    p.vy -= p.vy * Math.min(1, p.drag * dt);
  }
  for (let i = game.flashes.length - 1; i >= 0; i -= 1) {
    const f = game.flashes[i];
    f.life -= dt;
    if (f.life <= 0) game.flashes.splice(i, 1);
  }
  for (let i = game.decals.length - 1; i >= 0; i -= 1) {
    const d = game.decals[i];
    d.life -= dt;
    if (d.life <= 0) game.decals.splice(i, 1);
  }
}

export function addFlash(game, x, y, radius) {
  game.flashes.push({ x, y, radius, life: 0.09, maxLife: 0.09 });
}

export function addDecal(game, x, y, kind, color, angle = 0, size = 10) {
  game.decals.push({ x, y, kind, color, angle, size, life: 14, maxLife: 14 });
}

/** A person takes a hit; at zero they drop, and drop what they carried. */
export function hurtPed(game, ped, amount) {
  ped.health -= amount;
  panicPedsNearby(game, ped.x, ped.y);
  if (ped.health > 0) {
    ped.state = 'flee';
    ped.fleeFor = 3;
    return;
  }
  game.peds.splice(game.peds.indexOf(ped), 1);
  addDecal(game, ped.x, ped.y, 'blood', 'rgba(120, 30, 26, 0.45)', 0, 14);
  spawnParticles(game, ped.x, ped.y, 10, '#8f2b25', 130);
  game.stats.kills += 1;
  if (game.rng.chance(0.5)) spawnPickup(game, ped.x, ped.y, 'cash');
  game.reportCrime?.(ped.x, ped.y, 120, 'murder');
}

export function hurtOfficer(game, cop, amount) {
  cop.health -= amount;
  if (cop.health > 0) return;
  game.officers.splice(game.officers.indexOf(cop), 1);
  addDecal(game, cop.x, cop.y, 'blood', 'rgba(110, 28, 24, 0.42)', 0, 13);
  spawnParticles(game, cop.x, cop.y, 10, '#8f2b25', 120);
  game.stats.kills += 1;
  game.reportCrime?.(cop.x, cop.y, 260, 'officer down');
  spawnPickup(game, cop.x, cop.y, game.rng.chance(0.6) ? 'health' : 'armor');
}

export function hurtPlayer(game, amount) {
  const p = game.player;
  if (p.invuln > 0 || game.state !== 'play') return;
  if (p.armor > 0) {
    const soak = Math.min(p.armor, amount * 0.6);
    p.armor -= soak;
    amount -= soak;
  }
  p.health -= amount;
  p.invuln = 0.3;
  game.camera.shake = Math.min(20, game.camera.shake + 5);
  spawnParticles(game, p.x, p.y, 5, '#a8322c', 120);
  if (p.health <= 0) {
    p.health = 0;
    game.onWasted?.();
  }
}

function panicPedsNearby(game, x, y) {
  for (const ped of game.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < 320) {
      ped.state = 'flee';
      ped.fleeFor = 4;
      ped.angle = Math.atan2(ped.y - y, ped.x - x);
    }
  }
}

/** A car blows: fire, smoke, a shove to everything near it, and a crime on the record. */
export function explodeCar(game, car) {
  if (car.exploded) return;
  car.exploded = true;
  wreck(car);
  addFlash(game, car.x, car.y, 190);
  spawnParticles(game, car.x, car.y, 40, '#ffb347', 320, 5);
  spawnParticles(game, car.x, car.y, 26, '#5a5450', 180, 7);
  addDecal(game, car.x, car.y, 'scorch', 'rgba(28, 22, 20, 0.5)', 0, 30);
  game.camera.shake = Math.min(26, game.camera.shake + 16);
  game.audio?.explosion(car.x, car.y);
  panicPedsNearby(game, car.x, car.y);

  for (const ped of [...game.peds]) {
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 90) hurtPed(game, ped, 90);
  }
  for (const cop of [...game.officers]) {
    if (Math.hypot(cop.x - car.x, cop.y - car.y) < 90) hurtOfficer(game, cop, 90);
  }
  for (const other of game.cars) {
    if (other === car || other.health <= 0) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 120) damageCar(other, 70 * (1 - d / 120), game);
  }
  const p = game.player;
  if (Math.hypot(p.x - car.x, p.y - car.y) < 100) hurtPlayer(game, 34);
  game.reportCrime?.(car.x, car.y, 150, 'explosion');
}

export function spawnPickup(game, x, y, kind) {
  game.pickups.push({ x, y, kind, life: 40 });
}

export function updatePickups(game, dt) {
  const p = game.player;
  for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
    const item = game.pickups[i];
    item.life -= dt;
    if (item.life <= 0) {
      game.pickups.splice(i, 1);
      continue;
    }
    if (Math.hypot(item.x - p.x, item.y - p.y) > 26) continue;
    if (item.kind === 'cash') {
      game.money += 15 + Math.floor(game.rng.next() * 40);
      game.audio?.pickup('cash');
    } else if (item.kind === 'health') {
      p.health = Math.min(100, p.health + 34);
      game.audio?.pickup('health');
    } else {
      p.armor = Math.min(100, p.armor + 40);
      game.audio?.pickup('armor');
    }
    game.pickups.splice(i, 1);
  }
}

/** A wreck that has burned long enough stops smoking and stays as scenery. */
export function updateWrecks(game, dt) {
  for (const car of game.cars) {
    if (car.burning > 0) {
      car.burning += dt;
      if (car.burning > 0.6) explodeCar(game, car);
    }
    if (car.wrecked && car.health <= 0) {
      if (game.rng.chance(dt * 3)) spawnParticles(game, car.x, car.y, 1, 'rgba(70, 64, 60, 0.7)', 26, 5);
    }
  }
}
