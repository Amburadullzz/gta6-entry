// Cars: one body of physics for the player's car, the police and the traffic, with grip, drag, a
// handbrake that lets the back step out, and damage from every wall it meets. Traffic and police
// steer by setting the controls this module reads, so all of them corner and crash alike.
import { PALETTE, TRAFFIC, VEHICLE } from './config.js';
import { CAR_SHAPES } from './art.js';
import { pushOutOfWalls } from './spatial.js';

export const DIRS = [
  { x: 1, y: 0, angle: 0 },
  { x: 0, y: 1, angle: Math.PI / 2 },
  { x: -1, y: 0, angle: Math.PI },
  { x: 0, y: -1, angle: -Math.PI / 2 },
];

export function createCar(rng, spec) {
  const model = spec.model ?? rng.pick(TRAFFIC.models);
  const shape = CAR_SHAPES[model] ?? CAR_SHAPES.kestrel;
  return {
    x: spec.x,
    y: spec.y,
    angle: spec.angle ?? 0,
    vx: 0,
    vy: 0,
    speed: 0,
    model,
    len: shape.len,
    wid: shape.wid,
    body: spec.body ?? rng.pick(PALETTE.cars),
    glassColor: 'rgba(48, 74, 88, 0.92)',
    health: VEHICLE.health,
    kind: spec.kind ?? 'traffic',
    police: spec.kind === 'police',
    lightPhase: 0,
    /** Traffic keeps to a lane on one road; the player's car and the police just drive. */
    dir: spec.dir ?? 0,
    lane: spec.lane ?? TRAFFIC.lane,
    cruise: spec.cruise ?? TRAFFIC.speed + rng.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
    stuck: 0,
    siren: spec.kind === 'police' ? rng.range(0, 1) : 0,
    /** A car nobody drives: parked, or left after a crash. */
    driver: spec.kind === 'parked' ? null : 'ai',
    owner: spec.owner ?? null,
    hitCooldown: 0,
    burning: 0,
  };
}

/** Signed difference between two angles, kept in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Drives one car for a step. `controls` is {throttle -1..1, steer -1..1, handbrake}. The body is a
 * point with a heading: the throttle pushes along it, the lateral part of the velocity is scrubbed
 * off by grip (much less of it while the handbrake is down, which is what a drift is), and the
 * walls it runs into take its speed and its paint.
 */
export function driveCar(car, controls, dt, game) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let along = car.vx * fx + car.vy * fy;
  let lateral = -car.vx * fy + car.vy * fx;

  if (controls.throttle > 0) {
    along += VEHICLE.accel * controls.throttle * dt;
  } else if (controls.throttle < 0) {
    if (along > 6) along -= VEHICLE.brake * -controls.throttle * dt;
    else along += VEHICLE.accel * 0.62 * controls.throttle * dt;
  }
  if (controls.handbrake) along -= along * Math.min(1, VEHICLE.handbrakeDrag * dt);

  // Drag, and the engine's own limit forward and back.
  along -= along * Math.min(1, VEHICLE.drag * dt);
  along = Math.max(-VEHICLE.reverseSpeed, Math.min(VEHICLE.maxSpeed, along));

  // Grip: the handbrake lets the car slide, otherwise it tracks its nose.
  const grip = controls.handbrake ? 1.1 : VEHICLE.grip;
  lateral -= lateral * Math.min(1, grip * dt);

  car.vx = fx * along - fy * lateral;
  car.vy = fy * along + fx * lateral;
  car.speed = along;

  // Steering turns the nose faster the quicker it is going, and not at all when stopped.
  const bite = Math.min(1, Math.abs(along) / 150);
  const rate = VEHICLE.steer + VEHICLE.steerLowSpeed * (1 - bite);
  const direction = along < -4 ? -1 : 1;
  car.angle += controls.steer * rate * dt * bite * direction;

  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const body = { x: nx, y: ny };
  const radius = Math.max(car.len, car.wid) * 0.42;
  const hit = pushOutOfWalls(game.walls, body, radius);
  car.x = body.x;
  car.y = body.y;

  if (hit) {
    const impact = Math.hypot(car.vx, car.vy);
    if (impact > 90) {
      car.health -= impact * 0.035;
      game.onImpact?.(car, impact);
      const push = 0.42;
      car.vx *= push;
      car.vy *= push;
    } else {
      car.vx *= 0.72;
      car.vy *= 0.72;
    }
    car.speed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
  }

  // Keep it inside the city's own edges, and off the water.
  const pad = 20;
  const shore = game.city.sea.y - 40;
  if (car.x < pad || car.x > game.city.size - pad) {
    car.x = Math.max(pad, Math.min(game.city.size - pad, car.x));
    car.vx *= -0.28;
  }
  if (car.y < pad || car.y > shore) {
    car.y = Math.max(pad, Math.min(shore, car.y));
    car.vy *= -0.28;
  }

  car.hitCooldown = Math.max(0, car.hitCooldown - dt);
  if (car.police) car.lightPhase = (car.lightPhase + dt * 3.4) % 1;
  if (car.health <= 0 && !car.burning) car.burning = 0.01;
}

/** What a crash costs a car: smoke, sparks and, past zero, fire and a blast. */
export function damageCar(car, amount, game) {
  if (car.health <= 0) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.burning = 0.01;
    game.onCarDestroyed?.(car);
  }
}

/** A wreck, once it has burned out: no driver, no light, and it never moves again. */
export function wreck(car) {
  car.health = 0;
  car.driver = null;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  car.burning = 0;
  car.wrecked = true;
  car.body = '#4a4038';
}

/** The nearest car whose driver's door the player can reach. */
export function nearestCar(cars, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const car of cars) {
    if (car.health <= 0) continue;
    const d = (car.x - x) ** 2 + (car.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
