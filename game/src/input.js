// Keyboard + mouse input, with a scriptable autopilot override for poses/tests.
// The game reads `input` every step; autopilot (shots.js, tests) writes the
// same fields a human would, so poses are real play, not staged frames.
function createInput(canvas) {
  const input = {
    up: false, down: false, left: false, right: false,
    sprint: false, handbrake: false, fire: false,
    mouseX: 0, mouseY: 0, mouseDown: false,
    pressed: {}, // edge-triggered keys, consumed by the game each step
    autopilot: false,
  };
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'handbrake',
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const field = KEYMAP[e.code];
    if (field) { input[field] = true; e.preventDefault(); }
    input.pressed[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const field = KEYMAP[e.code];
    if (field) input[field] = false;
  });
  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = false;
    input.sprint = input.handbrake = false; input.mouseDown = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left; input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouseDown = true; input.fire = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { input.mouseDown = false; input.fire = false; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return input;
}

// Feed one synthetic key event (used by the autopilot and by tests).
function pressKey(input, code) { input.pressed[code] = true; }

export { createInput, pressKey };
