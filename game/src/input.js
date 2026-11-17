// Keyboard and mouse, read once a frame: what is held down now, and what was pressed since the
// last frame (so a menu sees one Enter, not sixty). The bindings are the game's own and are listed
// on the pause screen; nothing else in the game reads a raw key code.
const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyE'],
  reload: ['KeyR'],
  handbrake: ['Space'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM', 'Tab'],
  radio: ['KeyQ'],
  horn: ['KeyH'],
  confirm: ['Enter', 'Space'],
  mute: ['Digit0'],
  help: ['F1'],
};

/** The list the pause screen prints, in the order it prints it. */
export const CONTROL_HELP = [
  ['W A S D', 'walk, drive'],
  ['Mouse', 'aim, click to shoot'],
  ['Shift', 'sprint'],
  ['E', 'enter or leave a car'],
  ['Space', 'handbrake (in a car)'],
  ['R', 'reload'],
  ['Q', 'change radio station'],
  ['M', 'map'],
  ['Esc', 'pause'],
  ['0', 'mute sound'],
];

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, wheel: 0 };

  const codeOf = (event) => event.code;

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    // Tab would move the focus off the canvas, and the arrows would scroll the page.
    if (code === 'Tab' || code.startsWith('Arrow') || code === 'Space') event.preventDefault();
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  });

  window.addEventListener('keyup', (event) => {
    held.delete(codeOf(event));
  });

  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.clientWidth;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.clientHeight;
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
    event.preventDefault();
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    mouse.wheel += Math.sign(event.deltaY);
    event.preventDefault();
  }, { passive: false });

  return {
    mouse,
    /** Held this frame. */
    down(action) {
      const codes = BINDINGS[action];
      if (!codes) return false;
      for (const code of codes) if (held.has(code)) return true;
      return false;
    },
    /** Pressed since the last frame; a press is consumed so two screens never both act on it. */
    pressed(action) {
      const codes = BINDINGS[action];
      if (!codes) return false;
      for (const code of codes) {
        if (pressed.has(code)) {
          pressed.delete(code);
          return true;
        }
      }
      return false;
    },
    /** The raw key set, for the rare screen that wants one key and no other. */
    raw: held,
    /** Shooting is the mouse button; Space is the handbrake and never a shot. */
    fire() {
      return mouse.down;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
      mouse.wheel = 0;
    },
  };
}
