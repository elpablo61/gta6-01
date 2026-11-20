// Crescent Bay — the police helicopter. Spawns at 3 stars and above
// (and by mission script in m9/m12). It flies, shadows Rook from above,
// faster than any car, and paints a spotlight on the ground. While the
// spotlight is on Rook, heat does NOT decay. It does not shoot. Rook can
// shoot it down: enough damage makes it smoke and retreat for 20 seconds,
// then it returns if wanted is still 3+. Below 3 stars it leaves.
import { S } from './state.js';
import { dist, clamp } from './random.js';

const HELI_HP = 100;
const RETREAT_SECONDS = 20;

export function updateHeli(dt) {
  const forced = S.mission && (S.mission.id === 'm9' || S.mission.id === 'm12');
  const want = S.stars >= 3 || forced;
  if (!want) {
    if (S.heli) S.heli.active = false;
    return;
  }
  if (!S.heli) {
    S.heli = {
      active: true, x: S.player.x, y: S.player.y - 300, hp: HELI_HP,
      retreating: false, retreatTimer: 0, onPlayer: true, rotor: 0, smoke: false,
    };
  }
  const h = S.heli;
  h.rotor += dt * 30;
  if (h.retreating) {
    h.retreatTimer -= dt;
    h.y -= 120 * dt;
    if (h.retreatTimer <= 0) {
      if (S.stars >= 3 || forced) {
        h.retreating = false; h.hp = HELI_HP; h.smoke = false;
        h.x = S.player.x; h.y = S.player.y - 300;
      } else h.active = false;
    }
    h.onPlayer = false;
    return;
  }
  h.active = true;
  // Shadow the player, faster than any car.
  const dx = S.player.x - h.x, dy = S.player.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = 560;
  h.x += (dx / d) * Math.min(sp * dt, d);
  h.y += (dy / d) * Math.min(sp * dt, d);
  h.onPlayer = dist(h.x, h.y, S.player.x, S.player.y) < 220;
  if (h.hp <= 0) {
    h.retreating = true;
    h.retreatTimer = RETREAT_SECONDS;
    h.smoke = true;
  }
}

export function damageHeli(n) {
  if (!S.heli || !S.heli.active || S.heli.retreating) return;
  S.heli.hp -= n;
  S.stats.heliHits += 1;
  if (S.heli.hp <= 40) S.heli.smoke = true;
  if (S.heli.hp <= 0) {
    S.heli.retreating = true;
    S.heli.retreatTimer = RETREAT_SECONDS;
    S.heli.smoke = true;
  }
}

export function heliVisible() {
  return S.heli && S.heli.active && !S.heli.retreating;
}
