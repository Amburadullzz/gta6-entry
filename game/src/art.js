// The art: every shape in Marisol is drawn here from plain canvas paths, in world coordinates, so
// there is no image file anywhere and the city looks the same at any zoom. Buildings are extruded
// from their footprint toward the sun, cars and people are rounded silhouettes with a little
// shading, and the props are the palms, lamps and kerbside clutter that make the streets read.

/** Lighten (t > 0) or darken (t < 0) a #rrggbb colour by a fraction. */
export function shade(hex, t) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 + t))));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 + t))));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 + t))));
  return `rgb(${r},${g},${b})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * The extrusion offset of a building: how far its roof leans away from its footprint. The sun sits
 * to the north-west, so the roof leans up and left and the two faces we see are the lit south wall
 * and the shaded east wall.
 */
export function roofOffset(height) {
  return { x: -height * 0.24, y: -height * 0.42 };
}

/** A building: a long shadow, two sunlit walls, its roof and the clutter on it. */
export function drawBuilding(ctx, b) {
  const off = roofOffset(b.height);
  const sunX = b.height * 0.34;
  const sunY = b.height * 0.54;

  // Shadow on the pavement, thrown south-east, softened by a second lighter pass.
  ctx.fillStyle = 'rgba(48, 30, 22, 0.16)';
  ctx.beginPath();
  ctx.moveTo(b.x + sunX * 0.55, b.y + b.h + sunY * 0.35);
  ctx.lineTo(b.x + b.w + sunX * 1.15, b.y + b.h + sunY * 0.5);
  ctx.lineTo(b.x + b.w + sunX * 0.9, b.y + b.h + sunY * 1.1);
  ctx.lineTo(b.x + sunX * 0.3, b.y + b.h + sunY * 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(44, 28, 20, 0.22)';
  ctx.beginPath();
  ctx.moveTo(b.x + sunX * 0.2, b.y + b.h + sunY * 0.1);
  ctx.lineTo(b.x + b.w + sunX * 0.9, b.y + b.h + sunY * 0.24);
  ctx.lineTo(b.x + b.w + sunX * 0.82, b.y + b.h + sunY * 0.78);
  ctx.lineTo(b.x + sunX * 0.1, b.y + b.h + sunY * 0.7);
  ctx.closePath();
  ctx.fill();

  // The south wall, in sun: a gradient from the bright parapet down to the pavement.
  const south = ctx.createLinearGradient(b.x, b.y + b.h + off.y, b.x, b.y + b.h);
  south.addColorStop(0, shade(b.walls, 0.2));
  south.addColorStop(1, shade(b.walls, -0.04));
  ctx.fillStyle = south;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x + b.w + off.x, b.y + b.h + off.y);
  ctx.lineTo(b.x + off.x, b.y + b.h + off.y);
  ctx.closePath();
  ctx.fill();

  // The east wall, in shade.
  ctx.fillStyle = shade(b.walls, -0.52);
  ctx.beginPath();
  ctx.moveTo(b.x + b.w, b.y);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x + b.w + off.x, b.y + b.h + off.y);
  ctx.lineTo(b.x + b.w + off.x, b.y + off.y);
  ctx.closePath();
  ctx.fill();

  // Storeys on the lit face: a window band a floor, dark under a pale lintel.
  const floors = Math.max(2, Math.round(b.height / 15));
  const cols = Math.max(2, Math.round(b.w / 30));
  for (let f = 1; f < floors; f += 1) {
    const v = f / floors;
    const y = b.y + b.h + off.y * v;
    const x0 = b.x + off.x * v;
    ctx.fillStyle = b.glass ? 'rgba(122, 176, 190, 0.55)' : 'rgba(58, 44, 36, 0.20)';
    for (let c = 0; c < cols; c += 1) {
      const u0 = (c + 0.18) / cols;
      const u1 = (c + 0.82) / cols;
      ctx.fillRect(x0 + u0 * b.w, y - 7, (u1 - u0) * b.w, 5.4);
    }
  }
  // The shaded face keeps a few lit windows of its own, which is what a city looks like at dusk.
  if (b.height > 70) {
    ctx.fillStyle = 'rgba(255, 214, 150, 0.35)';
    for (let f = 1; f < floors; f += 2) {
      const v = f / floors;
      const x = b.x + b.w + off.x * v;
      const y = b.y + off.y * v + b.h * (0.2 + ((f * 0.37) % 0.6));
      ctx.fillRect(x + 4, y, 4, 6);
    }
  }

  // The roof, its parapet and its clutter.
  const rx = b.x + off.x;
  const ry = b.y + off.y;
  const grad = ctx.createLinearGradient(rx, ry, rx + b.w, ry + b.h);
  if (b.glass) {
    grad.addColorStop(0, '#b7d2d6');
    grad.addColorStop(0.5, '#93b6bd');
    grad.addColorStop(1, '#7d9ba3');
  } else {
    grad.addColorStop(0, shade(b.roof, 0.26));
    grad.addColorStop(1, shade(b.roof, -0.04));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, b.w, b.h);

  // Roof gravel and weathering: a scatter of marks that never repeats between buildings, then a
  // roof-access hut, a vent stack and the tar seams along the parapet.
  const hash = Math.abs(Math.sin(b.x * 0.017 + b.y * 0.031) * 43758.5453);
  ctx.fillStyle = b.glass ? 'rgba(255, 255, 255, 0.10)' : 'rgba(60, 48, 38, 0.10)';
  for (let i = 0; i < 14; i += 1) {
    const f = (hash * (i + 3) * 7.3) % 1;
    const g = (hash * (i + 5) * 3.7) % 1;
    ctx.fillRect(rx + 6 + f * (b.w - 20), ry + 6 + g * (b.h - 20), 5 + f * 9, 3 + g * 5);
  }
  ctx.strokeStyle = b.glass ? 'rgba(255, 255, 255, 0.16)' : 'rgba(70, 58, 46, 0.22)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(rx + 5, ry + b.h * 0.62);
  ctx.lineTo(rx + b.w - 5, ry + b.h * 0.62);
  ctx.stroke();

  const hutW = Math.min(46, b.w * 0.26);
  const hutH = Math.min(34, b.h * 0.24);
  if (b.w > 70 && b.h > 70) {
    ctx.fillStyle = b.glass ? 'rgba(120, 148, 156, 0.85)' : 'rgba(176, 164, 142, 0.9)';
    ctx.fillRect(rx + b.w * 0.62, ry + b.h * 0.18, hutW, hutH);
    ctx.fillStyle = 'rgba(40, 32, 26, 0.28)';
    ctx.fillRect(rx + b.w * 0.62, ry + b.h * 0.18 + hutH - 4, hutW, 4);
  }

  // An awning over the street on the sunlit side, which is what makes a block look lived in.
  if (b.height < 120 && b.w > 90) {
    const stripe = b.neon ?? '#e8695a';
    const ay = b.y + b.h + off.y * 0.08;
    ctx.fillStyle = 'rgba(24, 18, 14, 0.18)';
    ctx.fillRect(b.x + 4, ay + 10, b.w - 8, 6);
    for (let s = 0; s < 6; s += 1) {
      ctx.fillStyle = s % 2 === 0 ? stripe : '#f3ecdc';
      ctx.fillRect(b.x + 6 + (s * (b.w - 12)) / 6, ay, (b.w - 12) / 6, 9);
    }
  }

  // Parapet: a dark rim inside a bright top edge, so the roof sits on the walls.
  ctx.strokeStyle = 'rgba(38, 26, 20, 0.42)';
  ctx.lineWidth = 3;
  ctx.strokeRect(rx + 1.5, ry + 1.5, b.w - 3, b.h - 3);
  ctx.strokeStyle = 'rgba(255, 246, 220, 0.34)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(rx + 3, ry + 3, b.w - 6, b.h - 6);

  if (b.roofTop === 'units') {
    ctx.fillStyle = 'rgba(96, 96, 100, 0.7)';
    const n = Math.min(6, Math.max(2, Math.round(b.w / 60)));
    for (let i = 0; i < n; i += 1) {
      const ux = rx + 10 + (i * (b.w - 24)) / n;
      const uy = ry + 12 + ((i * 37) % Math.max(1, b.h - 40));
      ctx.fillRect(ux, uy, 14, 10);
      ctx.fillStyle = 'rgba(40, 40, 44, 0.4)';
      ctx.fillRect(ux, uy + 7, 14, 3);
      ctx.fillStyle = 'rgba(96, 96, 100, 0.7)';
    }
  } else if (b.roofTop === 'tank') {
    ctx.fillStyle = 'rgba(126, 110, 92, 0.85)';
    ctx.beginPath();
    ctx.arc(rx + b.w * 0.6, ry + b.h * 0.45, Math.min(16, b.w * 0.14), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 48, 38, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (b.roofTop === 'pool') {
    ctx.fillStyle = '#57c6d2';
    ctx.fillRect(rx + b.w * 0.2, ry + b.h * 0.24, b.w * 0.52, b.h * 0.44);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + b.w * 0.2, ry + b.h * 0.24, b.w * 0.52, b.h * 0.44);
  } else if (b.roofTop === 'helipad') {
    ctx.strokeStyle = 'rgba(244, 240, 226, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(rx + b.w / 2, ry + b.h / 2, Math.min(b.w, b.h) * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244, 240, 226, 0.8)';
    ctx.font = `700 ${Math.round(Math.min(b.w, b.h) * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', rx + b.w / 2, ry + b.h / 2 + 1);
  }

  // A neon name over the street, which is most of what gives the skyline its colour.
  if (b.sign) {
    const size = Math.min(24, Math.max(11, b.w / (b.sign.length * 0.7)));
    ctx.save();
    ctx.font = `700 ${Math.round(size)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const color = b.neon ?? '#ffd166';
    const sx = rx + b.w / 2;
    const sy = b.y + b.h + off.y * 0.34;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(20, 14, 12, 0.35)';
    ctx.fillRect(sx - b.w * 0.34, sy - size * 0.7, b.w * 0.68, size * 1.4);
    ctx.fillStyle = color;
    ctx.fillText(b.sign, sx, sy);
    ctx.restore();
  }
}

/** A car from above: body, roof, glass, lights, wheels. The police livery is its own. */
export function drawCar(ctx, car) {
  const { x, y, angle, model } = car;
  const spec = CAR_SHAPES[model] ?? CAR_SHAPES.kestrel;
  const len = spec.len;
  const wid = spec.wid;
  const hero = car.driver === 'player';
  ctx.save();
  ctx.translate(x, y);

  // The player's car gets a pool of warm light under it, a rim, and speed streaks, so the eye finds
  // it in a street full of traffic at a glance.
  if (hero) {
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, len * 0.95);
    halo.addColorStop(0, 'rgba(255, 238, 198, 0.34)');
    halo.addColorStop(0.55, 'rgba(255, 214, 150, 0.16)');
    halo.addColorStop(1, 'rgba(255, 200, 130, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-len, -len, len * 2, len * 2);
    ctx.save();
    ctx.rotate(angle);
    const speed = Math.hypot(car.vx ?? 0, car.vy ?? 0);
    if (speed > 150) {
      const fade = Math.min(1, (speed - 150) / 320);
      ctx.strokeStyle = `rgba(255, 244, 214, ${0.12 + fade * 0.24})`;
      ctx.lineWidth = 2.6;
      for (const off of [-wid * 0.3, wid * 0.3]) {
        ctx.beginPath();
        ctx.moveTo(-len * 0.5 - 8, off);
        ctx.lineTo(-len * 0.5 - 8 - 34 - fade * 80, off);
        ctx.stroke();
      }
    }
    ctx.shadowColor = 'rgba(255, 232, 180, 0.95)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.95)';
    ctx.lineWidth = 2.6;
    roundRect(ctx, -len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 9);
    ctx.stroke();
    ctx.restore();
  }

  // Shadow under the wheels, then the body.
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(40, 26, 18, 0.26)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 5, len, wid, 7);
  ctx.fill();

  ctx.fillStyle = car.body;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  ctx.fillStyle = shade(car.body, -0.22);
  roundRect(ctx, -len / 2, wid * 0.18, len, wid * 0.32, 4);
  ctx.fill();

  // Cabin glass and roof.
  ctx.fillStyle = car.glassColor ?? 'rgba(52, 78, 92, 0.9)';
  roundRect(ctx, -len * 0.06, -wid * 0.36, len * 0.34, wid * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = shade(car.body, 0.14);
  roundRect(ctx, -len * 0.02, -wid * 0.3, len * 0.2, wid * 0.6, 3);
  ctx.fill();

  // Headlights ahead, tail lights behind.
  ctx.fillStyle = 'rgba(255, 244, 208, 0.95)';
  ctx.fillRect(len / 2 - 4, -wid / 2 + 3, 3, 4);
  ctx.fillRect(len / 2 - 4, wid / 2 - 7, 3, 4);
  ctx.fillStyle = 'rgba(214, 60, 48, 0.9)';
  ctx.fillRect(-len / 2 + 1, -wid / 2 + 3, 3, 4);
  ctx.fillRect(-len / 2 + 1, wid / 2 - 7, 3, 4);

  if (car.police) {
    ctx.fillStyle = '#2a4a86';
    ctx.fillRect(-len * 0.1, -wid / 2 + 1, len * 0.3, wid * 0.16);
    ctx.fillRect(-len * 0.1, wid / 2 - wid * 0.16 - 1, len * 0.3, wid * 0.16);
    ctx.fillStyle = car.lightPhase > 0.5 ? '#ff4b4b' : '#3b6dff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.fillRect(-6, -wid / 2 - 1, 12, wid * 0.2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = car.lightPhase > 0.5 ? '#3b6dff' : '#ff4b4b';
    ctx.fillRect(-6, wid / 2 - wid * 0.2 + 1, 12, wid * 0.2);
  }
  ctx.restore();
}

/** A body on foot: a shadow, shoulders, a head, and a weapon if it carries one. */
export function drawPerson(ctx, p, opts = {}) {
  const { x, y, angle } = p;
  const skin = p.skin ?? '#b47b52';
  const shirt = p.shirt ?? '#e86a5c';
  ctx.save();
  ctx.translate(x, y);
  if (opts.hero) {
    // The same warm pool of light the player's car gets, so he is never lost in a crowd.
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    halo.addColorStop(0, 'rgba(255, 238, 198, 0.36)');
    halo.addColorStop(0.5, 'rgba(255, 214, 150, 0.18)');
    halo.addColorStop(1, 'rgba(255, 200, 130, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-34, -34, 68, 68);
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40, 26, 18, 0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);
  // Shoulders.
  ctx.fillStyle = shirt;
  roundRect(ctx, -7, -8, 15, 16, 6);
  ctx.fill();
  // Arms, swinging a little with the stride.
  const swing = Math.sin((p.stride ?? 0) * 9) * 2.4;
  ctx.strokeStyle = skin;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1, -7);
  ctx.lineTo(3 + swing, -11);
  ctx.moveTo(1, 7);
  ctx.lineTo(3 - swing, 11);
  ctx.stroke();
  // Head, turned toward the aim.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.5, 0, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 20, 14, 0.55)';
  ctx.beginPath();
  ctx.arc(4, 0, 3, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  if (opts.armed) {
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(5, -1.6, 11, 3.2);
  }
  if (opts.officer) {
    ctx.fillStyle = '#1e3a6e';
    ctx.fillRect(-7, -9.5, 15, 3);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(-3, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Street furniture: palms, trees, lamps, hydrants, benches, crates and beach umbrellas. */
export function drawProp(ctx, prop, time) {
  const { x, y, kind } = prop;
  const s = prop.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  switch (kind) {
    case 'palm': {
      ctx.fillStyle = 'rgba(40, 26, 18, 0.24)';
      ctx.beginPath();
      ctx.ellipse(6 * s, 5 * s, 16 * s, 11 * s, 0.4, 0, Math.PI * 2);
      ctx.fill();
      const sway = Math.sin(time * 1.1 + x * 0.01) * 0.06;
      ctx.save();
      ctx.rotate(sway);
      ctx.strokeStyle = '#8a6a45';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -3 * s);
      ctx.stroke();
      for (let f = 0; f < 7; f += 1) {
        const a = (f / 7) * Math.PI * 2 + sway;
        ctx.strokeStyle = f % 2 ? '#3f7a45' : '#4e8f4e';
        ctx.lineWidth = 3.2 * s;
        ctx.beginPath();
        ctx.moveTo(0, -3 * s);
        ctx.quadraticCurveTo(Math.cos(a) * 9 * s, -3 * s + Math.sin(a) * 9 * s, Math.cos(a) * 17 * s, -3 * s + Math.sin(a) * 17 * s);
        ctx.stroke();
      }
      ctx.fillStyle = '#5b8f4a';
      ctx.beginPath();
      ctx.arc(0, -3 * s, 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'tree': {
      ctx.fillStyle = 'rgba(40, 26, 18, 0.22)';
      ctx.beginPath();
      ctx.ellipse(5 * s, 5 * s, 14 * s, 10 * s, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f7f45';
      ctx.beginPath();
      ctx.arc(0, 0, 13 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5f9152';
      ctx.beginPath();
      ctx.arc(-3 * s, -3 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lamp': {
      ctx.strokeStyle = '#6d6a63';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -16 * s);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 214, 140, 0.85)';
      ctx.beginPath();
      ctx.arc(0, -17 * s, 3.6 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hydrant': {
      ctx.fillStyle = '#c2453c';
      ctx.beginPath();
      ctx.arc(0, 0, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dumpster': {
      ctx.fillStyle = '#3f6a58';
      ctx.fillRect(-9 * s, -6 * s, 18 * s, 12 * s);
      ctx.fillStyle = '#325446';
      ctx.fillRect(-9 * s, -6 * s, 18 * s, 3 * s);
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#8a6a45';
      ctx.fillRect(-10 * s, -3 * s, 20 * s, 6 * s);
      break;
    }
    case 'umbrella': {
      ctx.fillStyle = 'rgba(40, 26, 18, 0.2)';
      ctx.beginPath();
      ctx.ellipse(4 * s, 4 * s, 15 * s, 10 * s, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8695a';
      ctx.beginPath();
      ctx.arc(0, 0, 12 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f0e2';
      ctx.beginPath();
      ctx.arc(0, 0, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lifeguard': {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(-12 * s, -10 * s, 24 * s, 20 * s);
      ctx.fillStyle = '#d2604f';
      ctx.fillRect(-12 * s, -10 * s, 24 * s, 5 * s);
      break;
    }
    case 'fountain': {
      ctx.fillStyle = 'rgba(40, 26, 18, 0.18)';
      ctx.beginPath();
      ctx.arc(4, 4, 26 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfc2a8';
      ctx.beginPath();
      ctx.arc(0, 0, 26 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5fb4c0';
      ctx.beginPath();
      ctx.arc(0, 0, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, 5 * s + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** The shapes the traffic models are built from: length and width, in world pixels. */
export const CAR_SHAPES = {
  kestrel: { len: 46, wid: 23 },
  meridian: { len: 54, wid: 25 },
  bison: { len: 58, wid: 27 },
  coral: { len: 44, wid: 22 },
  taxi: { len: 48, wid: 23 },
  mulo: { len: 62, wid: 28 },
  police: { len: 52, wid: 25 },
};
