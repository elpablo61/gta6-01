import { SAVE_KEY, SAVE_VERSION } from './config.js';

// Save format v1: cash, position, vehicle, missions done, current mission,
// wanted heat, health, ammo, clock. Validated on load: a wrong version or
// broken JSON starts a fresh game with a message — never a crash.
function saveGame(G) {
  const p = G.player;
  const data = {
    version: SAVE_VERSION,
    cash: p.cash,
    x: p.inCar ? p.inCar.x : p.x,
    y: p.inCar ? p.inCar.y : p.y,
    inCarType: p.inCar ? p.inCar.type : null,
    carDamage: p.inCar ? p.inCar.damage : 0,
    health: p.health,
    ammo: p.ammo,
    missionsDone: [...G.save.missionsDone],
    missionId: G.mission && G.mission.active ? G.mission.def.id : null,
    missionStage: G.mission && G.mission.active ? G.mission.stageI : 0,
    heat: G.wanted.heat,
    clockH: G.clockH,
    kills: p.kills,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function loadGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return { ok: false, reason: 'storage unavailable' };
  }
  if (!raw) return { ok: false, reason: 'no save' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt', corrupt: true };
  }
  if (!data || data.version !== SAVE_VERSION || typeof data.cash !== 'number') {
    return { ok: false, reason: 'old version', corrupt: true };
  }
  return { ok: true, data };
}

function autosave(G) {
  saveGame(G);
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export { saveGame, loadGame, autosave, clearSave };
