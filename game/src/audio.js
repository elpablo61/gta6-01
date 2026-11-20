// Crescent Bay — all sound is synthesized WebAudio: no audio files.
// The radio is three distinct procedural loops; R cycles stations.
// A single scheduler tick schedules short notes ahead of time.
import { S } from './state.js';

export const STATIONS = [
  { name: 'Bay FM', desc: 'synthwave' },
  { name: 'Harbor Jazz', desc: 'slow swing' },
  { name: 'Crescent Rock', desc: 'driving rock' },
];

let ctx = null;
let master = null;
let musicGain = null;
let nextNoteAt = 0;
let step = 0;
let started = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (!started && ctx) {
    started = true;
    nextNoteAt = ctx.currentTime + 0.1;
    step = 0;
    setInterval(scheduleRadio, 90);
  }
}

function note(freq, at, dur, type, gain, dest) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g);
  g.connect(dest || musicGain);
  o.start(at);
  o.stop(at + dur + 0.05);
}

// One 8th-note step of the current station's loop.
function scheduleRadio() {
  if (!ctx || S.mode !== 'playing' || S.paused) return;
  while (nextNoteAt < ctx.currentTime + 0.25) {
    const st = S.radioStation;
    const t = nextNoteAt;
    const s8 = step % 8;
    const bar = Math.floor(step / 8) % 4;
    if (st === 0) { // Bay FM — synthwave: driving bass + bright lead
      const bassNotes = [55, 55, 65.41, 49];
      note(bassNotes[bar], t, 0.22, 'sawtooth', 0.5);
      if (s8 === 0 || s8 === 3 || s8 === 6) note(220 * (bar === 3 ? 0.89 : 1), t, 0.3, 'square', 0.12);
      if (s8 === 4) note(440, t, 0.18, 'triangle', 0.14);
    } else if (st === 1) { // Harbor Jazz — slow swing: soft chords
      if (s8 === 0) { note(130.81, t, 0.7, 'sine', 0.3); note(164.81, t, 0.7, 'sine', 0.2); }
      if (s8 === 3) note(196, t, 0.5, 'sine', 0.18);
      if (s8 === 5) note(246.94, t, 0.4, 'triangle', 0.12);
      if (s8 === 2 || s8 === 6) note(110, t, 0.3, 'sine', 0.25);
    } else { // Crescent Rock — driving rock riff
      const riff = [110, 110, 130.81, 110, 98, 110, 146.83, 130.81];
      note(riff[s8], t, 0.16, 'sawtooth', 0.35);
      if (s8 === 0 || s8 === 4) note(55, t, 0.2, 'square', 0.3);
      if (s8 === 2 || s8 === 6) note(880, t, 0.08, 'square', 0.05);
    }
    step += 1;
    nextNoteAt += 0.21;
  }
}

export function cycleRadio() {
  S.radioStation = (S.radioStation + 1) % STATIONS.length;
  S.stats.radioCycles += 1;
  step = 0;
  return STATIONS[S.radioStation].name;
}
export function stationName() { return STATIONS[S.radioStation].name; }

// Short one-shot effects.
export function sfx(kind) {
  if (!ctx || !master) return;
  try {
    const t = ctx.currentTime;
    if (kind === 'shoot') note(900 + Math.random() * 300, t, 0.08, 'square', 0.25, master);
    else if (kind === 'hit') note(160, t, 0.12, 'sawtooth', 0.3, master);
    else if (kind === 'crash') note(70, t, 0.25, 'sawtooth', 0.4, master);
    else if (kind === 'pickup') { note(660, t, 0.1, 'sine', 0.3, master); note(990, t + 0.09, 0.14, 'sine', 0.3, master); }
    else if (kind === 'mission') { note(523, t, 0.15, 'triangle', 0.3, master); note(784, t + 0.13, 0.2, 'triangle', 0.3, master); }
    else if (kind === 'siren') note(700 + Math.sin(t * 6) * 200, t, 0.2, 'sine', 0.08, master);
  } catch (e) { /* audio is best-effort */ }
}
