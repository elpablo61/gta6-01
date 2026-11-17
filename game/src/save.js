import { SAVE_KEY, SAVE_VERSION } from './config.js';

// Save game: localStorage JSON with a version number. Autosaves on mission
// completion; manual save from the pause menu. A corrupt or old save starts
// a fresh game with a message instead of crashing.
export function saveGame(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: state.player.cash,
      x: state.player.x, y: state.player.y,
      health: state.player.health, ammo: state.player.ammo,
      missionIndex: state.missionIndex,
      completedMissions: state.completedMissions || [],
      wantedHeat: state.wantedHeat,
      timeOfDay: state.timeOfDay,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(state) {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!raw) return { ok: false, reason: 'empty' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!data || data.version !== SAVE_VERSION || typeof data.cash !== 'number') {
    return { ok: false, reason: 'version' };
  }
  state.player.cash = data.cash;
  state.player.x = data.x; state.player.y = data.y;
  state.player.health = data.health || 100;
  state.player.ammo = data.ammo || 60;
  state.missionIndex = data.missionIndex ?? -1;
  state.completedMissions = data.completedMissions || [];
  state.wantedHeat = data.wantedHeat || 0;
  state.timeOfDay = data.timeOfDay ?? 10;
  return { ok: true, data };
}

export function autosave(state) {
  return saveGame(state);
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
