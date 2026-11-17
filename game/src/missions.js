// The story of Tavo Reyes, a courier who starts the week delivering a package and ends it owning
// the Marina. Six jobs, each a short chain of steps — go here, take that car, put these men down,
// lose the cops — with its own briefing, its own voices and a purse at the end.
import { ECONOMY } from './config.js';
import { createCar, damageCar } from './vehicle.js';
import { spawnParticles } from './combat.js';

/**
 * Every job. `at` names a landmark the city generator placed, or {x, y} of its own; a step's `kind`
 * decides what finishes it, and `text` is what the HUD asks the player to do.
 */
export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'First Shift',
    speaker: 'Ruda',
    brief: [
      'Ruda: Tavo. There is a package at the Old Harbor and a clock on it.',
      'Ruda: Pick it up, take it to Club Vela on the Neon Mile, and do not open it.',
      'Tavo: And if someone opens me first?',
      'Ruda: Then you were never on my books.',
    ],
    steps: [
      { kind: 'goto', at: 'harbour', radius: 70, text: 'Collect the package at the Old Harbor' },
      { kind: 'deliver', at: 'club', radius: 80, text: 'Deliver the package to Club Vela' },
    ],
    reward: 380,
  },
  {
    id: 'wrong-cargo',
    title: 'Wrong Cargo',
    speaker: 'Ruda',
    brief: [
      'Ruda: The van they loaded at the docks was not ours.',
      'Ruda: Bring it to Foundry Row before Prine counts his crates.',
      'Tavo: This is a lot of van for one box.',
      'Ruda: Do not look in the box, Tavo.',
    ],
    steps: [
      { kind: 'steal', model: 'bison', at: 'docks', radius: 900, text: 'Steal the Bison van at Saltmarsh Docks' },
      { kind: 'deliver', at: 'foundry', radius: 90, needCar: true, text: 'Drive the van to Foundry Row' },
    ],
    reward: 460,
  },
  {
    id: 'the-collector',
    title: 'The Collector',
    speaker: 'Prine',
    brief: [
      'Prine: A man in Coral Heights has been collecting for me and keeping the change.',
      'Prine: He has friends. Take three of them off my ledger and the rest will remember.',
      'Tavo: And him?',
      'Prine: Him most of all.',
    ],
    steps: [
      { kind: 'goto', at: 'heights', radius: 90, text: 'Drive to Coral Heights' },
      { kind: 'kill', count: 4, at: 'heights', radius: 700, text: 'Take out the collector and his crew' },
      { kind: 'escape', text: 'Lose the police' },
    ],
    reward: 520,
  },
  {
    id: 'static',
    title: 'Static',
    speaker: 'Prine',
    brief: [
      'Prine: The club on the Neon Mile is playing a song I did not licence.',
      'Prine: The man with the decks is called Silo. He owes me a night.',
      'Tavo: You want the music stopped.',
      'Prine: I want the whole station off the air.',
    ],
    steps: [
      { kind: 'goto', at: 'club', radius: 80, text: 'Get to Club Vela on the Neon Mile' },
      { kind: 'kill', count: 5, at: 'club', radius: 520, text: 'Clear the club' },
      { kind: 'escape', text: 'Get clear of the scene' },
    ],
    reward: 600,
  },
  {
    id: 'overpass',
    title: 'Overpass',
    speaker: 'Ruda',
    brief: [
      'Ruda: The van from the docks? Someone talked about it on Ruta 9.',
      'Ruda: A Meridian is running the coast road with our plate on it.',
      'Tavo: So I chase a car across half the city.',
      'Ruda: You chase it, or it drives to Prine first.',
    ],
    steps: [
      { kind: 'chase', model: 'meridian', text: 'Run down the Meridian on the coast road' },
      { kind: 'escape', text: 'Lose the police' },
    ],
    reward: 640,
  },
  {
    id: 'sunset-score',
    title: 'Sunset Score',
    speaker: 'Ruda',
    brief: [
      'Ruda: Prine keeps the Marina take in the office above the fuel dock.',
      'Ruda: One van, one hour, and every Alacran in the city on your plate.',
      'Tavo: And after?',
      'Ruda: After, you are the one they call when the phone rings at three.',
    ],
    steps: [
      { kind: 'goto', at: 'marina', radius: 80, text: 'Drive to the Marina office' },
      { kind: 'kill', count: 6, at: 'marina', radius: 600, text: 'Take the Marina from the Alacranes' },
      { kind: 'survive', seconds: 35, text: 'Hold the Marina until the van is loaded' },
      { kind: 'escape', text: 'Get out of Verano with the money' },
    ],
    reward: 1200,
  },
];

/** The state of the story: which job is on offer, which is running, and how far along it is. */
export function createMissionState() {
  return {
    index: 0,
    active: null,
    step: 0,
    timer: 0,
    kills: 0,
    objective: '',
    subtitle: null,
    subtitleFor: 0,
    completed: [],
    offered: true,
  };
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}

