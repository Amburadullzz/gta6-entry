// Marisol, built from a seed: nine blocks a side, a road down every grid line, six districts of
// its own, the beach and the sea to the south. The generator writes plain data — rectangles for
// walls, props, kerbside parking and the few landmarks the story uses — and the renderer and the
// physics read it; nothing here draws or moves.
import { DISTRICTS, PALETTE, WORLD } from './config.js';

/** Shop and hotel names painted on Marisol's own walls. */
const SIGNS = ['CLUB VELA', 'MIRAMAR', 'SOL', 'PESCA', 'HOTEL CORAL', 'RUTA 9', 'VELVET', 'DUNE', 'MAREA', 'ALACRAN', 'CASA LUZ', 'BAHIA'];
const WAREHOUSE_SIGNS = ['MUELLE 4', 'SAL', 'CARGA', 'FRIO'];
const MOTEL_SIGNS = ['DUNAS', 'SIESTA', 'PLAYA', 'VERANO'];

export function roadCenter(index) {
  return WORLD.road / 2 + index * WORLD.block;
}

export function citySize() {
  return WORLD.cells * WORLD.block + WORLD.road;
}

/** Which district a block belongs to: harbour north-west, downtown mid-west, the beach south. */
function districtOf(i, j, cells) {
  const half = Math.ceil(cells / 2);
  if (j >= cells - 2) return i < half ? DISTRICTS[4] : DISTRICTS[5];
  if (j <= 1) return i < half ? DISTRICTS[0] : DISTRICTS[1];
  return i < half ? DISTRICTS[2] : DISTRICTS[3];
}

/** How tall and how dense a block's buildings are, by the district that owns it. */
function blockStyle(look) {
  switch (look) {
    case 'downtown':
      return { split: [2, 3], gap: 12, height: [96, 188], wide: false, glass: 0.75, sign: 0.7 };
    case 'heights':
      return { split: [2, 4], gap: 11, height: [58, 120], wide: false, glass: 0.55, sign: 0.35 };
    case 'harbor':
      return { split: [2, 4], gap: 9, height: [26, 58], wide: false, glass: 0.2, sign: 0.3 };
    case 'industrial':
      return { split: [1, 3], gap: 16, height: [20, 38], wide: true, glass: 0.1, sign: 0.2 };
    case 'docks':
      return { split: [2, 3], gap: 14, height: [22, 44], wide: true, glass: 0.12, sign: 0.25 };
    default:
      return { split: [2, 4], gap: 10, height: [24, 50], wide: false, glass: 0.3, sign: 0.3 };
  }
}

/**
 * The whole city, from one random stream. Each block is either built on, a park, or sand; a
 * building carries its own footprint, height, walls, roof and windows, so the renderer only has to
 * extrude it and the physics only has to box it.
 */
