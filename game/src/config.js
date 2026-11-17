// Marisol: Sun Coast — every tuning number, colour and name in one place.
//
// The city is a square grid of blocks: WORLD.cells blocks a side, each WORLD.block wide, with a
// road of WORLD.road down every grid line. All distances are world pixels; the camera draws them
// at ZOOM, so a 1280x720 canvas shows a little under three blocks across.
//
// Nothing here reads the screen size: the renderer scales the world to whatever canvas it is given.

export const STEP = 1 / 60;

export const WORLD = {
  cells: 9,
  block: 640,
  road: 140,
  walk: 26,
  seedName: 'marisol-sun-coast',
};

/** Width of the playable square, edge of the outer road to edge of the outer road. */
export const WORLD_SPAN = WORLD.cells * WORLD.block;

export const CAMERA = {
  zoom: 1.16,
  zoomDriving: 0.94,
  zoomChase: 0.86,
  follow: 6.5,
  lookAhead: 0.34,
  shakeDecay: 7,
};

export const PLAYER = {
  radius: 11,
  walk: 168,
  sprint: 286,
  accel: 1900,
  friction: 12,
  health: 100,
  armor: 0,
  enterRange: 78,
  invulnAfterHit: 0.35,
};

export const VEHICLE = {
  maxSpeed: 470,
  reverseSpeed: 165,
  accel: 300,
  brake: 620,
  drag: 0.72,
  steer: 2.35,
  steerLowSpeed: 3.1,
  handbrakeDrag: 3.4,
  grip: 7.5,
  health: 100,
  ramDamage: 0.22,
};

export const WEAPONS = {
  fist: { name: 'Fists', damage: 9, rate: 0.42, range: 46, melee: true },
  vela: { name: 'Vela 9', damage: 24, rate: 0.2, speed: 1500, spread: 0.024, mag: 12, reload: 1.15, tracer: '#ffd98a' },
  brisa: { name: 'Brisa SMG', damage: 15, rate: 0.075, speed: 1620, spread: 0.062, mag: 30, reload: 1.7, tracer: '#ffe6a8' },
  costa: { name: 'Costa 12', damage: 62, rate: 0.85, speed: 1250, spread: 0.1, mag: 6, reload: 2.1, pellets: 6, tracer: '#ffcf7a' },
};

export const WANTED = {
  max: 5,
  /** Heat gained by a crime, and what each star needs. */
  stars: [0, 90, 210, 380, 620, 940],
  /** Heat lost each second with no crime in sight of an officer. */
  cool: 26,
  coolHidden: 52,
  /** How far a crime is noticed: gunfire, a body, a stolen car. */
  witnessRange: 620,
};

export const TRAFFIC = {
  max: 28,
  lane: 34,
  speed: 132,
  speedJitter: 42,
  spawnRange: 1320,
  despawnRange: 2100,
  stopDistance: 96,
  models: ['kestrel', 'meridian', 'bison', 'coral', 'taxi', 'mulo'],
};

export const PEDS = {
  max: 70,
  walk: 62,
  flee: 148,
  spawnRange: 1250,
  despawnRange: 1750,
};

export const POLICE = {
  carsMax: 6,
  officersMax: 10,
  carSpeed: 320,
  officerSpeed: 120,
  officerSpeedChase: 172,
  shootRange: 330,
  spawnRange: 1250,
  despawnRange: 2000,
  /** Seconds between police waves at each star level. */
  wave: [0, 5.5, 4.6, 3.8, 3.1, 2.4],
};

export const ECONOMY = {
  startMoney: 240,
  pedDrop: 18,
  carSale: 120,
  missionBase: 350,
};

/** Sun-soaked palette: warm asphalt, cream stucco, coral and teal, palms. */
export const PALETTE = {
  asphalt: '#33323a',
  asphaltDark: '#2b2a31',
  lane: '#e2d9b6',
  walk: '#d6cab0',
  walkEdge: '#a99b7f',
  curb: '#8e8371',
  grass: '#7c9c56',
  grassDark: '#6a8a49',
  sand: '#e8d4a4',
  sandDark: '#d3bd8a',
  water: '#1d7d8a',
  waterDeep: '#125a68',
  foam: '#bfe6e2',
  shadow: 'rgba(38, 26, 20, 0.22)',
  sun: 'rgba(255, 196, 120, 0.16)',
  night: 'rgba(22, 32, 62, 0.34)',
  buildings: ['#efe1c8', '#e9c9a8', '#d9a98f', '#e2b7a2', '#c9d6c2', '#bcd2d3', '#e8dcc0', '#d8c2b0'],
  roofs: ['#b9a891', '#a89b86', '#c2b49c', '#9d9382', '#b3a58e'],
  glass: '#8fb6bd',
  neon: ['#ff7d6b', '#ffd166', '#5fd6c6', '#ff9ecb', '#8ad2ff'],
  cars: ['#e2574c', '#f0c05a', '#4f9fb5', '#e8e3d6', '#6a6f7a', '#9a5f8f', '#4f8f6a', '#d97f3f'],
  pedShirts: ['#e86a5c', '#5aa9c9', '#f2d06b', '#8fc98a', '#c98ab0', '#f0f0e6', '#7a6fb0'],
  skin: ['#8d5a3b', '#b47b52', '#6b4229', '#d9a273', '#a86b45'],
  police: '#e9eef2',
  policeStripe: '#2a4a86',
};

export const DISTRICTS = [
  { name: 'Old Harbor', row: [0, 2], look: 'harbor' },
  { name: 'Foundry Row', row: [0, 2], look: 'industrial' },
  { name: 'Neon Mile', row: [3, 5], look: 'downtown' },
  { name: 'Coral Heights', row: [3, 5], look: 'heights' },
  { name: 'Verano Beach', row: [6, 8], look: 'beach' },
  { name: 'Saltmarsh Docks', row: [6, 8], look: 'docks' },
];

export const RADIO = [
  { name: 'Sol FM 101.2', mood: 'sunset synth', root: 174.6, scale: [0, 3, 5, 7, 10] },
  { name: 'Costa Bass 88.9', mood: 'coastal bass', root: 130.8, scale: [0, 2, 3, 7, 9] },
  { name: 'Static Prayer', mood: 'slow tide', root: 98, scale: [0, 3, 7, 10, 14] },
  { name: 'Ruta 9', mood: 'dust road', root: 146.8, scale: [0, 2, 5, 7, 9] },
];

export const SAVE_KEY = 'marisol.suncoast.save.v1';
export const BEST_KEY = 'marisol.suncoast.best.v1';
