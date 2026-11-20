// Crescent Bay — keyboard + mouse input. One job: turn DOM events into a
// small state object the player and autopilot both read. Edge flags
// (pressed this frame) are cleared at the end of each frame by main.
export const keys = {};
export const mouse = { x: 0, y: 0, down: false, pressed: false, wx: 0, wy: 0 };
export const pressed = {}; // key -> true only on the frame it went down

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyQ: 'cycleWeapon',
  KeyR: 'radio',
  Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3',
  Escape: 'pause',
  Enter: 'accept',
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const name = KEYMAP[e.code];
    if (name) {
      if (!keys[name]) pressed[name] = true;
      keys[name] = true;
      if (name !== 'accept') e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const name = KEYMAP[e.code];
    if (name) keys[name] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function endFrameInput() {
  for (const k of Object.keys(pressed)) delete pressed[k];
  mouse.pressed = false;
}

// Test / autopilot helpers: pretend a key was pressed this frame.
export function fakePress(name) { pressed[name] = true; keys[name] = true; }
export function fakeRelease(name) { keys[name] = false; }
