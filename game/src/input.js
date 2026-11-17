// Keyboard + mouse state. Edge flags ("just pressed") are read by gameplay
// during the frame and cleared only at the END of the frame, after every
// system has had its chance to see them — a click that starts and ends
// inside one frame must still fire a shot.
export function createInput(canvas) {
  const input = {
    up: false, down: false, left: false, right: false,
    sprint: false, handbrake: false, interact: false,
    mouseX: 0, mouseY: 0, mouseDown: false,
    justInteract: false, justShoot: false, justPause: false, justEnter: false,
    virtual: null,
    aimWorldX: 0, aimWorldY: 0,
  };

  const keyMap = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'handbrake',
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') { input.interact = true; input.justInteract = true; }
    if (e.code === 'Enter') { input.justEnter = true; }
    if (e.code === 'Escape' || e.code === 'KeyP') { input.justPause = true; }
    const field = keyMap[e.code];
    if (field) { input[field] = true; if (e.code === 'Space') e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') input.interact = false;
    const field = keyMap[e.code];
    if (field) input[field] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    input.mouseDown = true;
    input.justShoot = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.endFrame = function endFrame() {
    input.justInteract = false;
    input.justShoot = false;
    input.justPause = false;
    input.justEnter = false;
  };

  // Effective (possibly virtualised) movement state for one frame.
  input.read = function read() {
    const v = input.virtual;
    if (!v) {
      return {
        up: input.up, down: input.down, left: input.left, right: input.right,
        sprint: input.sprint, handbrake: input.handbrake,
        shoot: input.mouseDown || input.justShoot,
        aimX: input.aimWorldX, aimY: input.aimWorldY,
      };
    }
    return {
      up: !!v.up, down: !!v.down, left: !!v.left, right: !!v.right,
      sprint: !!v.sprint, handbrake: !!v.handbrake,
      shoot: !!v.shoot,
      aimX: v.aimX ?? input.aimWorldX, aimY: v.aimY ?? input.aimWorldY,
    };
  };

  return input;
}
