// The screens between the driving: the title over a painted Marisol skyline, the pause menu with
// the controls, the full map, and the two cards that end a run. All of it is drawn, like the game.
import { CONTROL_HELP } from './input.js';
import { RADIO } from './config.js';
import { roundRect } from './art.js';
import { missionSummary } from './missions.js';

/** A deterministic silhouette height, so the skyline is the same every time it is drawn. */
function skylineHeight(i) {
  const n = Math.sin(i * 12.9898) * 43758.5453;
  return 0.3 + (n - Math.floor(n)) * 0.7;
}

export function drawTitle(ctx, width, height, time, hasSave) {
  const horizon = height * 0.62;
  // Dusk over the sea.
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2b1c3f');
  sky.addColorStop(0.45, '#7b3a5c');
  sky.addColorStop(0.72, '#d96a54');
  sky.addColorStop(1, '#f2a35e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  // The sun, low and wide.
  const sunY = horizon - height * 0.1;
  const glow = ctx.createRadialGradient(width * 0.72, sunY, 10, width * 0.72, sunY, height * 0.45);
  glow.addColorStop(0, 'rgba(255, 226, 168, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 176, 110, 0.45)');
  glow.addColorStop(1, 'rgba(255, 150, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, horizon);
  ctx.fillStyle = '#ffe3a6';
  ctx.beginPath();
  ctx.arc(width * 0.72, sunY, height * 0.075, 0, Math.PI * 2);
  ctx.fill();

  // The skyline: two rows of blocks, the far one lighter, both with lit windows.
  for (let row = 0; row < 2; row += 1) {
    const base = horizon - row * 8;
    const alpha = row === 0 ? 0.55 : 0.9;
    const unit = width / 26;
    for (let i = 0; i < 26; i += 1) {
      const h = skylineHeight(i + row * 31) * height * (row === 0 ? 0.3 : 0.42);
      const x = i * unit + (row === 0 ? unit * 0.3 : 0);
      ctx.fillStyle = row === 0 ? `rgba(58, 38, 66, ${alpha})` : `rgba(32, 22, 40, ${alpha})`;
      ctx.fillRect(x, base - h, unit * 0.86, h);
      if (row === 1) {
        ctx.fillStyle = 'rgba(255, 206, 132, 0.55)';
        for (let wy = base - h + 8; wy < base - 6; wy += 12) {
          for (let wx = x + 5; wx < x + unit * 0.8 - 4; wx += 10) {
            if (Math.sin(wx * 3.1 + wy * 1.7 + i) > 0.35) ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
    }
  }

  // The sea, with the sun's road on it.
  const sea = ctx.createLinearGradient(0, horizon, 0, height);
  sea.addColorStop(0, '#8a4b57');
  sea.addColorStop(0.25, '#3c3a58');
  sea.addColorStop(1, '#1b1f34');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, width, height - horizon);
  for (let i = 0; i < 26; i += 1) {
    const y = horizon + i * ((height - horizon) / 26);
    const w = (width * 0.16) * (0.4 + i / 20);
    ctx.fillStyle = `rgba(255, 196, 132, ${0.16 - i * 0.004})`;
    ctx.fillRect(width * 0.72 - w / 2 + Math.sin(time * 1.4 + i) * 8, y, w, 2.4);
  }

  // Palms in front, dark against the sun.
  for (let i = 0; i < 3; i += 1) {
    const px = width * (0.08 + i * 0.06) + Math.sin(time * 0.6 + i) * 4;
    const py = height * 0.92;
    ctx.strokeStyle = 'rgba(24, 16, 22, 0.92)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + 16, py - height * 0.24, px + 6, py - height * 0.42);
    ctx.stroke();
    for (let f = 0; f < 8; f += 1) {
      const a = (f / 8) * Math.PI * 2 + 0.4;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px + 6, py - height * 0.42);
      ctx.quadraticCurveTo(
        px + 6 + Math.cos(a) * width * 0.05,
        py - height * 0.42 + Math.sin(a) * width * 0.03,
        px + 6 + Math.cos(a) * width * 0.09,
        py - height * 0.42 + Math.sin(a) * width * 0.05,
      );
      ctx.stroke();
    }
  }

  // The name.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 96px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(255, 140, 90, 0.55)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#fff4de';
  ctx.fillText('MARISOL', width / 2, height * 0.28);
  ctx.shadowBlur = 0;
  ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 236, 208, 0.9)';
  ctx.fillText('S U N   C O A S T   C R I M E', width / 2, height * 0.36);

  // The menu.
  const items = hasSave ? ['ENTER   new run', 'C   continue', 'M   map', 'ESC   controls'] : ['ENTER   start', 'M   map', 'ESC   controls'];
  ctx.font = '600 19px "Segoe UI", system-ui, sans-serif';
  items.forEach((item, i) => {
    ctx.fillStyle = i === 0 ? '#ffe9b0' : 'rgba(255, 240, 214, 0.75)';
    ctx.fillText(item, width / 2, height * 0.79 + i * 30);
  });
  ctx.font = '400 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 214, 0.55)';
  ctx.fillText('A city of nine blocks, six jobs and one courier who should have stayed home.', width / 2, height * 0.72);
}

export function drawPause(ctx, game, width, height) {
  ctx.fillStyle = 'rgba(12, 10, 14, 0.72)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '800 40px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff4de';
  ctx.fillText('PAUSED', 70, 60);
  ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 214, 0.75)';
  ctx.fillText('Esc to carry on', 70, 108);

  // Controls, two columns.
  ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
  CONTROL_HELP.forEach(([key, what], i) => {
    const col = i < 5 ? 0 : 1;
    const x = 70 + col * 300;
    const y = 160 + (i % 5) * 28;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(key, x, y);
    ctx.fillStyle = 'rgba(255, 244, 222, 0.8)';
    ctx.fillText(what, x + 96, y);
  });

  // The jobs, with their state.
  const list = missionSummary(game);
  ctx.font = '700 18px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff4de';
  ctx.fillText('THE BOARD', width - 400, 60);
  ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
  list.forEach((m, i) => {
    const y = 96 + i * 26;
    ctx.fillStyle = m.state === 'done' ? 'rgba(150, 220, 150, 0.9)' : m.state === 'active' ? '#ffd166' : m.state === 'next' ? '#fff4de' : 'rgba(255, 240, 214, 0.35)';
    ctx.fillText(`${m.title}`, width - 400, y);
    ctx.fillStyle = 'rgba(255, 240, 214, 0.45)';
    ctx.textAlign = 'right';
    ctx.fillText(m.state === 'done' ? 'done' : `$${m.reward}`, width - 70, y);
    ctx.textAlign = 'left';
  });

  ctx.font = '400 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 214, 0.55)';
  ctx.fillText(`Radio: ${RADIO[game.audio?.stationIndex ?? 0].name} — Q to change station, 0 to mute`, 70, height - 60);
}

export function drawMap(ctx, game, width, height) {
  ctx.fillStyle = 'rgba(10, 12, 16, 0.88)';
  ctx.fillRect(0, 0, width, height);
  const size = Math.min(width * 0.78, height * 0.82);
  const x = (width - size) / 2;
  const y = (height - size) / 2 + 10;
  const map = game.hudMap;
  if (map) {
    ctx.drawImage(map.canvas, x, y, size, size);
    ctx.strokeStyle = 'rgba(255, 236, 200, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    const k = size / game.city.size;
    const marker = game.markerForMap?.();
    if (marker) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x + marker.x * k, y + marker.y * k, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = game.player;
    ctx.save();
    ctx.translate(x + p.x * k, y + p.y * k);
    ctx.fillStyle = '#fff6e2';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff4de';
  ctx.fillText('MARISOL', width / 2, y - 44);
  ctx.font = '400 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 214, 0.6)';
  ctx.fillText('M or Esc to go back', width / 2, y + size + 14);
}

export function drawEndCard(ctx, width, height, title, subtitle, hint, tint = 'rgba(60, 12, 14, 0.55)') {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 82px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#fff0d8';
  ctx.fillText(title, width / 2, height * 0.42);
  ctx.shadowBlur = 0;
  ctx.font = '400 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 240, 220, 0.9)';
  ctx.fillText(subtitle, width / 2, height * 0.52);
  ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 226, 176, 0.95)';
  ctx.fillText(hint, width / 2, height * 0.62);
}

/** The little panel that says what a run has earned, over the end card. */
export function drawRunStats(ctx, game, width, height) {
  ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 244, 222, 0.8)';
  const jobs = game.mission.completed.length;
  ctx.fillText(`${jobs} job${jobs === 1 ? '' : 's'} done   ·   $${game.money.toLocaleString('en-US')}   ·   ${game.stats.kills} down`, width / 2, height * 0.69);
  void roundRect;
}
