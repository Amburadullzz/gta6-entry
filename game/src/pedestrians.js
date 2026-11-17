// The people on the pavements: they walk a block's kerb, turn at its corners, run when a shot is
// fired or a body drops, and can be hit by a car like anyone else. They carry their own shirt and
// skin so a crowd never looks like one person copied.
import { PEDS, PALETTE } from './config.js';
import { pushOutOfWalls } from './spatial.js';

export function createPed(rng, x, y, block) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: rng.angle(),
    stride: rng.range(0, 10),
    shirt: rng.pick(PALETTE.pedShirts),
    skin: rng.pick(PALETTE.skin),
    speed: PEDS.walk * rng.range(0.8, 1.15),
    state: 'walk',
    block,
    target: null,
    health: 34,
    fleeFor: 0,
  };
}

/** A point on the pavement ring of a block, which is where people are allowed to be. */
function pavementPoint(rng, block) {
  const pad = 14;
  const w = block.w - pad * 2;
  const h = block.h - pad * 2;
  const edge = rng.int(0, 3);
  if (edge === 0) return { x: block.x + pad + rng.next() * w, y: block.y + pad };
  if (edge === 1) return { x: block.x + pad + w, y: block.y + pad + rng.next() * h };
  if (edge === 2) return { x: block.x + pad + rng.next() * w, y: block.y + pad + h };
  return { x: block.x + pad, y: block.y + pad + rng.next() * h };
}

/** Keeps the pavements near the player peopled, and clears the ones far off. */
export function maintainPeds(game, dt, rng) {
  const player = game.player;
  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    if (Math.hypot(ped.x - player.x, ped.y - player.y) > PEDS.despawnRange) game.peds.splice(i, 1);
  }
  let want = PEDS.max - game.peds.length;
  while (want > 0) {
    want -= 1;
    const angle = rng.angle();
    const dist = rng.range(280, PEDS.spawnRange);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    const block = blockNear(game.city, x, y);
    if (!block || block.sand) continue;
    const point = pavementPoint(rng, block);
    game.peds.push(createPed(rng, point.x, point.y, block));
  }
  void dt;
}

function blockNear(city, x, y) {
  for (const block of city.blocks) {
    if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) return block;
  }
  return null;
}

/** One person's step: stroll the block, or run from whatever scared them. */
export function stepPed(ped, dt, game) {
  ped.stride += dt * (ped.state === 'flee' ? 1.7 : 0.9);
  if (ped.state === 'flee') {
    ped.fleeFor -= dt;
    if (ped.fleeFor <= 0) {
      ped.state = 'walk';
      ped.target = null;
    }
  }

  let tx;
  let ty;
  let speed;
  if (ped.state === 'flee') {
    tx = ped.x + Math.cos(ped.angle) * 60;
    ty = ped.y + Math.sin(ped.angle) * 60;
    speed = PEDS.flee;
    // Weave a little, so a crowd scatters instead of running in one line.
    ped.angle += Math.sin(ped.stride * 2.1) * dt * 2.2;
  } else {
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
      ped.target = pavementPoint(game.rng, ped.block);
    }
    tx = ped.target.x;
    ty = ped.target.y;
    speed = ped.speed;
    const wanted = Math.atan2(ty - ped.y, tx - ped.x);
    let d = wanted - ped.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ped.angle += d * Math.min(1, dt * 5);
  }

  ped.vx = Math.cos(ped.angle) * speed;
  ped.vy = Math.sin(ped.angle) * speed;
  ped.x += ped.vx * dt;
  ped.y += ped.vy * dt;
  pushOutOfWalls(game.walls, ped, 9);

  // Nobody walks off the edge of the city, or into the sea.
  ped.x = Math.max(30, Math.min(game.city.size - 30, ped.x));
  ped.y = Math.max(30, Math.min(game.city.sea.y - 30, ped.y));
}

/** Everyone near a bang runs, in a direction away from it. */
export function panicPeds(game, x, y, radius) {
  for (const ped of game.peds) {
    const dx = ped.x - x;
    const dy = ped.y - y;
    const d = Math.hypot(dx, dy);
    if (d > radius || d < 1) continue;
    ped.state = 'flee';
    ped.fleeFor = 4 + game.rng.range(0, 3);
    ped.angle = Math.atan2(dy, dx) + game.rng.range(-0.5, 0.5);
  }
}
