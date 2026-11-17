// The HUD: health and armour, the gun and its rounds, the money, the stars, the clock, the minimap
// with its blips, the objective, the line of dialogue and, in a car, the speed and the station.
// It is drawn in screen coordinates after the world, so it never shakes with the camera.
import { PALETTE, WEAPONS, WORLD, WANTED } from './config.js';
import { districtAt } from './city.js';
import { missionMarker } from './missions.js';
import { roundRect } from './art.js';

/** The city at minimap scale, painted once: blocks in sand, roads in asphalt, the sea in teal. */
export function buildMinimap(city, size = 640) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const k = size / city.size;
  ctx.fillStyle = '#2f3540';
  ctx.fillRect(0, 0, size, size);
  for (const block of city.blocks) {
    ctx.fillStyle = block.sand ? '#d9c79b' : block.park ? '#6f8f57' : '#4b5563';
    ctx.fillRect(block.x * k, block.y * k, block.w * k, block.h * k);
  }
  ctx.fillStyle = '#1d7d8a';
  ctx.fillRect(0, city.sea.y * k, size, size - city.sea.y * k);
  ctx.strokeStyle = 'rgba(232, 214, 168, 0.28)';
  ctx.lineWidth = 1;
  for (const block of city.blocks) {
    ctx.strokeRect(block.x * k, block.y * k, block.w * k, block.h * k);
  }
  return { canvas, scale: k };
}

export function createHud(city) {
  const map = buildMinimap(city);
  return {
    map,
    /** Draws every HUD layer over the finished world frame. */
    draw(ctx, game, width, height) {
      drawStatus(ctx, game);
      drawStars(ctx, game, width);
      drawMinimap(ctx, game, width, height, map);
      drawObjective(ctx, game, width);
      drawSubtitle(ctx, game, width, height);
      drawToast(ctx, game, width, height);
      drawDriving(ctx, game, width, height);
      drawPrompt(ctx, game, width, height);
      drawClock(ctx, game, width, height);
    },
  };
}

function drawStatus(ctx, game) {
  const p = game.player;
  const x = 26;
  const y = 24;
  ctx.save();
  // Money, in the top left over the health: the number a GTA player looks at first.
  ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(20, 16, 14, 0.55)';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, x + 2, y + 2);
  ctx.fillStyle = '#f2e9c8';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, x, y);

  // Health and armour, two thin bars under it.
  const barY = y + 42;
  ctx.fillStyle = 'rgba(18, 14, 12, 0.5)';
  roundRect(ctx, x, barY, 190, 11, 5);
  ctx.fill();
  ctx.fillStyle = p.health > 40 ? '#7fd07a' : '#e0574a';
  roundRect(ctx, x + 1.5, barY + 1.5, (186 * Math.max(0, p.health)) / 100, 8, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(18, 14, 12, 0.5)';
  roundRect(ctx, x, barY + 15, 190, 8, 4);
  ctx.fill();
  if (p.armor > 0) {
    ctx.fillStyle = '#6fa8d8';
    roundRect(ctx, x + 1.5, barY + 16.5, (186 * p.armor) / 100, 5, 3);
    ctx.fill();
  }

  // The gun in his hands.
  const weapon = WEAPONS[p.weapon];
  const held = p.arsenal[p.weapon];
  if (weapon && !weapon.melee) {
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(20, 16, 14, 0.6)';
    ctx.fillText(weapon.name, x + 1, barY + 33);
    ctx.fillStyle = '#e8dfc2';
    ctx.fillText(weapon.name, x, barY + 32);
    ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = p.reloading > 0 ? '#e0a04a' : '#f7f1da';
    ctx.fillText(p.reloading > 0 ? 'RELOADING' : `${held.mag} / ${held.reserve}`, x + 104, barY + 30);
  }
  ctx.restore();
}

function drawStars(ctx, game, width) {
  const level = game.wanted.level;
  const x = width - 34;
  const y = 34;
  ctx.save();
  for (let i = 0; i < WANTED.max; i += 1) {
    const cx = x - i * 30;
    const lit = i < level;
    star(ctx, cx, y, 11, lit ? (game.wanted.flash > 0 ? '#ffe9a8' : '#f2c14e') : 'rgba(240, 232, 210, 0.22)');
    if (lit) {
      ctx.shadowColor = '#f2c14e';
      ctx.shadowBlur = 12;
      star(ctx, cx, y, 11, '#f2c14e');
      ctx.shadowBlur = 0;
    }
  }
  if (level > 0 && game.wanted.reason) {
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 232, 190, 0.75)';
    ctx.fillText(game.wanted.reason.toUpperCase(), x, y + 22);
  }
  ctx.restore();
}

