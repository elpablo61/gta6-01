// Crescent Bay — saves: 3 slots in versioned localStorage, one key per
// slot. A corrupt slot shows as corrupt and can be overwritten; it never
// crashes the title screen. Autosave after each mission writes to the
// active slot; manual save from the pause menu does the same.
import { S } from './state.js';

const VERSION = 1;
const PREFIX = 'crescentbay_save_';

export function slotKey(i) { return PREFIX + i; }

export function saveToSlot(i) {
  const data = {
    version: VERSION,
    missionIndex: S.missionIndex,
    completedMissions: S.completedMissions,
    cash: S.player.cash,
    date: new Date().toISOString(),
    dayTime: S.dayTime,
  };
  try {
    localStorage.setItem(slotKey(i), JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function readSlot(i) {
  let raw = null;
  try { raw = localStorage.getItem(slotKey(i)); } catch (e) { return { status: 'empty' }; }
  if (!raw) return { status: 'empty' };
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION || typeof data.missionIndex !== 'number') {
      return { status: 'corrupt' };
    }
    return { status: 'ok', ...data };
  } catch (e) {
    return { status: 'corrupt' };
  }
}

export function loadSlot(i) {
  const slot = readSlot(i);
  if (slot.status !== 'ok') return false;
  S.activeSlot = i;
  S.missionIndex = slot.missionIndex;
  S.completedMissions = slot.completedMissions;
  S.player.cash = slot.cash;
  S.dayTime = slot.dayTime || 10;
  return true;
}

export function autosave() {
  saveToSlot(S.activeSlot);
}

export function manualSave() {
  return saveToSlot(S.activeSlot);
}

export function listSlots() {
  return [0, 1, 2].map((i) => ({ slot: i, ...readSlot(i) }));
}
