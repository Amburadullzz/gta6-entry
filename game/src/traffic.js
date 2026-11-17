// Traffic: the cars that are already on Marisol's roads when the player arrives. They keep to the
// right-hand lane of a grid of streets, turn at the junctions, brake for whatever is in front of
// them and are worth stealing. Parked cars come from the same factory and just sit there.
import { TRAFFIC, WORLD } from './config.js';
import { roadCenter } from './city.js';
import { DIRS, createCar } from './vehicle.js';

/** A lane's own centre line, on the road the car is travelling along. */
function laneTarget(car) {
  const base = roadCenter(car.road);
  if (car.axis === 'h') return { x: null, y: base + (car.dir === 0 ? car.lane : -car.lane) };
  return { x: base + (car.dir === 1 ? -car.lane : car.lane), y: null };
}

/** The next junction centre the car will reach, along its direction of travel. */
function nextJunction(car) {
  const pos = car.axis === 'h' ? car.x : car.y;
  const step = car.axis === 'h' ? DIRS[car.dir].x : DIRS[car.dir].y;
  const base = WORLD.road / 2;
  if (step > 0) {
    const index = Math.floor((pos - base) / WORLD.block) + 1;
    return { index, at: base + index * WORLD.block };
  }
  const index = Math.ceil((pos - base) / WORLD.block) - 1;
  return { index, at: base + index * WORLD.block };
}

/** Parked cars along the kerbs, from the parking the city generator left. */
export function spawnParkedCars(game, rng) {
  for (const spot of game.city.parking) {
    game.cars.push(createCar(rng, {
      x: spot.x,
      y: spot.y,
      angle: spot.angle,
      model: spot.model,
      kind: 'parked',
    }));
  }
}

/** One traffic car's step: forward, keep the lane, follow what is ahead, turn at junctions. */
export function stepTrafficCar(car, dt, game) {
  const dir = DIRS[car.dir];
  const lane = laneTarget(car);
  // Car following: the gap to whatever is in the lane sets the speed, so a queue rolls rather
  // than stopping and starting, and nothing ends up inside anything else.
  const gap = gapAhead(car, game, dir);
  const wanted = gap > 260 ? car.cruise : Math.max(0, Math.min(car.cruise, (gap - 42) * 1.9));
  const rate = wanted > car.speed ? 120 : 460;
  car.speed += Math.max(-rate * dt, Math.min(rate * dt, wanted - car.speed));
  if (car.speed < 0) car.speed = 0;

  const step = car.speed * dt;
  if (car.axis === 'h') {
    car.x += dir.x * step;
    car.y += (lane.y - car.y) * Math.min(1, dt * 6);
    car.angle = dir.x > 0 ? 0 : Math.PI;
  } else {
    car.y += dir.y * step;
    car.x += (lane.x - car.x) * Math.min(1, dt * 6);
    car.angle = dir.y > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  car.vx = dir.x * car.speed;
  car.vy = dir.y * car.speed;
  if (car.police) car.lightPhase = (car.lightPhase + dt * 3.4) % 1;

  // At a junction: sometimes turn, sometimes carry on, never into the map's edge.
  const junction = nextJunction(car);
  const along = car.axis === 'h' ? car.x : car.y;
  const passed = dir.x > 0 || dir.y > 0 ? along >= junction.at - 3 : along <= junction.at + 3;
  if (passed && junction.index >= 0 && junction.index <= game.city.cells) {
    const options = [car.dir, car.dir, car.dir];
    if (game.rng.chance(0.3)) options.push((car.dir + 1) % 4);
    if (game.rng.chance(0.3)) options.push((car.dir + 3) % 4);
    const next = game.rng.pick(options);
    if (next !== car.dir) {
      car.axis = car.axis === 'h' ? 'v' : 'h';
      car.dir = next;
      car.road = junction.index;
    }
  }

  car.stuck = car.speed < 6 ? car.stuck + dt : 0;
  if (car.stuck > 8) {
    // Wedged for a long time: nudge it out of the junction so the street can move again.
    car.stuck = 0;
    car.speed = car.cruise * 0.6;
  }
}

/** The clear distance to the nearest solid thing in this car's lane. */
function gapAhead(car, game, dir) {
  const reach = TRAFFIC.stopDistance + car.len;
  let best = reach;
  for (const other of game.cars) {
    if (other === car || other.health <= 0) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * dir.x + dy * dir.y;
    const side = Math.abs(dx * dir.y - dy * dir.x);
    if (ahead <= 6 || ahead > reach || side > 30) continue;
    best = Math.min(best, ahead - (other.len * 0.5));
  }
  const p = game.player;
  if (p.mode === 'foot') {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const ahead = dx * dir.x + dy * dir.y;
    const side = Math.abs(dx * dir.y - dy * dir.x);
    if (ahead > 4 && ahead < reach && side < 26) best = Math.min(best, ahead - 18);
  }
  return best;
}

/** Keeps the streets busy near the player, and clears the ones far away. */
export function maintainTraffic(game, dt, rng) {
  const player = game.player;
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const car = game.cars[i];
    if (car === player.car) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (car.kind === 'traffic' && d > TRAFFIC.despawnRange) game.cars.splice(i, 1);
  }

  const live = game.cars.filter((c) => c.kind === 'traffic').length;
  let spawns = TRAFFIC.max - live;
  while (spawns > 0) {
    spawns -= 1;
    const angle = rng.angle();
    const dist = rng.range(620, TRAFFIC.spawnRange);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    if (x < 80 || x > game.city.size - 80 || y < 80 || y > game.city.size - 80) continue;
    const onRoad = snapToRoad(game.city, x, y);
    if (!onRoad) continue;
    const car = createCar(rng, {
      x: onRoad.x,
      y: onRoad.y,
      angle: DIRS[onRoad.dir].angle,
      kind: 'traffic',
    });
    car.axis = onRoad.axis;
    car.road = onRoad.road;
    car.dir = onRoad.dir;
    game.cars.push(car);
  }
  void dt;
}

