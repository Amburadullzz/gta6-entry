// What the player sees: the ground first (asphalt, kerbs, lane paint, grass, sand, sea), then the
// walls, then everything that moves, then the light of the day on top of it all. The renderer owns
// the canvas transform, so every other module draws in plain world coordinates.
import { CAMERA, PALETTE, WORLD } from './config.js';
import { drawBuilding, drawCar, drawPerson, drawProp, roundRect, shade } from './art.js';
import { inView, viewBounds } from './camera.js';
import { roadCenter } from './city.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const renderer = {
    canvas,
    ctx,
    dpr: 1,
    width: 1280,
    height: 720,
    resize(width, height, dpr = 1) {
      renderer.width = width;
      renderer.height = height;
      renderer.dpr = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    },
    /** One frame, world then light, at the canvas's own resolution. */
    draw(game) {
      ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
      ctx.fillStyle = '#141821';
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      drawWorld(ctx, game, renderer);
    },
  };
  return renderer;
}

function drawWorld(ctx, game, renderer) {
  const { camera, city } = game;
  const bounds = viewBounds(camera, 220);
  ctx.save();
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  // Shake moves the world, not the HUD.
  const shakeX = (Math.random() * 2 - 1) * camera.shake;
  const shakeY = (Math.random() * 2 - 1) * camera.shake;
  ctx.translate(renderer.width / 2 + shakeX, renderer.height / 2 + shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawGround(ctx, city, bounds, game.clock);
  drawDecals(ctx, game, bounds);
  drawPickups(ctx, game, bounds);

  // Walls stand behind the traffic and the people, so nothing the player drives is ever hidden.
  for (const b of city.buildings) {
    if (!inView(bounds, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) + b.height)) continue;
    drawBuilding(ctx, b);
  }

  for (const prop of city.props) {
    if (!inView(bounds, prop.x, prop.y, 60)) continue;
    drawProp(ctx, prop, game.clock);
  }

  drawActors(ctx, game, bounds);
  drawBullets(ctx, game, bounds);
  drawParticles(ctx, game, bounds);
  drawGlows(ctx, game, bounds);

  ctx.restore();
  drawLight(ctx, game, renderer);
}

/** Asphalt everywhere, then each block's pavement and lot, then the paint on the roads. */
function drawGround(ctx, city, bounds, time) {
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

  // Patches, stains and tar seams on the asphalt: a road is never one flat grey.
  const cellX = Math.floor(bounds.x / 190) * 190;
  const cellY = Math.floor(bounds.y / 190) * 190;
  for (let y = cellY; y < bounds.y + bounds.h + 190; y += 190) {
    for (let x = cellX; x < bounds.x + bounds.w + 190; x += 190) {
      const seed = Math.sin(x * 0.013 + y * 0.021) * 43758.5453;
      const f = seed - Math.floor(seed);
      if (f < 0.45) continue;
      ctx.fillStyle = f > 0.8 ? 'rgba(24, 22, 26, 0.35)' : 'rgba(88, 84, 92, 0.16)';
      ctx.fillRect(x + f * 60, y + (1 - f) * 70, 30 + f * 70, 12 + f * 26);
    }
  }

  for (const block of city.blocks) {
    if (!inView(bounds, block.x + block.w / 2, block.y + block.h / 2, block.w)) continue;
    // The pavement ring, with a kerb line where it meets the road.
    ctx.fillStyle = PALETTE.walk;
    ctx.fillRect(block.x, block.y, block.w, block.h);
    ctx.strokeStyle = PALETTE.walkEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(block.x + 1.5, block.y + 1.5, block.w - 3, block.h - 3);
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(block.x + 4, block.y + 4, block.w - 8, block.h - 8);

    const lotX = block.x + WORLD.walk;
    const lotY = block.y + WORLD.walk;
    const lotW = block.w - WORLD.walk * 2;
    const lotH = block.h - WORLD.walk * 2;
    if (block.sand) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(lotX, lotY, lotW, lotH);
      ctx.fillStyle = PALETTE.sandDark;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillRect(lotX + ((i * 137) % lotW), lotY + ((i * 211) % lotH), 40, 3);
      }
    } else if (block.park) {
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(lotX, lotY, lotW, lotH);
      ctx.fillStyle = PALETTE.grassDark;
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        ctx.arc(lotX + ((i * 173) % lotW), lotY + ((i * 97) % lotH), 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(226, 214, 184, 0.9)';
      ctx.fillRect(lotX + lotW / 2 - 16, lotY, 32, lotH);
      ctx.fillRect(lotX, lotY + lotH / 2 - 16, lotW, 32);
    } else {
      // A yard of packed gravel and oil stains around the walls.
      ctx.fillStyle = '#9d9179';
      ctx.fillRect(lotX, lotY, lotW, lotH);
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = i % 2 ? 'rgba(120, 108, 90, 0.55)' : 'rgba(70, 62, 54, 0.22)';
        ctx.fillRect(lotX + ((i * 151) % Math.max(1, lotW - 40)), lotY + ((i * 113) % Math.max(1, lotH - 30)), 34, 22);
      }
      // A drain, a kerb ramp and a few cracks, so a yard is never a flat colour.
      ctx.strokeStyle = 'rgba(90, 80, 66, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lotX + 12, lotY + lotH - 18);
      ctx.lineTo(lotX + 70, lotY + lotH - 24);
      ctx.lineTo(lotX + 120, lotY + lotH - 12);
      ctx.stroke();
    }
  }

  drawRoadPaint(ctx, city, bounds);
  drawSea(ctx, city, bounds, time);
}

