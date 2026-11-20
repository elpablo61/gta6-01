// Crescent Bay — radio stations. The audio engine owns the loops;
// this module owns the station list, the cycle action and the HUD
// equalizer state. Station 1 (Bay FM) is the default on New Game.
import { S } from './state.js';
import { STATIONS, cycleRadio, stationName } from './audio.js';

export { STATIONS, stationName };

export function radioCycle() {
  const name = cycleRadio();
  return name;
}

export function radioEqBars() {
  // Animated equalizer: 5 bars driven by the clock, different per station.
  const t = S.time * (S.radioStation === 1 ? 2.2 : S.radioStation === 2 ? 6 : 4.5);
  const bars = [];
  for (let i = 0; i < 5; i++) {
    bars.push(0.3 + 0.7 * Math.abs(Math.sin(t + i * 1.3)));
  }
  return bars;
}