export function generateCity(rng) {
  const cells = WORLD.cells;
  const size = citySize();
  const blocks = [];
  const buildings = [];
  const props = [];
  const parking = [];
  const landmarks = {};

  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const district = districtOf(i, j, cells);
      const x = roadCenter(i) + WORLD.road / 2;
      const y = roadCenter(j) + WORLD.road / 2;
      const w = WORLD.block - WORLD.road;
      const h = WORLD.block - WORLD.road;
      const sand = district.look === 'beach' && j === cells - 1;
      const park = !sand && district.look !== 'docks' && district.look !== 'industrial' && rng.chance(0.11);
      const block = { i, j, x, y, w, h, district, sand, park };
      blocks.push(block);

      if (sand) {
        buildBeach(rng, block, props);
      } else if (park) {
        buildPark(rng, block, props);
      } else {
        buildBlock(rng, block, buildings, props);
      }

      addKerbs(rng, block, props, parking, sand);
      if (i === 0 && j === 0) landmarks.harbour = { x: x + w / 2, y: y + h / 2 };
      if (district.look === 'downtown' && i === Math.floor(cells / 2) - 1 && j === 3) {
        // Club Vela is the doorway of the tallest building on its block, not the middle of a lawn.
        const tall = buildings.filter((b) => b.x > block.x && b.x < block.x + block.w && b.y > block.y && b.y < block.y + block.h)
          .sort((a, b) => b.height - a.height)[0];
        landmarks.club = tall ? { x: tall.x + tall.w / 2, y: tall.y + tall.h + 46 } : { x: x + w / 2, y: y + h / 2 };
      }
      if (district.look === 'docks' && !landmarks.docks) landmarks.docks = { x: x + w / 2, y: y + h / 2 };
      if (district.look === 'beach' && !landmarks.marina) landmarks.marina = { x: x + w / 2, y: y + h / 2 };
      if (district.look === 'industrial' && !landmarks.foundry) landmarks.foundry = { x: x + w / 2, y: y + h / 2 };
    }
  }

  // The safehouse and the job marker sit on the asphalt by the Old Harbor junction, so the player
  // never starts inside a wall.
  landmarks.safehouse = { x: roadCenter(1) + 45, y: roadCenter(2) + 150 };
  landmarks.beach = { x: roadCenter(cells - 4), y: roadCenter(cells - 1) + 120 };

  return {
    seed: rng.int(0, 2 ** 30),
    size,
    cells,
    blocks,
    buildings,
    props,
    parking,
    landmarks,
    /** The sea beyond the beach, and the sand it meets. */
    sea: { x: 0, y: size - 150, w: size, h: 1050 },
    beachRow: cells - 1,
  };
}

/** One built block: a grid of lots, each with a building on it, tall in the middle of town. */
function buildBlock(rng, block, buildings, props) {
  const style = blockStyle(block.district.look);
  const inset = WORLD.walk;
  const lx = block.x + inset;
  const ly = block.y + inset;
  const lw = block.w - inset * 2;
  const lh = block.h - inset * 2;
  const cols = style.wide ? 1 : rng.int(style.split[0], style.split[1]);
  const rows = style.wide ? rng.int(1, 2) : rng.int(style.split[0], style.split[1]);
  const lotW = (lw - style.gap * (cols - 1)) / cols;
  const lotH = (lh - style.gap * (rows - 1)) / rows;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // A lot is sometimes left empty: a forecourt, a car park, a strip of scrub.
      if (rng.chance(0.09)) continue;
      const pad = rng.range(2, 8);
      const bx = lx + c * (lotW + style.gap) + pad;
      const by = ly + r * (lotH + style.gap) + pad;
      const bw = lotW - pad * 2;
      const bh = lotH - pad * 2;
      if (bw < 40 || bh < 40) continue;

      const height = Math.round(rng.range(style.height[0], style.height[1]));
      const walls = rng.pick(PALETTE.buildings);
      const glass = rng.chance(style.glass);
      const sign = rng.chance(style.sign) && height > 70 ? rng.pick(style.wide ? WAREHOUSE_SIGNS : SIGNS) : null;
      buildings.push({
        x: bx,
        y: by,
        w: bw,
        h: bh,
        height,
        walls,
        roof: rng.pick(PALETTE.roofs),
        glass,
        neon: rng.chance(0.35) ? rng.pick(PALETTE.neon) : null,
        sign,
        windows: { cols: Math.max(2, Math.round(bw / 34)), rows: Math.max(2, Math.round(bh / 34)) },
        /** Rooftop clutter: a pool, a water tank, air units, a helipad. */
        roofTop: rng.pick(['units', 'tank', 'pool', 'plain', 'helipad']),
      });
    }
  }

  // A few street trees and lamps inside the block edge, so the pavement is never bare.
  for (let n = 0; n < rng.int(1, 3); n += 1) {
    props.push({ kind: rng.chance(0.6) ? 'palm' : 'tree', x: lx + rng.range(0, lw), y: ly + rng.range(0, lh), scale: rng.range(0.8, 1.25) });
  }
}

