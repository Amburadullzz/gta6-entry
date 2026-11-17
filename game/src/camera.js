// The camera: a soft chase that leans toward where the player is heading, pulls back a little at
// speed, and shakes when something loud happens nearby. It also converts between the world and the
// canvas, which the input uses to aim with the mouse.
import { CAMERA } from './config.js';

export function createCamera(width, height) {
  return { x: 0, y: 0, zoom: CAMERA.zoom, shake: 0, width, height, tx: 0, ty: 0 };
}

export function resizeCamera(camera, width, height) {
  camera.width = width;
  camera.height = height;
}

/** Points the camera at a target, easing in and clamping to the city so the sea never floats free. */
export function followTarget(camera, target, dt, city, wantedZoom) {
  const zoomTarget = wantedZoom ?? CAMERA.zoom;
  camera.zoom += (zoomTarget - camera.zoom) * Math.min(1, dt * 2.6);
  const lead = CAMERA.lookAhead;
  camera.tx = target.x + (target.vx ?? 0) * lead;
  camera.ty = target.y + (target.vy ?? 0) * lead;
  const k = Math.min(1, dt * CAMERA.follow);
  camera.x += (camera.tx - camera.x) * k;
  camera.y += (camera.ty - camera.y) * k;
  const halfW = camera.width / (2 * camera.zoom);
  const halfH = camera.height / (2 * camera.zoom);
  camera.x = clamp(camera.x, halfW - 60, city.size - halfW + 60);
  camera.y = clamp(camera.y, halfH - 60, city.size + 120 - halfH + 60);
  if (camera.width / camera.zoom > city.size + 240) camera.x = city.size / 2;
  camera.shake = Math.max(0, camera.shake - dt * CAMERA.shakeDecay);
}

export function addShake(camera, amount) {
  camera.shake = Math.min(26, camera.shake + amount);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Where a world point lands on the canvas, shake included. */
export function worldToScreen(camera, x, y) {
  const sx = (Math.random() * 2 - 1) * camera.shake;
  const sy = (Math.random() * 2 - 1) * camera.shake;
  return {
    x: (x - camera.x) * camera.zoom + camera.width / 2 + sx,
    y: (y - camera.y) * camera.zoom + camera.height / 2 + sy,
  };
}

/** The world point under a canvas pixel. */
export function screenToWorld(camera, sx, sy) {
  return {
    x: (sx - camera.width / 2) / camera.zoom + camera.x,
    y: (sy - camera.height / 2) / camera.zoom + camera.y,
  };
}

/** The world rectangle the camera can see, grown a little so nothing pops at the edges. */
export function viewBounds(camera, margin = 160) {
  const halfW = camera.width / (2 * camera.zoom) + margin;
  const halfH = camera.height / (2 * camera.zoom) + margin;
  return { x: camera.x - halfW, y: camera.y - halfH, w: halfW * 2, h: halfH * 2 };
}

export function inView(bounds, x, y, pad = 0) {
  return x > bounds.x - pad && x < bounds.x + bounds.w + pad && y > bounds.y - pad && y < bounds.y + bounds.h + pad;
}
