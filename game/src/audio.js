// All sound is synthesized with WebAudio — no audio files, no network.
// Audio only starts after the first user gesture (autoplay policy).
function playSiren(audio) {
  if (!audio.ctx || audio.sirenOn) return;
  audio.sirenOn = true;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'sine'; o.frequency.value = 700;
  g.gain.value = 0.05;
  o.connect(g); g.connect(audio.master);
  o.start();
  audio.sirenOsc = o; audio.sirenGain = g;
  audio.sirenPhase = 0;
}

function playGunshot(audio) {
  if (!audio.ctx) return;
  const dur = 0.12;
  const buf = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  const g = audio.ctx.createGain(); g.gain.value = 0.25;
  const f = audio.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
  src.connect(f); f.connect(g); g.connect(audio.master);
  src.start();
}

function startMusicLoop(audio) {
  if (!audio.ctx || audio.musicOn) return;
  audio.musicOn = true;
  // A slow, moody bass loop: A minor, one note per beat, scheduled ahead.
  const notes = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  let step = 0;
  const tick = () => {
    if (!audio.ctx || !audio.musicOn) return;
    const t = audio.ctx.currentTime + 0.05;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = notes[step % notes.length];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(audio.master);
    o.start(t); o.stop(t + 0.6);
    step++;
    audio.musicTimer = setTimeout(tick, 600);
  };
  tick();
}

function playPickup(audio) {
  if (!audio.ctx) return;
  blip(audio, 880, 0.09, 0.12);
  setTimeout(() => blip(audio, 1320, 0.09, 0.1), 70);
}

function playClick(audio) {
  if (!audio.ctx) return;
  blip(audio, 660, 0.05, 0.08);
}

function playCrash(audio, hard) {
  if (!audio.ctx) return;
  const dur = hard ? 0.3 : 0.15;
  const buf = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.7;
  const src = audio.ctx.createBufferSource(); src.buffer = buf;
  const f = audio.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = audio.ctx.createGain(); g.gain.value = hard ? 0.4 : 0.2;
  src.connect(f); f.connect(g); g.connect(audio.master);
  src.start();
}

function blip(audio, freq, dur, vol) {
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + dur);
  o.connect(g); g.connect(audio.master);
  o.start(); o.stop(audio.ctx.currentTime + dur);
}

function createAudio() {
  const audio = { ctx: null, master: null, sirenOn: false, musicOn: false, engineOsc: null };
  audio.ensure = () => {
    if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    try {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
    } catch { audio.ctx = null; }
  };
  audio.setEngine = (speed01) => {
    if (!audio.ctx) return;
    if (!audio.engineOsc) {
      const o = audio.ctx.createOscillator();
      const g = audio.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 60;
      g.gain.value = 0.0;
      const f = audio.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      o.connect(f); f.connect(g); g.connect(audio.master);
      o.start();
      audio.engineOsc = o; audio.engineGain = g;
    }
    audio.engineOsc.frequency.value = 55 + speed01 * 130;
    audio.engineGain.gain.value = speed01 > 0.02 ? 0.03 + speed01 * 0.04 : 0.0;
  };
  audio.updateSiren = (dt) => {
    if (!audio.sirenOsc) return;
    audio.sirenPhase = (audio.sirenPhase || 0) + dt;
    const up = Math.sin(audio.sirenPhase * 4.4) > 0;
    audio.sirenOsc.frequency.value = up ? 880 : 660;
    audio.sirenGain.gain.value = 0.035;
  };
  audio.stopSiren = () => {
    if (audio.sirenOsc) { try { audio.sirenOsc.stop(); } catch { /* already stopped */ } }
    audio.sirenOsc = null; audio.sirenOn = false;
  };
  return audio;
}

export { createAudio, playSiren, playGunshot, startMusicLoop, playPickup, playClick, playCrash };