/** A park block: grass, a path cross, palms and a fountain at the middle. */
function buildPark(rng, block, props) {
  const cx = block.x + block.w / 2;
  const cy = block.y + block.h / 2;
  props.push({ kind: 'fountain', x: cx, y: cy, scale: 1 });
  for (let n = 0; n < rng.int(7, 12); n += 1) {
    props.push({ kind: rng.chance(0.5) ? 'palm' : 'tree', x: block.x + rng.range(40, block.w - 40), y: block.y + rng.range(40, block.h - 40), scale: rng.range(0.85, 1.35) });
  }
  for (let n = 0; n < rng.int(2, 4); n += 1) {
    props.push({ kind: 'bench', x: cx + rng.range(-140, 140), y: cy + rng.range(-140, 140), scale: 1 });
  }
  block.park = true;
}

/** The last row: sand, umbrellas, palms, a lifeguard hut. No walls. */
function buildBeach(rng, block, props) {
  for (let n = 0; n < rng.int(4, 8); n += 1) {
    props.push({ kind: 'palm', x: block.x + rng.range(30, block.w - 30), y: block.y + rng.range(20, block.h - 20), scale: rng.range(0.9, 1.4) });
  }
  for (let n = 0; n < rng.int(2, 5); n += 1) {
    props.push({ kind: 'umbrella', x: block.x + rng.range(40, block.w - 40), y: block.y + rng.range(60, block.h - 40), scale: 1 });
  }
  if (rng.chance(0.5)) props.push({ kind: 'lifeguard', x: block.x + rng.range(60, block.w - 60), y: block.y + 60, scale: 1 });
}

/** Kerbside clutter on the pavement, and the parked cars that line the kerb. */
function addKerbs(rng, block, props, parking, sand) {
  const sides = [
    { x: block.x + block.w / 2, y: block.y, axis: 'h', angle: 0 },
    { x: block.x + block.w / 2, y: block.y + block.h, axis: 'h', angle: Math.PI },
    { x: block.x, y: block.y + block.h / 2, axis: 'v', angle: Math.PI / 2 },
    { x: block.x + block.w, y: block.y + block.h / 2, axis: 'v', angle: -Math.PI / 2 },
  ];
  for (const side of sides) {
    if (rng.chance(0.75)) props.push({ kind: 'lamp', x: side.x, y: side.y, scale: 1 });
    if (rng.chance(0.35)) props.push({ kind: 'hydrant', x: side.x + rng.range(-90, 90), y: side.y + rng.range(-90, 90), scale: 1 });
    if (rng.chance(0.25)) props.push({ kind: 'dumpster', x: side.x + rng.range(-60, 60), y: side.y + rng.range(-60, 60), scale: 1 });
    if (sand) continue;
    // Parked cars nose along the kerb, one or two a side.
    const count = rng.int(0, 2);
    for (let n = 0; n < count; n += 1) {
      const along = rng.range(-block.w / 2 + 70, block.w / 2 - 70);
      const off = WORLD.road * 0.29;
      if (side.axis === 'h') {
        parking.push({ x: side.x + along, y: side.y + (side.y < block.y + block.h / 2 ? -off : off), angle: side.angle, model: rng.pick(['kestrel', 'meridian', 'bison', 'coral', 'mulo']) });
      } else {
        parking.push({ x: side.x + (side.x < block.x + block.w / 2 ? -off : off), y: side.y + along, angle: side.angle, model: rng.pick(['kestrel', 'meridian', 'bison', 'coral', 'mulo']) });
      }
    }
  }
}

/** True where a point lies on asphalt: within half a road of a grid line. */
export function isRoad(city, x, y) {
  const half = WORLD.road / 2;
  const nearX = Math.abs(x - Math.round((x - half) / WORLD.block) * WORLD.block - half) < half;
  const nearY = Math.abs(y - Math.round((y - half) / WORLD.block) * WORLD.block - half) < half;
  return nearX || nearY;
}

/** The district under a point, for the HUD's place name. */
export function districtAt(city, x, y) {
  for (const block of city.blocks) {
    if (x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h) return block.district;
  }
  return DISTRICTS[2];
}
