// Synthesised WebAudio: no audio files, nothing fetched. Everything starts
// only after the first user gesture (New Game click), so it can never throw
// an autoplay error on load.
export function playSiren(ctx) { sirenBurst(ctx); }
export function playGunshot(ctx) { gunshotBurst(ctx); }
export function startMusicLoop(ctx) { musicLoop(ctx); }

function ensureAudio(state) {
  if (state.audioCtx) return state.audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    state.audioCtx = new AC();
    state.audioMaster = state.audioCtx.createGain();
    state.audioMaster.gain.value = 0.22;
    state.audioMaster.connect(state.audioCtx.destination);
  } catch {
    state.audioCtx = null;
  }
  return state.audioCtx;
}

function blip(state, freq, dur, type, vol, slideTo) {
  const ctx = ensureAudio(state);
  if (!ctx || !state.audioMaster) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain); gain.connect(state.audioMaster);
    osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
  } catch { /* audio is cosmetic; never break the game */ }
}

function noiseBurst(state, dur, vol, filterFreq) {
  const ctx = ensureAudio(state);
  if (!ctx || !state.audioMaster) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = filterFreq || 1800;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter); filter.connect(gain); gain.connect(state.audioMaster);
    src.start();
  } catch { /* cosmetic */ }
}

function sirenBurst(state) {
  if (!state || state.sirenAt && performance.now() - state.sirenAt < 900) return;
  state.sirenAt = performance.now();
  blip(state, 700, 0.42, 'sine', 0.12, 1050);
  setTimeout(() => blip(state, 1050, 0.42, 'sine', 0.12, 700), 420);
}

function gunshotBurst(state) {
  noiseBurst(state, 0.14, 0.4, 2400);
  blip(state, 160, 0.09, 'square', 0.16, 55);
}

function musicLoop(state) {
  const ctx = ensureAudio(state);
  if (!ctx || state.musicOn) return;
  state.musicOn = true;
  const bass = [55, 55, 65.4, 49];
  let step = 0;
  const tick = () => {
    if (!state.musicOn) return;
    if (state.mode === 'playing') {
      blip(state, bass[step % bass.length], 0.5, 'triangle', 0.1);
      if (step % 2 === 0) blip(state, bass[step % bass.length] * 4, 0.18, 'sine', 0.045);
    }
    step++;
    state.musicTimer = setTimeout(tick, 520);
  };
  tick();
}

export function playPickup(state) { blip(state, 880, 0.12, 'sine', 0.18, 1320); }
export function playClick(state) { blip(state, 660, 0.06, 'square', 0.1); }
export function playCrash(state) { noiseBurst(state, 0.25, 0.35, 900); }
export function playEngine(state, speedRatio) {
  if (!state || !state.audioCtx || state.mode !== 'playing') return;
  if (state.engineAt && performance.now() - state.engineAt < 120) return;
  state.engineAt = performance.now();
  blip(state, 60 + speedRatio * 90, 0.1, 'sawtooth', 0.035);
}
export function stopMusic(state) {
  state.musicOn = false;
  if (state.musicTimer) clearTimeout(state.musicTimer);
}