/** Where the next job waits: a kerb outside the safehouse, until the story moves elsewhere. */
export function missionMarker(game) {
  const state = game.mission;
  if (state.active) {
    const step = state.active.steps[state.step];
    const at = step ? pointFor(game, step) : null;
    if (at) return { x: at.x, y: at.y, kind: 'objective', radius: step.radius ?? 70 };
    return null;
  }
  if (state.index >= MISSIONS.length) return null;
  const base = game.city.landmarks.safehouse;
  // The job waits on the road just north of the safehouse, where a car can pull up.
  return { x: base.x, y: base.y - 130, kind: 'mission', radius: 46 };
}

/** A landmark name or a literal point, whichever the step carries. */
function pointFor(game, step) {
  if (!step) return null;
  if (step.at && typeof step.at === 'object') return step.at;
  if (step.at && game.city.landmarks[step.at]) return game.city.landmarks[step.at];
  return null;
}

export function startMission(game, index) {
  const def = MISSIONS[index];
  if (!def) return;
  const state = game.mission;
  state.index = index;
  state.active = def;
  state.step = 0;
  state.timer = 0;
  state.kills = 0;
  state.offered = false;
  state.objective = def.steps[0].text;
  say(game, def.speaker, def.brief[0]);
  game.toast?.('JOB: ' + def.title.toUpperCase(), 2.6);
  game.audio?.missionStart();
  const first = pointFor(game, def.steps[0]);
  if (first) game.waypoint = { x: first.x, y: first.y };
  prepareStep(game, def, 0);
}

/** Spawns whatever a step needs: the crew to fight, the car to run down. */
function prepareStep(game, def, index) {
  const step = def.steps[index];
  if (!step) return;
  const at = pointFor(game, step);
  if (step.kind === 'kill' && at) spawnCrew(game, step.count ?? 3, at, step.radius ?? 600);
  if (step.kind === 'chase' && at) spawnRunner(game, step.model ?? 'meridian', at);
  if (step.kind === 'steal' && at) {
    // A van of the right model, parked where the job says.
    const spot = game.city.parking[Math.floor(game.city.parking.length / 2)] ?? at;
    const car = createCar(game.rng, { x: at.x + 60, y: at.y + 40, angle: 0, model: step.model, kind: 'parked' });
    car.missionCar = true;
    game.cars.push(car);
    void spot;
  }
}

function say(game, speaker, line) {
  game.mission.subtitle = { speaker, text: line };
  game.mission.subtitleFor = 6.5;
}

/** The running job, one step: check the step's own condition and move on when it is met. */
export function updateMissions(game, dt) {
  const state = game.mission;
  if (state.subtitleFor > 0) {
    state.subtitleFor -= dt;
    if (state.subtitleFor <= 0) state.subtitle = null;
  }
  if (!state.active) return;
  const def = state.active;
  const step = def.steps[state.step];
  if (!step) return;
  const p = game.player;
  state.timer += dt;

  switch (step.kind) {
    case 'goto':
    case 'deliver': {
      const at = pointFor(game, step);
      if (!at) {
        advance(game);
        break;
      }
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d < (step.radius ?? 70)) {
        if (step.kind === 'deliver' && step.needCar && p.mode !== 'car') {
          state.objective = 'Bring a car to the drop';
          break;
        }
        advance(game);
      }
      break;
    }
    case 'steal': {
      const inMissionCar = p.mode === 'car' && p.car && p.car.model === step.model;
      if (inMissionCar) advance(game);
      break;
    }
    case 'kill': {
      const alive = game.peds.filter((ped) => ped.hostile).length;
      state.objective = `${step.text} (${Math.max(0, (step.count ?? 3) - (game.mission.kills))} left)`;
      if (alive === 0 && state.timer > 1.5) advance(game);
      break;
    }
    case 'survive': {
      const left = Math.max(0, (step.seconds ?? 30) - state.timer);
      state.objective = `${step.text} — ${Math.ceil(left)}s`;
      if (left <= 0) advance(game);
      break;
    }
    case 'chase': {
      const runner = game.cars.find((c) => c.runner);
      if (!runner || runner.health <= 0) advance(game);
      else if (runner) game.waypoint = { x: runner.x, y: runner.y };
      break;
    }
    case 'escape': {
      state.objective = `${step.text} (${game.wanted.level} star${game.wanted.level === 1 ? '' : 's'})`;
      if (game.wanted.level === 0) advance(game);
      break;
    }
    default:
      break;
  }
}