/** The nearest lane point to a world position, and the direction a car there would face. */
export function snapToRoad(city, x, y) {
  const base = WORLD.road / 2;
  const i = Math.round((x - base) / WORLD.block);
  const j = Math.round((y - base) / WORLD.block);
  if (i < 0 || j < 0 || i > city.cells || j > city.cells) return null;
  const dx = Math.abs(x - roadCenter(i));
  const dy = Math.abs(y - roadCenter(j));
  if (dx <= dy) {
    const dir = y > roadCenter(j) ? 0 : 2;
    return { x, y: roadCenter(j) + (dir === 0 ? TRAFFIC.lane : -TRAFFIC.lane), axis: 'h', road: j, dir };
  }
  const dir = x > roadCenter(i) ? 1 : 3;
  return { x: roadCenter(i) + (dir === 1 ? -TRAFFIC.lane : TRAFFIC.lane), y, axis: 'v', road: i, dir };
}

/**
 * Keeps cars out of each other: overlapping pairs are pushed apart, and a fast car that hits a
 * slow one passes some of its speed on. Cheap, and enough to keep the streets from merging.
 */
export function separateCars(game) {
  const cars = game.cars;
  for (let a = 0; a < cars.length; a += 1) {
    const one = cars[a];
    if (one.health <= 0) continue;
    for (let b = a + 1; b < cars.length; b += 1) {
      const two = cars[b];
      if (two.health <= 0) continue;
      const dx = two.x - one.x;
      const dy = two.y - one.y;
      const reach = (one.len + two.len) * 0.34;
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const push = (reach - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      one.x -= nx * push;
      one.y -= ny * push;
      two.x += nx * push;
      two.y += ny * push;
      const closing = (one.vx - two.vx) * nx + (one.vy - two.vy) * ny;
      if (closing > 120 && one.hitCooldown <= 0 && two.hitCooldown <= 0) {
        game.onCarCrash?.(one, two, closing);
        one.hitCooldown = 0.4;
        two.hitCooldown = 0.4;
        one.vx *= 0.55;
        one.vy *= 0.55;
        two.vx *= 0.7;
        two.vy *= 0.7;
      }
    }
  }
}