/** The sea past the last block: a gradient, a foam line and slow waves that never stop moving. */
function drawSea(ctx, city, bounds, time) {
  const seaTop = city.sea.y;
  if (bounds.y + bounds.h < seaTop) return;
  const grad = ctx.createLinearGradient(0, seaTop, 0, seaTop + 500);
  grad.addColorStop(0, '#2b93a0');
  grad.addColorStop(0.35, PALETTE.water);
  grad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(bounds.x, seaTop, bounds.w, Math.min(bounds.y + bounds.h - seaTop + 40, 1200));
  // Wet sand and foam where the water meets the beach.
  ctx.fillStyle = 'rgba(206, 188, 150, 0.6)';
  ctx.fillRect(bounds.x, seaTop - 18, bounds.w, 18);
  ctx.fillStyle = 'rgba(244, 253, 250, 0.55)';
  ctx.fillRect(bounds.x, seaTop - 5, bounds.w, 8);
  ctx.strokeStyle = 'rgba(233, 250, 245, 0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i += 1) {
    const y = seaTop + 16 + i * 46 + Math.sin(time * 0.9 + i) * 5;
    if (y > bounds.y + bounds.h) break;
    ctx.beginPath();
    ctx.moveTo(bounds.x, y);
    for (let x = bounds.x; x < bounds.x + bounds.w; x += 60) {
      ctx.lineTo(x + 30, y + Math.sin((x + time * 40) * 0.02 + i) * 4);
    }
    ctx.globalAlpha = 0.3 - i * 0.03;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Lane dashes down every road, a solid centre pair, and a zebra at every crossing. */
function drawRoadPaint(ctx, city, bounds) {
  const cells = city.cells;
  ctx.lineWidth = 2.4;
  for (let i = 0; i <= cells; i += 1) {
    const c = roadCenter(i);
    const vertical = c > bounds.x - 200 && c < bounds.x + bounds.w + 200;
    const horizontal = c > bounds.y - 200 && c < bounds.y + bounds.h + 200;
    if (vertical) {
      ctx.strokeStyle = 'rgba(214, 190, 120, 0.75)';
      ctx.beginPath();
      ctx.moveTo(c - 3, bounds.y);
      ctx.lineTo(c - 3, bounds.y + bounds.h);
      ctx.moveTo(c + 3, bounds.y);
      ctx.lineTo(c + 3, bounds.y + bounds.h);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230, 226, 208, 0.5)';
      ctx.setLineDash([26, 30]);
      for (const off of [-34, 34]) {
        ctx.beginPath();
        ctx.moveTo(c + off, bounds.y);
        ctx.lineTo(c + off, bounds.y + bounds.h);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (horizontal) {
      ctx.strokeStyle = 'rgba(214, 190, 120, 0.75)';
      ctx.beginPath();
      ctx.moveTo(bounds.x, c - 3);
      ctx.lineTo(bounds.x + bounds.w, c - 3);
      ctx.moveTo(bounds.x, c + 3);
      ctx.lineTo(bounds.x + bounds.w, c + 3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230, 226, 208, 0.5)';
      ctx.setLineDash([26, 30]);
      for (const off of [-34, 34]) {
        ctx.beginPath();
        ctx.moveTo(bounds.x, c + off);
        ctx.lineTo(bounds.x + bounds.w, c + off);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // Zebra crossings on the four approaches to each junction.
  ctx.fillStyle = 'rgba(235, 232, 216, 0.7)';
  for (let i = 0; i <= cells; i += 1) {
    for (let j = 0; j <= cells; j += 1) {
      const cx = roadCenter(i);
      const cy = roadCenter(j);
      if (!inView(bounds, cx, cy, 240)) continue;
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(cx + s * 15 - 5, cy - WORLD.road / 2 - 16, 9, 12);
        ctx.fillRect(cx + s * 15 - 5, cy + WORLD.road / 2 + 4, 9, 12);
        ctx.fillRect(cx - WORLD.road / 2 - 16, cy + s * 15 - 5, 12, 9);
        ctx.fillRect(cx + WORLD.road / 2 + 4, cy + s * 15 - 5, 12, 9);
      }
    }
  }
}

function drawDecals(ctx, game, bounds) {
  for (const d of game.decals) {
    if (!inView(bounds, d.x, d.y, 40)) continue;
    ctx.save();
    ctx.globalAlpha = d.life / d.maxLife;
    ctx.fillStyle = d.color;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    if (d.kind === 'skid') {
      ctx.fillRect(-6, -2, 12, 4);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size, d.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPickups(ctx, game, bounds) {
  for (const p of game.pickups) {
    if (!inView(bounds, p.x, p.y, 40)) continue;
    const bob = Math.sin(game.clock * 3 + p.x) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(40, 26, 18, 0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 6, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === 'health') {
      ctx.fillStyle = '#f2f4ef';
      roundRect(ctx, -8, -8, 16, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#d2453c';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    } else if (p.kind === 'armor') {
      ctx.fillStyle = '#4f8fbf';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, -4);
      ctx.lineTo(8, 5);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 5);
      ctx.lineTo(-8, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8f2f8';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#e9c46a';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8812f';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.5);
    }
    ctx.restore();
  }
}

/** Cars, people and officers, sorted so the one further down the screen is drawn in front. */
function drawActors(ctx, game, bounds) {
  const actors = [];
  for (const car of game.cars) {
    if (!inView(bounds, car.x, car.y, 90)) continue;
    actors.push({ y: car.y, kind: 'car', ref: car });
  }
  for (const ped of game.peds) {
    if (!inView(bounds, ped.x, ped.y, 40)) continue;
    actors.push({ y: ped.y, kind: 'ped', ref: ped });
  }
  for (const cop of game.officers) {
    if (!inView(bounds, cop.x, cop.y, 40)) continue;
    actors.push({ y: cop.y, kind: 'cop', ref: cop });
  }
  if (game.player.mode === 'foot') actors.push({ y: game.player.y, kind: 'player', ref: game.player });
  actors.sort((a, b) => a.y - b.y);

  for (const a of actors) {
    if (a.kind === 'car') {
      drawCar(ctx, a.ref);
      if (a.ref.health < 55 && a.ref.health > 0) {
        ctx.fillStyle = `rgba(60, 60, 62, ${0.06 + (1 - a.ref.health / 55) * 0.16})`;
        ctx.beginPath();
        ctx.arc(a.ref.x, a.ref.y, 26, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (a.kind === 'ped') {
      drawPerson(ctx, a.ref, { armed: false });
      if (a.ref.hostile) targetMark(ctx, a.ref.x, a.ref.y, game.clock);
    } else if (a.kind === 'cop') {
      drawPerson(ctx, a.ref, { armed: a.ref.armed, officer: true });
    } else {
      const p = a.ref;
      drawPerson(ctx, p, { armed: p.weapon !== 'fist', hero: true });
      if (p.aiming) {
        ctx.strokeStyle = 'rgba(255, 240, 200, 0.28)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.aim) * 14, p.y + Math.sin(p.aim) * 14);
        ctx.lineTo(p.x + Math.cos(p.aim) * 220, p.y + Math.sin(p.aim) * 220);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

/** A red chevron over a mission target, so the crew reads at a glance in a crowded street. */
function targetMark(ctx, x, y, time) {
  const bob = Math.sin(time * 4 + x * 0.05) * 2;
  ctx.save();
  ctx.translate(x, y - 24 + bob);
  ctx.fillStyle = 'rgba(226, 74, 62, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.lineTo(-6, -4);
  ctx.lineTo(6, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 214, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawBullets(ctx, game, bounds) {
  for (const b of game.bullets) {
    if (!inView(bounds, b.x, b.y, 30)) continue;
    ctx.strokeStyle = b.color ?? '#ffd98a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.stroke();
  }
}

function drawParticles(ctx, game, bounds) {
  for (const p of game.particles) {
    if (!inView(bounds, p.x, p.y, 40)) continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Siren washes and headlight cones: additive light on top of the scene. */
function drawGlows(ctx, game, bounds) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const car of game.cars) {
    if (!car.police || !inView(bounds, car.x, car.y, 260)) continue;
    const color = car.lightPhase > 0.5 ? 'rgba(255, 70, 70, 0.20)' : 'rgba(70, 110, 255, 0.20)';
    const grad = ctx.createRadialGradient(car.x, car.y, 6, car.x, car.y, 190);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(car.x - 190, car.y - 190, 380, 380);
  }
  for (const b of game.bullets) {
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 26);
    grad.addColorStop(0, 'rgba(255, 226, 160, 0.5)');
    grad.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(b.x - 26, b.y - 26, 52, 52);
  }
  for (const f of game.flashes) {
    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
    grad.addColorStop(0, `rgba(255, 210, 130, ${0.55 * (f.life / f.maxLife)})`);
    grad.addColorStop(1, 'rgba(255, 170, 90, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
  }
  ctx.restore();
}

/**
 * The light of the day: a warm sun wash by day, a low amber glare at dusk, a blue hour at night,
 * then the vignette that holds the frame together.
 */
function drawLight(ctx, game, renderer) {
  const { width, height } = renderer;
  const hour = game.clock % 24;
  const night = hour < 6 || hour > 19.5 ? 1 : hour > 18 ? (hour - 18) / 1.5 : hour < 7 ? 1 - (hour - 6) : 0;
  const dusk = hour > 16.5 && hour < 19.5 ? Math.sin(((hour - 16.5) / 3) * Math.PI) : 0;

  if (night > 0.02) {
    ctx.fillStyle = `rgba(24, 34, 66, ${0.42 * night})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (dusk > 0.02) {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, `rgba(255, 168, 88, ${0.3 * dusk})`);
    g.addColorStop(0.55, `rgba(255, 128, 84, ${0.16 * dusk})`);
    g.addColorStop(1, `rgba(112, 62, 118, ${0.2 * dusk})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  // A warm grade over the whole frame: Marisol is a sun coast, not a grey one.
  ctx.fillStyle = `rgba(255, 186, 112, ${0.06 - night * 0.05})`;
  ctx.fillRect(0, 0, width, height);
  // Sun glare from the top right.
  const glare = ctx.createRadialGradient(width * 0.86, -height * 0.15, 10, width * 0.86, -height * 0.15, height * 1.1);
  glare.addColorStop(0, `rgba(255, 226, 170, ${0.22 - night * 0.18})`);
  glare.addColorStop(0.5, `rgba(255, 190, 120, ${0.06 - night * 0.05})`);
  glare.addColorStop(1, 'rgba(255, 180, 110, 0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, width, height);

  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.34, width / 2, height / 2, Math.max(width, height) * 0.78);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, `rgba(18, 12, 16, ${0.34 + night * 0.16})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  void shade;
}
