// The save file: what Tavo owns, where he stands and how far the story has gone, kept in the
// browser's own storage so closing the tab is not the end of the run. Nothing is saved while a
// job is running, so a reload never leaves a mission half-finished.
import { SAVE_KEY } from './config.js';
import { MISSIONS } from './missions.js';

export function saveGame(game) {
  if (game.mission.active) return false;
  const p = game.player;
  const data = {
    version: 1,
    money: game.money,
    missionIndex: game.mission.index,
    completed: game.mission.completed,
    clock: game.clock,
    kills: game.stats.kills,
    player: {
      x: Math.round(p.x),
      y: Math.round(p.y),
      health: Math.round(p.health),
      armor: Math.round(p.armor),
      weapon: p.weapon,
      arsenal: p.arsenal,
    },
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || typeof data.money !== 'number') return null;
    if (!data.player || typeof data.player.x !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // A private window has no storage: nothing to clear.
  }
}

/** Applies a save to a fresh world. */
export function applySave(game, data) {
  const p = game.player;
  game.money = data.money ?? game.money;
  game.clock = data.clock ?? game.clock;
  game.mission.index = Math.min(MISSIONS.length, data.missionIndex ?? 0);
  game.mission.completed = Array.isArray(data.completed) ? data.completed : [];
  game.stats.kills = data.kills ?? 0;
  p.x = data.player.x;
  p.y = data.player.y;
  p.health = Math.max(20, data.player.health ?? 100);
  p.armor = data.player.armor ?? 0;
  if (data.player.weapon && p.arsenal[data.player.weapon]) p.weapon = data.player.weapon;
  if (data.player.arsenal) {
    for (const key of Object.keys(p.arsenal)) {
      if (data.player.arsenal[key]) p.arsenal[key] = { ...p.arsenal[key], ...data.player.arsenal[key] };
    }
  }
  game.camera.x = p.x;
  game.camera.y = p.y;
}
