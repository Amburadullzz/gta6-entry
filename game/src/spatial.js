// A uniform grid over the city's buildings, so a bullet, a car corner or a walking body only ever
// tests the walls that are actually near it. The grid is built once; walls never move.
const CELL = 220;

export function buildWallIndex(buildings) {
  let maxX = 0;
  let maxY = 0;
  for (const b of buildings) {
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const cols = Math.ceil(maxX / CELL) + 1;
  const rows = Math.ceil(maxY / CELL) + 1;
  const buckets = new Array(cols * rows);
  for (const b of buildings) {
    const c0 = Math.max(0, Math.floor(b.x / CELL));
    const c1 = Math.min(cols - 1, Math.floor((b.x + b.w) / CELL));
    const r0 = Math.max(0, Math.floor(b.y / CELL));
    const r1 = Math.min(rows - 1, Math.floor((b.y + b.h) / CELL));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const key = r * cols + c;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(b);
      }
    }
  }
  return { cell: CELL, cols, rows, buckets };
}

/** Every wall whose cell touches the box, without repeats. */
export function wallsNear(index, x, y, w, h) {
  const out = [];
  const c0 = Math.max(0, Math.floor(x / index.cell));
  const c1 = Math.min(index.cols - 1, Math.floor((x + w) / index.cell));
  const r0 = Math.max(0, Math.floor(y / index.cell));
  const r1 = Math.min(index.rows - 1, Math.floor((y + h) / index.cell));
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const bucket = index.buckets[r * index.cols + c];
      if (!bucket) continue;
      for (const b of bucket) {
        if (out.indexOf(b) === -1) out.push(b);
      }
    }
  }
  return out;
}

/**
 * Pushes a circle out of the walls it overlaps and says whether it touched one. The smallest
 * push wins, so a body slides along a wall instead of sticking to it.
 */
export function pushOutOfWalls(index, body, radius) {
  let hit = false;
  const near = wallsNear(index, body.x - radius, body.y - radius, radius * 2, radius * 2);
  for (const b of near) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      body.x = nx + (dx / d) * radius;
      body.y = ny + (dy / d) * radius;
    } else {
      // Dead centre: shove out along the shallowest side of the box.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const up = body.y - b.y;
      const down = b.y + b.h - body.y;
      const min = Math.min(left, right, up, down);
      if (min === left) body.x = b.x - radius;
      else if (min === right) body.x = b.x + b.w + radius;
      else if (min === up) body.y = b.y - radius;
      else body.y = b.y + b.h + radius;
    }
  }
  return hit;
}

/** True when a point sits inside any wall, for bullets and line-of-sight checks. */
export function pointInWall(index, x, y) {
  const near = wallsNear(index, x, y, 0, 0);
  for (const b of near) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** Whether a straight line crosses a wall, sampled: cheap and good enough for a sightline. */
export function lineBlocked(index, x0, y0, x1, y1, steps = 8) {
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    if (pointInWall(index, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}