function advance(game) {
  const state = game.mission;
  const def = state.active;
  state.step += 1;
  state.timer = 0;
  state.kills = 0;
  const next = def.steps[state.step];
  if (!next) {
    finishMission(game, def);
    return;
  }
  state.objective = next.text;
  const at = pointFor(game, next);
  if (at) game.waypoint = { x: at.x, y: at.y };
  prepareStep(game, def, state.step);
  game.audio?.objective();
  game.toast?.(next.text, 2.4);
}

function finishMission(game, def) {
  const state = game.mission;
  game.money += def.reward;
  state.completed.push(def.id);
  state.active = null;
  state.objective = '';
  state.index = Math.min(MISSIONS.length, MISSIONS.indexOf(def) + 1);
  state.offered = state.index < MISSIONS.length;
  game.waypoint = null;
  game.toast?.(`${def.title} done — $${def.reward}`, 4);
  game.audio?.missionDone();
  game.save?.();
  if (def.id === 'sunset-score') {
    game.finished = true;
    game.toast?.('You own the Marina. Marisol is yours.', 8);
  }
}

/** The crew a kill step is fought against: armed, and they come at you. */
function spawnCrew(game, count, at, radius) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + game.rng.range(-0.4, 0.4);
    const d = game.rng.range(60, Math.min(radius * 0.7, 260));
    game.peds.push({
      x: at.x + Math.cos(a) * d,
      y: at.y + Math.sin(a) * d,
      vx: 0,
      vy: 0,
      angle: a,
      stride: game.rng.range(0, 9),
      shirt: '#3f3a52',
      skin: game.rng.pick(['#8d5a3b', '#b47b52', '#6b4229', '#d9a273']),
      health: 58,
      hostile: true,
      armed: true,
      fireCooldown: game.rng.range(0.5, 1.8),
      state: 'hunt',
    });
  }
}

/** The car that runs: it picks the road that takes it furthest from the player. */
function spawnRunner(game, model, at) {
  const car = createCar(game.rng, { x: at.x, y: at.y, angle: 0, model, kind: 'traffic' });
  car.runner = true;
  car.health = 220;
  car.cruise = 260;
  car.driver = 'ai';
  game.cars.push(car);
}

/** Hostile crew on foot: close in and shoot, and count when they go down. */
export function stepHostiles(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (!ped.hostile) continue;
    const dx = p.x - ped.x;
    const dy = p.y - ped.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    ped.stride += dt * 1.5;
    if (d > 150) {
      ped.x += (dx / d) * 96 * dt;
      ped.y += (dy / d) * 96 * dt;
    } else if (d < 80) {
      ped.x -= (dx / d) * 42 * dt;
      ped.y -= (dy / d) * 42 * dt;
    }
    ped.fireCooldown -= dt;
    if (ped.fireCooldown <= 0 && d < 330) {
      ped.fireCooldown = game.rng.range(0.7, 1.5);
      game.spawnEnemyBullet?.(ped, Math.atan2(dy, dx) + game.rng.range(-0.1, 0.1));
    }
  }
}

/** The runner's own driving: stay on the road grid, and always take the turn away from you. */
export function stepRunner(game, car, dt) {
  const p = game.player;
  const dx = car.x - p.x;
  const dy = car.y - p.y;
  const away = Math.atan2(dy, dx);
  const want = Math.abs(Math.cos(away)) > Math.abs(Math.sin(away)) ? (Math.cos(away) > 0 ? 0 : 2) : Math.sin(away) > 0 ? 1 : 3;
  if (car.dir !== want && game.rng.chance(dt * 1.4)) car.dir = want;
  const speed = car.cruise * (Math.hypot(dx, dy) < 200 ? 1.25 : 1);
  car.speed += (speed - car.speed) * Math.min(1, dt * 2);
  const dirs = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
  const dir = dirs[car.dir] ?? dirs[0];
  car.x += dir.x * car.speed * dt;
  car.y += dir.y * car.speed * dt;
  car.angle = Math.atan2(dir.y, dir.x);
  car.vx = dir.x * car.speed;
  car.vy = dir.y * car.speed;
  if (car.x < 120 || car.x > game.city.size - 120 || car.y < 120 || car.y > game.city.size - 120) {
    car.dir = (car.dir + 2) % 4;
  }
  // Smoke once it has been shot up, so the chase reads at a glance.
  if (car.health < 140 && game.rng.chance(dt * 6)) {
    spawnParticles(game, car.x, car.y, 1, 'rgba(70, 64, 60, 0.6)', 30, 5);
  }
  if (car.health <= 0) {
    car.runner = false;
    damageCar(car, 1, game);
  }
}

/** What a job pays, for the mission list on the map screen. */
export function missionSummary(game) {
  return MISSIONS.map((m, i) => ({
    title: m.title,
    state: game.mission.completed.includes(m.id) ? 'done' : game.mission.active?.id === m.id ? 'active' : i === game.mission.index ? 'next' : 'locked',
    reward: m.reward ?? ECONOMY.missionBase,
  }));
}