function star(ctx, cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** The minimap: a rounded window on the painted city, the player an arrow, everyone else a dot. */
function drawMinimap(ctx, game, width, height, map) {
  const size = Math.round(Math.min(196, width * 0.17));
  const x = 26;
  const y = height - size - 26;
  const viewWorld = 1500;
  const k = map.scale;

  ctx.save();
  roundRect(ctx, x, y, size, size, 16);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#20262f';
  ctx.fillRect(x, y, size, size);

  const p = game.player;
  const sx = (p.x - viewWorld / 2) * k;
  const sy = (p.y - viewWorld / 2) * k;
  const sw = viewWorld * k;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map.canvas, sx, sy, sw, sw, x, y, size, size);

  // Blips, in the same window's coordinates.
  const toMap = (wx, wy) => ({
    x: x + ((wx - (p.x - viewWorld / 2)) / viewWorld) * size,
    y: y + ((wy - (p.y - viewWorld / 2)) / viewWorld) * size,
  });

  for (const car of game.cars) {
    if (!car.police || car.health <= 0) continue;
    const b = toMap(car.x, car.y);
    if (b.x < x || b.x > x + size || b.y < y || b.y > y + size) continue;
    ctx.fillStyle = car.lightPhase > 0.5 ? '#6f9bff' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of game.officers) {
    const b = toMap(cop.x, cop.y);
    if (b.x < x || b.x > x + size || b.y < y || b.y > y + size) continue;
    ctx.fillStyle = '#7fa8ff';
    ctx.fillRect(b.x - 1.6, b.y - 1.6, 3.2, 3.2);
  }
  // The crew a job has sent after him, so the fight can be found on the map.
  for (const ped of game.peds) {
    if (!ped.hostile) continue;
    const b = toMap(ped.x, ped.y);
    if (b.x < x || b.x > x + size || b.y < y || b.y > y + size) continue;
    ctx.fillStyle = '#ff5a4a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const marker = missionMarker(game);
  if (marker) {
    const b = toMap(marker.x, marker.y);
    ctx.fillStyle = marker.kind === 'mission' ? '#ffd166' : '#ffb03a';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 22, 16, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  if (game.waypoint) {
    const b = toMap(game.waypoint.x, game.waypoint.y);
    if (b.x > x + 2 && b.x < x + size - 2 && b.y > y + 2 && b.y < y + size - 2) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The player: an arrow, pointing where he looks.
  const cx = x + size / 2;
  const cy = y + size / 2;
  const a = game.player.mode === 'car' && game.player.car ? game.player.car.angle : game.player.aim;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#f7f2e2';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 24, 18, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  ctx.strokeStyle = 'rgba(247, 238, 214, 0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, size, size, 16);
  ctx.stroke();

  // North, and the district he is standing in.
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(247, 238, 214, 0.85)';
  ctx.textAlign = 'center';
  ctx.fillText('N', x + size / 2, y + 13);
  const district = districtAt(game.city, p.x, p.y);
  ctx.textAlign = 'left';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(20, 16, 14, 0.6)';
  ctx.fillText(district.name.toUpperCase(), x + 1, y - 11);
  ctx.fillStyle = '#f4ead0';
  ctx.fillText(district.name.toUpperCase(), x, y - 12);
  ctx.restore();
}

function drawObjective(ctx, game, width) {
  const text = game.mission.active ? game.mission.objective : game.mission.index < 6 ? 'A job waits by the safehouse' : 'No jobs left on the board';
  ctx.save();
  ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 34;
  const x = width / 2 - w / 2;
  const y = 26;
  ctx.fillStyle = 'rgba(18, 14, 12, 0.55)';
  roundRect(ctx, x, y, w, 30, 8);
  ctx.fill();
  ctx.fillStyle = game.mission.active ? '#ffe9b0' : 'rgba(240, 232, 210, 0.8)';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, y + 16);
  ctx.restore();
}

function drawSubtitle(ctx, game, width, height) {
  const line = game.mission.subtitle;
  if (!line) return;
  ctx.save();
  ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  const w = Math.min(width - 80, ctx.measureText(line.text).width + 44);
  const x = width / 2 - w / 2;
  const y = height - 132;
  ctx.fillStyle = 'rgba(14, 12, 10, 0.68)';
  roundRect(ctx, x, y, w, 46, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(line.speaker.toUpperCase(), x + 18, y + 15);
  ctx.font = '400 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#f6efdc';
  ctx.fillText(line.text, x + 18, y + 32);
  ctx.restore();
}

function drawToast(ctx, game, width, height) {
  if (!game.toastText || game.toastFor <= 0) return;
  const alpha = Math.min(1, game.toastFor);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(game.toastText).width + 44;
  const top = height * 0.115;
  ctx.fillStyle = 'rgba(16, 12, 10, 0.55)';
  roundRect(ctx, width / 2 - w / 2, top, w, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(game.toastText, width / 2, top + 23);
  ctx.restore();
}

function drawDriving(ctx, game, width, height) {
  const p = game.player;
  if (p.mode !== 'car' || !p.car) return;
  const speed = Math.round(Math.abs(p.car.speed) * 0.42);
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(18, 14, 12, 0.55)';
  ctx.fillText(String(speed), width - 26 + 2, height - 44 + 2);
  ctx.fillStyle = '#f7f1da';
  ctx.fillText(String(speed), width - 26, height - 46);
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240, 232, 210, 0.75)';
  ctx.fillText('MPH', width - 26, height - 26);

  // The radio, low on the right.
  const station = game.radioName ?? '';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240, 232, 210, 0.9)';
  ctx.fillText(station, width - 26, height - 76);
  ctx.fillStyle = 'rgba(240, 232, 210, 0.55)';
  ctx.font = '400 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(game.radioMood ?? '', width - 26, height - 60);
  ctx.restore();
}

function drawPrompt(ctx, game, width, height) {
  const car = game.player.inCarPrompt;
  if (!car) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  const label = `E  ${car.kind === 'police' ? 'steal the cruiser' : 'get in'}`;
  ctx.fillStyle = 'rgba(16, 12, 10, 0.6)';
  const w = ctx.measureText(label).width + 30;
  roundRect(ctx, width / 2 - w / 2, height - 96, w, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height - 80);
  ctx.restore();
}

function drawClock(ctx, game, width, height) {
  const hour = Math.floor(game.clock % 24);
  const minute = Math.floor(((game.clock % 24) - hour) * 60);
  const text = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  ctx.save();
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(240, 232, 210, 0.8)';
  ctx.fillText(text, width - 26, height - 12);
  ctx.restore();
  void PALETTE;
  void WORLD;
}
